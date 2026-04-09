import { RoomState, EndCondition, ServerToClientMessage, ChatMessage } from "./types";
import { getRoomFromRedis, saveRoom, getChatMessages, saveChatMessages } from "./store";
import { getRoom, getPlayer, publicRoom, generateId, nextTurn } from "./utils";
import { addSystemMessage } from "./chatService";

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
  await saveChatMessages(roomId, []);
  await addSystemMessage(roomId, "게임이 재시작되었습니다. 심판이 새 주제를 설정해주세요.");

  return {
    room: resetRoom,
    messages: [
      { type: "game_restarted" },
      { type: "room_state", room: publicRoom(resetRoom) },
    ],
  };
}

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

export async function submitWord(
  roomId: string,
  fromPlayerId: string,
  forPlayerId: string,
  word: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  let room = await getRoom(roomId);
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

  const updatedRoom = { ...room, turnActionUsed: { playerId, actionType: "question" as const } };
  await saveRoom(roomId, updatedRoom);

  return { room: updatedRoom, messages: [{ type: "chat_posted", message: msg }] };
}

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
    const newPlayers = room.players.map((p) =>
      p.id === playerId ? { ...p, isAlive: false } : p
    );
    room = { ...room, players: newPlayers };

    if (room.endCondition === "firstWin") {
      room.status = "finished";
      room.winnerPlayerId = playerId;
      await addSystemMessage(roomId, `🏆 게임 종료! 승자: ${player.name}`);
    }
  }

  room.turnActionUsed = { playerId, actionType: "answer" as const };
  await saveRoom(roomId, room);

  return { room, messages: [{ type: "room_state", room: publicRoom(room) }] };
}

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

export async function handleGuessWord(
  roomId: string,
  playerId: string,
  guessText: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  return postAnswer(roomId, playerId, guessText);
}

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
