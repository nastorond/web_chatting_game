import {
  RoomState,
  Player,
  ChatMessage,
  EndCondition,
  ServerToClientMessage,
} from "./types";

// ─────────────────────────────────────────────
// 인메모리 저장소
// ─────────────────────────────────────────────

const rooms = new Map<string, RoomState>();

/**
 * 각 방의 채팅 메시지들
 * chatMessagesByRoom[roomId] = ChatMessage[]
 */
const chatMessagesByRoom = new Map<string, ChatMessage[]>();

// ─────────────────────────────────────────────
// 헬퍼 함수
// ─────────────────────────────────────────────

function getRoom(roomId: string): RoomState {
  const room = rooms.get(roomId);
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
function addSystemMessage(roomId: string, text: string) {
  const messages = chatMessagesByRoom.get(roomId) || [];
  const sysMsg: ChatMessage = {
    id: generateId(),
    playerId: "system",
    text,
    kind: "system",
    timestamp: Date.now(),
  };
  messages.push(sysMsg);
  chatMessagesByRoom.set(roomId, messages);
}

/** 턴 넘기기 헬퍼 (심판 및 탈락자 제외) */
function nextTurn(room: RoomState): RoomState {
  const players = room.players;
  let newIndex = room.turnIndex;
  let round = room.round;

  // 최대 players.length만큼 순회하며 유효한 다음 플레이어 찾기
  for (let i = 0; i < players.length; i++) {
    newIndex = (newIndex + 1) % players.length;
    
    // 한 바퀴 돌았으면 라운드 증가
    if (newIndex === 0) round++;

    const p = players[newIndex];
    if (!p.isJudge && p.isAlive) {
      return { ...room, turnIndex: newIndex, round };
    }
  }

  return { ...room, turnIndex: newIndex, round };
}

// ─────────────────────────────────────────────
// 방 생명주기
// ─────────────────────────────────────────────

export function createRoom(roomId: string, hostId: string): RoomState {
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
  rooms.set(roomId, room);
  chatMessagesByRoom.set(roomId, []);
  return room;
}

export function joinRoom(
  roomId: string,
  playerId: string,
  name: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  let room = rooms.get(roomId) ?? createRoom(roomId, playerId);

  if (!room.players.find((p) => p.id === playerId)) {
    const isFirstPlayer = room.players.length === 0;

    const newPlayer: Player = {
      id: playerId,
      name,
      isJudge: isFirstPlayer,
      isAlive: true,
      secretWord: null,
      wordSubmitted: false,
    };

    room = { ...room, players: [...room.players, newPlayer] };
    rooms.set(roomId, room);
    addSystemMessage(roomId, `${name}님이 입장하셨습니다.`);
  }

  const messages: ServerToClientMessage[] = [
    { type: "room_state", room: publicRoom(room) },
  ];

  return { room, messages };
}

export function leaveRoom(
  roomId: string,
  playerId: string
): { room: RoomState | null; messages: ServerToClientMessage[] } {
  const room = rooms.get(roomId);
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
    rooms.delete(roomId);
    chatMessagesByRoom.delete(roomId);
    return { room: null, messages: [] };
  }

  rooms.set(roomId, updated);
  if (leavingPlayer) {
    addSystemMessage(roomId, `${leavingPlayer.name}님이 퇴장하셨습니다.`);
  }

  const messages: ServerToClientMessage[] = [
    { type: "player_left", playerId },
    { type: "room_state", room: publicRoom(updated) },
  ];
  return { room: updated, messages };
}

// ─────────────────────────────────────────────
// 게임 설정 및 액션
// ─────────────────────────────────────────────

export function setTopicAndRule(
  roomId: string,
  topic: string,
  endCondition: EndCondition
): { room: RoomState; messages: ServerToClientMessage[] } {
  const room = getRoom(roomId);
  const updated: RoomState = { ...room, topic, endCondition, status: "word_submission" };
  rooms.set(roomId, updated);

  addSystemMessage(roomId, `게임이 시작되었습니다! 주제: [${topic}]`);
  addSystemMessage(roomId, `각 플레이어는 배정할 단어를 입력해주세요. (서버가 자동으로 할당합니다.)`);

  const messages: ServerToClientMessage[] = [
    { type: "topic_set", topic, endCondition },
    { type: "room_state", room: publicRoom(updated) },
  ];
  return { room: updated, messages };
}

