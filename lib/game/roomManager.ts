/**
 * roomManager.ts
 * 
 * 게임의 핵심 비즈니스 로직을 담당하는 매니저 모듈입니다.
 * 방 생성, 플레이어 관리, 게임 진행 규칙(단어 배정, 턴 관리, 정답 판정 등) 및
 * Redis를 이용한 상태 유지 기능을 포함합니다.
 */

import {
  RoomState,
  Player,
  ChatMessage,
  EndCondition,
  ServerToClientMessage,
} from "./types";
import { redis } from "@/lib/redis";

// ─────────────────────────────────────────────
// Redis 키 및 TTL(Time-To-Live) 설정
// ─────────────────────────────────────────────

const ROOM_TTL = 3600;          // 대기 중 혹은 게임 중인 방: 1시간 유지
const FINISHED_ROOM_TTL = 300;  // 종료된 방: 5분 후 삭제 (결과 확인용)

/** Redis에서 특정 방의 상태를 가져옵니다. */
async function getRoomFromRedis(roomId: string): Promise<RoomState | null> {
  return await redis.get<RoomState>(`room:${roomId}`);
}

/** Redis에 방 상태를 저장합니다. 방의 상태에 따라 TTL을 다르게 설정합니다. */
async function saveRoom(roomId: string, room: RoomState): Promise<void> {
  const ttl = room.status === "finished" ? FINISHED_ROOM_TTL : ROOM_TTL;
  await redis.set(`room:${roomId}`, room, { ex: ttl });
}

/** 방 관련 데이터(상태 및 채팅)를 Redis에서 삭제합니다. */
async function deleteRoom(roomId: string): Promise<void> {
  await redis.del(`room:${roomId}`, `chat:${roomId}`);
}

/** Redis에서 해당 방의 채팅 메시지 목록을 가져옵니다. */
async function getChatMessages(roomId: string): Promise<ChatMessage[]> {
  return (await redis.get<ChatMessage[]>(`chat:${roomId}`)) || [];
}

/** 채팅 메시지를 Redis에 저장합니다. 최근 200개까지만 유지합니다. */
async function saveChatMessages(roomId: string, messages: ChatMessage[]): Promise<void> {
  const trimmed = messages.slice(-200); 
  const room = await getRoomFromRedis(roomId);
  const ttl = room?.status === "finished" ? FINISHED_ROOM_TTL : ROOM_TTL;
  await redis.set(`chat:${roomId}`, trimmed, { ex: ttl });
}

// ─────────────────────────────────────────────
// 헬퍼 함수
// ─────────────────────────────────────────────

async function getRoom(roomId: string): Promise<RoomState> {
  const room = await getRoomFromRedis(roomId);
  if (!room) throw new Error(`Room not found: ${roomId}`);
  return room;
}

function getPlayer(room: RoomState, playerId: string): Player {
  const player = room.players.find((pl) => pl.id === playerId);
  if (!player) throw new Error(`Player not found: ${playerId}`);
  return player;
}

/** 방의 안전한 복사본을 반환합니다. 모든 플레이어로부터 `secretWord` 필드를 제거합니다. */
function publicRoom(room: RoomState): RoomState {
  return {
    ...room,
    players: room.players.map(({ secretWord: _w, ...rest }) => rest as Player),
  };
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** 시스템 메시지 추가 헬퍼 */
async function addSystemMessage(roomId: string, text: string): Promise<void> {
  const messages = await getChatMessages(roomId);
  const sysMsg: ChatMessage = {
    id: generateId(),
    playerId: "system",
    text,
    kind: "system",
    timestamp: Date.now(),
  };
  messages.push(sysMsg);
  await saveChatMessages(roomId, messages);
}

/** 다음 플레이어의 차례로 넘깁니다. (심판 및 이미 탈락한 플레이어는 건너뜁니다) */
function nextTurn(room: RoomState): RoomState {
  const players = room.players;
  let newIndex = room.turnIndex;
  let round = room.round;

  // 전체 플레이어 수만큼 순회하며 유효한 다음 차례 탐색
  for (let i = 0; i < players.length; i++) {
    newIndex = (newIndex + 1) % players.length;

    // 인덱스가 0으로 돌아오면 라운드 증가
    if (newIndex === 0) round++;

    const p = players[newIndex];
    // 심판이 아니고 생존해 있는 플레이어인 경우에만 차례 배정
    if (!p.isJudge && p.isAlive) {
      return { ...room, turnIndex: newIndex, round, turnActionUsed: null };
    }
  }

  return { ...room, turnIndex: newIndex, round, turnActionUsed: null };
}

// ─────────────────────────────────────────────
// 방 생명주기
// ─────────────────────────────────────────────

/** 새로운 게임 방을 생성합니다. */
export async function createRoom(roomId: string, hostId: string): Promise<RoomState> {
  const room: RoomState = {
    id: roomId,
    hostId,
    players: [],
    topic: null,
    endCondition: null,
    round: 0,
    turnIndex: 0,
    status: "waiting",
    createdAt: Date.now(),
  };
  await saveRoom(roomId, room);
  await saveChatMessages(roomId, []); // 초기 채팅 비우기
  return room;
}

/** 방에 새로운 플레이어를 입장시킵니다. 이미 있는 경우 기존 정보를 반환합니다. */
export async function joinRoom(
  roomId: string,
  playerId: string,
  name: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  // Redis에서 방 정보를 가져오거나 없으면 새로 생성
  let room = (await getRoomFromRedis(roomId)) ?? (await createRoom(roomId, playerId));

  if (!room.players.find((p) => p.id === playerId)) {
    const isFirstPlayer = room.players.length === 0;

    const newPlayer: Player = {
      id: playerId,
      name,
      isJudge: isFirstPlayer, // 첫 번째 입장 플레이어를 심판(진행자)으로 임명
      isAlive: true,
      secretWord: null,
      wordSubmitted: false,
    };

    room = { ...room, players: [...room.players, newPlayer] };
    await saveRoom(roomId, room);
    await addSystemMessage(roomId, `${name}님이 입장하셨습니다.`);
  }

  const messages: ServerToClientMessage[] = [
    { type: "room_state", room: publicRoom(room) },
  ];

  return { room, messages };
}

export async function leaveRoom(
  roomId: string,
  playerId: string
): Promise<{ room: RoomState | null; messages: ServerToClientMessage[] }> {
  const room = await getRoomFromRedis(roomId);
  if (!room) return { room: null, messages: [] };

  const leavingPlayer = room.players.find(p => p.id === playerId);
  const updated: RoomState = {
    ...room,
    players: room.players.filter((p) => p.id !== playerId),
    hostId: room.hostId === playerId
      ? (room.players.find((p) => p.id !== playerId)?.id ?? room.hostId)
      : room.hostId,
  };

  if (updated.players.length === 0) {
    await deleteRoom(roomId);
    return { room: null, messages: [] };
  }

  await saveRoom(roomId, updated);
  if (leavingPlayer) {
    await addSystemMessage(roomId, `${leavingPlayer.name}님이 퇴장하셨습니다.`);
  }

  const messages: ServerToClientMessage[] = [
    { type: "player_left", playerId },
    { type: "room_state", room: publicRoom(updated) },
  ];
  return { room: updated, messages };
}

/** 게임 종료 후 상태를 초기화하여 재시작합니다. (심판 전용) */
export async function restartGame(
  roomId: string,
  judgeId: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  let room = await getRoom(roomId);
  const judge = getPlayer(room, judgeId);

  if (!judge.isJudge) {
    throw new Error("심판만 게임을 재시작할 수 있습니다.");
  }

  if (room.status !== "finished") {
    throw new Error("게임이 종료된 상태에서만 재시작할 수 있습니다.");
  }

  // 각 플레이어의 생존 여부 및 단어 상태 리셋
  const resetRoom: RoomState = {
    ...room,
    status: "waiting",
    topic: null,
    endCondition: null,
    round: 0,
    turnIndex: 0,
    winnerPlayerId: null,
    turnActionUsed: null,
    players: room.players.map((p) => ({
      ...p,
      isAlive: true,
      secretWord: null,
      wordSubmitted: false,
      penaltyUntil: undefined,
    })),
  };

  await saveRoom(roomId, resetRoom);
  await saveChatMessages(roomId, []); // 채팅 내역 초기화
  await addSystemMessage(roomId, "게임이 재시작되었습니다. 심판이 새 주제를 설정해주세요.");

  return {
    room: resetRoom,
    messages: [
      { type: "game_restarted" },
      { type: "room_state", room: publicRoom(resetRoom) },
    ],
  };
}

// ─────────────────────────────────────────────
// 게임 설정 및 액션
// ─────────────────────────────────────────────

export async function setTopicAndRule(
  roomId: string,
  topic: string,
  endCondition: EndCondition
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  const room = await getRoom(roomId);
  const updated: RoomState = { ...room, topic, endCondition, status: "word_submission" };
  await saveRoom(roomId, updated);

  await addSystemMessage(roomId, `게임이 시작되었습니다! 주제: [${topic}]`);
  await addSystemMessage(roomId, `각 플레이어는 배정할 단어를 입력해주세요. (서버가 자동으로 할당합니다.)`);

  const messages: ServerToClientMessage[] = [
    { type: "topic_set", topic, endCondition },
    { type: "room_state", room: publicRoom(updated) },
  ];
  return { room: updated, messages };
}

/** 플레이어가 다음 사람에게 배정할 비밀 단어를 제출합니다. */
export async function submitWord(
  roomId: string,
  fromPlayerId: string,
  forPlayerId: string,
  word: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  const room = await getRoom(roomId);
  const fromPlayer = getPlayer(room, fromPlayerId);

  if (fromPlayer.isJudge) {
    throw new Error("진행자(심판)는 단어를 제출할 수 없습니다.");
  }

  const nonJudgePlayers = room.players.filter(p => !p.isJudge);
  const fromIdxInNonJudge = nonJudgePlayers.findIndex(p => p.id === fromPlayerId);
  const targetIdxInNonJudge = nonJudgePlayers.findIndex(p => p.id === forPlayerId);

  if (fromIdxInNonJudge === -1 || targetIdxInNonJudge === -1) {
    throw new Error("플레이어를 찾을 수 없습니다.");
  }

  if (fromPlayer.wordSubmitted) {
    throw new Error("이미 단어를 제출하였습니다.");
  }

  // 원형 배정 규칙: 자신의 다음 순서 플레이어에게만 단어를 줄 수 있음
  const expectedFromIdxInNonJudge = (targetIdxInNonJudge - 1 + nonJudgePlayers.length) % nonJudgePlayers.length;
  if (fromIdxInNonJudge !== expectedFromIdxInNonJudge) {
    throw new Error("단어 배정 규칙 위반 (본인의 다음 플레이어에게만 줄 수 있습니다).");
  }

  const newPlayers = room.players.map((p) => {
    if (p.id === forPlayerId) return { ...p, secretWord: word };
    if (p.id === fromPlayerId) return { ...p, wordSubmitted: true };
    return p;
  });

  const updated: RoomState = { ...room, players: newPlayers };
  await saveRoom(roomId, updated);

  const nonJudge = updated.players.filter(p => !p.isJudge);
  const allAssigned = nonJudge.length >= 2 && nonJudge.every(p => p.secretWord !== null);

  const messages: ServerToClientMessage[] = [];
  if (allAssigned) {
    // 모든 플레이어의 단어가 결정되면 게임 시작 (첫 턴 배정)
    const firstTurnPlayer = nonJudge[0];
    const firstTurnIdx = updated.players.findIndex(p => p.id === firstTurnPlayer.id);

    const playing: RoomState = { ...updated, status: "playing", round: 1, turnIndex: firstTurnIdx, turnActionUsed: null };
    await saveRoom(roomId, playing);

    await addSystemMessage(roomId, `모든 단어 배정이 완료되었습니다. 게임을 시작합니다!`);
    await addSystemMessage(roomId, `현재 차례: ${firstTurnPlayer.name}`);

    messages.push({ type: "words_assigned" });
    messages.push({ type: "room_state", room: publicRoom(playing) });
  }

  const finalRoom = await getRoomFromRedis(roomId);
  return { room: finalRoom!, messages };
}

/** 일반 채팅 메시지를 처리하고 저장합니다. */
export async function handleChat(
  roomId: string,
  playerId: string,
  text: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  const room = await getRoom(roomId);
  const player = getPlayer(room, playerId);

  // 침묵 제재 기간 확인
  if (player.penaltyUntil && player.penaltyUntil > Date.now()) {
    throw new Error("채팅 금지 상태입니다.");
  }

  const messages = await getChatMessages(roomId);
  const chatMsg: ChatMessage = {
    id: generateId(),
    playerId,
    text,
    kind: "chat",
    timestamp: Date.now(),
  };
  messages.push(chatMsg);
  await saveChatMessages(roomId, messages);

  return { room, messages: [{ type: "chat_posted", message: chatMsg }] };
}

/** 질문 액션을 처리합니다. (턴당 1회 제한) */
export async function postQuestion(
  roomId: string,
  playerId: string,
  text: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  const room = await getRoom(roomId);
  const player = getPlayer(room, playerId);

  if (player.penaltyUntil && player.penaltyUntil > Date.now()) {
    throw new Error("채팅 금지 상태입니다. 질문할 수 없습니다.");
  }

  if (room.players[room.turnIndex]?.id !== playerId) {
    throw new Error("현재 차례가 아닙니다.");
  }

  if (room.turnActionUsed) {
    throw new Error("이번 턴에 이미 액션을 수행했습니다. (질문 또는 정답 시도는 턴당 1회만 가능)");
  }

  const messages = await getChatMessages(roomId);
  const msg: ChatMessage = {
    id: generateId(),
    playerId,
    text,
    kind: "question",
    timestamp: Date.now(),
  };
  messages.push(msg);
  await saveChatMessages(roomId, messages);

  // 해당 플레이어가 이번 턴에 액션을 사용했음을 기록
  const updatedRoom = { ...room, turnActionUsed: { playerId, actionType: "question" as const } };
  await saveRoom(roomId, updatedRoom);

  return { room: updatedRoom, messages: [{ type: "chat_posted", message: msg }] };
}

/** 정답 맞히기 시도를 처리합니다. */
export async function postAnswer(
  roomId: string,
  playerId: string,
  text: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  let room = await getRoom(roomId);
  const player = getPlayer(room, playerId);

  if (player.penaltyUntil && player.penaltyUntil > Date.now()) {
    throw new Error("채팅 금지 상태입니다. 정답 시도를 할 수 없습니다.");
  }

  if (room.players[room.turnIndex]?.id !== playerId) {
    throw new Error("현재 차례가 아닙니다.");
  }

  if (room.turnActionUsed) {
    throw new Error("이번 턴에 이미 액션을 수행했습니다. (질문 또는 정답 시도는 턴당 1회만 가능)");
  }

  const chatLog = await getChatMessages(roomId);
  const msg: ChatMessage = {
    id: generateId(),
    playerId,
    text,
    kind: "answer",
    timestamp: Date.now(),
  };
  chatLog.push(msg);
  await saveChatMessages(roomId, chatLog);

  // 대소문자 무시 및 공백 제거 후 정답 판정
  const correct = !!player.secretWord && player.secretWord.trim().toLowerCase() === text.trim().toLowerCase();

  const updatedLog = await getChatMessages(roomId);
  const resultMsg: ChatMessage = {
    id: generateId(),
    playerId,
    text: `[정답 시도] ${text} -> ${correct ? "성공! 🎉" : "실패 ❌"}`,
    kind: "guess",
    timestamp: Date.now(),
  };
  updatedLog.push(resultMsg);
  await saveChatMessages(roomId, updatedLog);

  if (correct) {
    // 정답을 맞춘 플레이어는 생존 상태 해제
    const newPlayers = room.players.map((p) =>
      p.id === playerId ? { ...p, isAlive: false } : p
    );
    room = { ...room, players: newPlayers };

    // 한 명이라도 맞추면 종료되는 'firstWin' 룰 처리
    if (room.endCondition === "firstWin") {
      room.status = "finished";
      room.winnerPlayerId = playerId;
      await addSystemMessage(roomId, `🏆 게임 종료! 승자: ${player.name}`);
    }
  }

  // 액션 사용 완료 기록
  room.turnActionUsed = { playerId, actionType: "answer" as const };
  await saveRoom(roomId, room);

  return { room, messages: [{ type: "room_state", room: publicRoom(room) }] };
}

/** 차례 넘기기 (플레이어 스스로) */
export async function endTurn(
  roomId: string,
  playerId: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  let room = await getRoom(roomId);
  const player = getPlayer(room, playerId);

  if (room.players[room.turnIndex]?.id !== playerId) {
    throw new Error("현재 차례가 아닙니다.");
  }

  const prevPlayerName = player.name;
  room = nextTurn(room);
  await saveRoom(roomId, room);

  const nextPlayer = room.players[room.turnIndex];
  await addSystemMessage(roomId, `${prevPlayerName}님이 차례를 넘겼습니다. 다음 차례: ${nextPlayer.name}`);

  return {
    room,
    messages: [
      { type: "room_state", room: publicRoom(room) }
    ]
  };
}

/** 강제 차례 넘기기 (진행자/심판 전용) */
export async function forceNextTurn(
  roomId: string,
  judgeId: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  let room = await getRoom(roomId);
  const judge = getPlayer(room, judgeId);

  if (!judge.isJudge) {
    throw new Error("심판만 차례를 강제로 넘길 수 있습니다.");
  }

  room = nextTurn(room);
  await saveRoom(roomId, room);

  const nextPlayer = room.players[room.turnIndex];
  await addSystemMessage(roomId, `진행자에 의해 차례가 강제로 넘어갔습니다. 다음 차례: ${nextPlayer.name}`);

  return {
    room,
    messages: [
      { type: "room_state", room: publicRoom(room) }
    ]
  };
}

/** 정답 추측 핸들러 (기존 호환용 유지) */
export async function handleGuessWord(
  roomId: string,
  playerId: string,
  guessText: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  // postAnswer와 유사하지만 turn 제약이 없을 수 있는 용도로 남겨둠 (필요시 호출)
  return postAnswer(roomId, playerId, guessText);
}

/** 심판의 특정 플레이어에 대한 제재 액션을 처리합니다. */
export async function handleJudgeAction(
  roomId: string,
  judgeId: string,
  targetPlayerId: string,
  action: "warn" | "mute_30s"
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  let room = await getRoom(roomId);
  const judge = getPlayer(room, judgeId);
  if (!judge.isJudge) throw new Error("도구 조치는 심판만 가능합니다.");

  const target = getPlayer(room, targetPlayerId);
  let penaltyUntil: number | undefined;

  const newPlayers = room.players.map((p) => {
    if (p.id !== targetPlayerId) return p;
    if (action === "mute_30s") {
      // 현재 시간으로부터 30초 동안 채팅 금지 설정
      penaltyUntil = Date.now() + 30_000;
      return { ...p, penaltyUntil };
    }
    return p;
  });

  room = { ...room, players: newPlayers };
  await saveRoom(roomId, room);

  await addSystemMessage(roomId, `[심판 조치] ${target.name}님에게 ${action === "warn" ? "경고" : "30초 침묵"} 조치가 내려졌습니다.`);

  return { room, messages: [{ type: "room_state", room: publicRoom(room) }] };
}

// ─────────────────────────────────────────────
// 조회 함수
// ─────────────────────────────────────────────

export async function getPublicRoom(roomId: string): Promise<RoomState> {
  return publicRoom(await getRoom(roomId));
}

export async function getVisibleWords(
  roomId: string,
  viewerPlayerId: string
): Promise<{ playerId: string; word: string | null }[]> {
  const room = await getRoom(roomId);
  return room.players.map(p => ({
    playerId: p.id,
    word: p.id === viewerPlayerId ? null : p.secretWord,
  }));
}

export async function getRoomChatMessages(roomId: string): Promise<ChatMessage[]> {
  return getChatMessages(roomId);
}