export function submitWord(
  roomId: string,
  fromPlayerId: string,
  forPlayerId: string,
  word: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  const room = getRoom(roomId);
  const fromPlayer = getPlayer(room, fromPlayerId);

  // 심판은 단어 제출 불가
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

  // 원형 규칙: non-judge 사이에서만 (i -> i+1)
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
  rooms.set(roomId, updated);

  const nonJudge = updated.players.filter(p => !p.isJudge);
  const allAssigned = nonJudge.length >= 2 && nonJudge.every(p => p.secretWord !== null);

  const messages: ServerToClientMessage[] = [];
  if (allAssigned) {
    // 첫 턴 시작 (심판 제외 첫 번째 일반 플레이어)
    const firstTurnPlayer = nonJudge[0];
    const firstTurnIdx = updated.players.findIndex(p => p.id === firstTurnPlayer.id);

    const playing: RoomState = { ...updated, status: "playing", round: 1, turnIndex: firstTurnIdx };
    rooms.set(roomId, playing);
    
    addSystemMessage(roomId, `모든 단어 배정이 완료되었습니다. 게임을 시작합니다!`);
    addSystemMessage(roomId, `현재 차례: ${firstTurnPlayer.name}`);
    
    messages.push({ type: "words_assigned" });
    messages.push({ type: "room_state", room: publicRoom(playing) });
  }

  return { room: rooms.get(roomId)!, messages };
}

/** 채팅 핸들러 */
export function handleChat(
  roomId: string,
  playerId: string,
  text: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  const room = getRoom(roomId);
  const player = getPlayer(room, playerId);

  if (player.penaltyUntil && player.penaltyUntil > Date.now()) {
    throw new Error("채팅 금지 상태입니다.");
  }

  const messages = chatMessagesByRoom.get(roomId) || [];
  const chatMsg: ChatMessage = {
    id: generateId(),
    playerId,
    text,
    kind: "chat",
    timestamp: Date.now(),
  };
  messages.push(chatMsg);
  chatMessagesByRoom.set(roomId, messages);

  return { room, messages: [{ type: "chat_posted", message: chatMsg }] };
}

/** 질문 등록 핸들러 */
export function postQuestion(
  roomId: string,
  playerId: string,
  text: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  let room = getRoom(roomId);
  const player = getPlayer(room, playerId);

  if (room.players[room.turnIndex]?.id !== playerId) {
    throw new Error("현재 차례가 아닙니다.");
  }

  const messages = chatMessagesByRoom.get(roomId) || [];
  const msg: ChatMessage = {
    id: generateId(),
    playerId,
    text,
    kind: "question",
    timestamp: Date.now(),
  };
  messages.push(msg);
  chatMessagesByRoom.set(roomId, messages);

  return { room, messages: [{ type: "chat_posted", message: msg }] };
}

/** 정답 시도 핸들러 */
export function postAnswer(
  roomId: string,
  playerId: string,
  text: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  let room = getRoom(roomId);
  const player = getPlayer(room, playerId);

  if (room.players[room.turnIndex]?.id !== playerId) {
    throw new Error("현재 차례가 아닙니다.");
  }

  // 채팅에 기록 (kind: answer)
  const chatLog = chatMessagesByRoom.get(roomId) || [];
  const msg: ChatMessage = {
    id: generateId(),
    playerId,
    text,
    kind: "answer",
    timestamp: Date.now(),
  };
  chatLog.push(msg);
  chatMessagesByRoom.set(roomId, chatLog);

  // 정답 판정 (기존 handleGuessWord 로직 활용)
  const correct = !!player.secretWord && player.secretWord.trim().toLowerCase() === text.trim().toLowerCase();
  
  // 정답 시도 결과 메시지 추가 (kind: guess)
  const resultMsg: ChatMessage = {
    id: generateId(),
    playerId,
    text: `[정답 시도] ${text} -> ${correct ? "성공! 🎉" : "실패 ❌"}`,
    kind: "guess",
    timestamp: Date.now(),
  };
  chatLog.push(resultMsg);
  chatMessagesByRoom.set(roomId, chatLog);

  if (correct) {
    const newPlayers = room.players.map((p) =>
      p.id === playerId ? { ...p, isAlive: false } : p
    );
    room = { ...room, players: newPlayers };

    if (room.endCondition === "firstWin") {
      room.status = "finished";
      room.winnerPlayerId = playerId;
      addSystemMessage(roomId, `🏆 게임 종료! 승자: ${player.name}`);
    }
  }

  rooms.set(roomId, room);

  return { room, messages: [{ type: "room_state", room: publicRoom(room) }] };
}

/** 차례 넘기기 (플레이어 스스로) */
export function endTurn(
  roomId: string,
  playerId: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  let room = getRoom(roomId);
  const player = getPlayer(room, playerId);

  if (room.players[room.turnIndex]?.id !== playerId) {
    throw new Error("현재 차례가 아닙니다.");
  }

  const prevPlayerName = player.name;
  room = nextTurn(room);
  rooms.set(roomId, room);

  const nextPlayer = room.players[room.turnIndex];
  addSystemMessage(roomId, `${prevPlayerName}님이 차례를 넘겼습니다. 다음 차례: ${nextPlayer.name}`);

  return {
    room,
    messages: [
      { type: "room_state", room: publicRoom(room) }
    ]
  };
}

/** 강제 차례 넘기기 (진행자/심판 전용) */
export function forceNextTurn(
  roomId: string,
  judgeId: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  let room = getRoom(roomId);
  const judge = getPlayer(room, judgeId);

  if (!judge.isJudge) {
    throw new Error("심판만 차례를 강제로 넘길 수 있습니다.");
  }

  room = nextTurn(room);
  rooms.set(roomId, room);

  const nextPlayer = room.players[room.turnIndex];
  addSystemMessage(roomId, `진행자에 의해 차례가 강제로 넘어갔습니다. 다음 차례: ${nextPlayer.name}`);

  return {
    room,
    messages: [
      { type: "room_state", room: publicRoom(room) }
    ]
  };
}

/** 정답 추측 핸들러 (기존 호환용 유지) */
export function handleGuessWord(
  roomId: string,
  playerId: string,
  guessText: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  // postAnswer와 유사하지만 turn 제약이 없을 수 있는 용도로 남겨둠 (필요시 호출)
  return postAnswer(roomId, playerId, guessText);
}

/** 심판 조치 */
export function handleJudgeAction(
  roomId: string,
  judgeId: string,
  targetPlayerId: string,
  action: "warn" | "mute_30s"
): { room: RoomState; messages: ServerToClientMessage[] } {
  let room = getRoom(roomId);
  const judge = getPlayer(room, judgeId);
  if (!judge.isJudge) throw new Error("Only judge can take action.");

  const target = getPlayer(room, targetPlayerId);
  let penaltyUntil: number | undefined;

  const newPlayers = room.players.map((p) => {
    if (p.id !== targetPlayerId) return p;
    if (action === "mute_30s") {
      penaltyUntil = Date.now() + 30_000;
      return { ...p, penaltyUntil };
    }
    return p;
  });

  room = { ...room, players: newPlayers };
  rooms.set(roomId, room);

  addSystemMessage(roomId, `[심판 조치] ${target.name}님에게 ${action === "warn" ? "경고" : "30초 침묵"} 조치가 내려졌습니다.`);

  return { room, messages: [{ type: "room_state", room: publicRoom(room) }] };
}

// ─────────────────────────────────────────────
// 조회 함수
// ─────────────────────────────────────────────

export function getPublicRoom(roomId: string): RoomState {
  return publicRoom(getRoom(roomId));
}

export function getVisibleWords(roomId: string, viewerPlayerId: string): { playerId: string; word: string | null }[] {
  const room = getRoom(roomId);
  return room.players.map(p => ({
    playerId: p.id,
    word: p.id === viewerPlayerId ? null : p.secretWord,
  }));
}

export function getRoomChatMessages(roomId: string): ChatMessage[] {
  return chatMessagesByRoom.get(roomId) || [];
}
