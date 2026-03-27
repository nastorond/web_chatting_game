import {
  RoomState,
  Player,
  Question,
  EndCondition,
  ServerToClientMessage,
} from "./types";

// ─────────────────────────────────────────────
// 인메모리 저장소
// ─────────────────────────────────────────────

const rooms = new Map<string, RoomState>();

/**
 * 각 방의 질문들은 RoomState를 깔끔하게 유지하기 위해 별도로 관리됩니다.
 * questionsByRoom[roomId][questionId] = Question
 */
const questionsByRoom = new Map<string, Map<string, Question>>();

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

/** 방의 안전한 복사본을 반환합니다. 모든 플레이어로부터 `word` 필드를 제거합니다. */
function publicRoom(room: RoomState): RoomState {
  return {
    ...room,
    players: room.players.map(({ word: _w, ...rest }) => rest as Player),
  };
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** 게임 종료 조건을 확인하고, 게임이 끝났다면 game_over 메시지를 반환합니다. */
function checkGameOver(room: RoomState): ServerToClientMessage | null {
  if (!room.endCondition) return null;

  const nonJudge = room.players.filter((p) => !p.isJudge);
  const alive = nonJudge.filter((p) => p.isAlive);

  if (room.endCondition === "firstWin") {
    const winner = nonJudge.find((p) => !p.isAlive);
    if (winner) return { type: "game_over", winnerId: winner.id };
  }

  if (room.endCondition === "lastLose") {
    if (alive.length <= 1) {
      return { type: "game_over", winnerId: alive[0]?.id };
    }
  }

  return null;
}

// ─────────────────────────────────────────────
// 방 생명주기
// ─────────────────────────────────────────────

/**
 * 새로운 방을 생성하고 등록합니다.
 */
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
  questionsByRoom.set(roomId, new Map());
  return room;
}

/**
 * 기존 방에 플레이어를 추가합니다 (방이 없으면 생성합니다).
 * 반환값: 업데이트된 RoomState + 방송할 메시지 목록.
 */
export function joinRoom(
  roomId: string,
  playerId: string,
  name: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  let room = rooms.get(roomId) ?? createRoom(roomId, playerId);

  // 중복 추가 방지 (재연결 케이스)
  if (!room.players.find((p) => p.id === playerId)) {
    const newPlayer: Player = {
      id: playerId,
      name,
      isJudge: false,
      isAlive: true,
    };
    room = { ...room, players: [...room.players, newPlayer] };
    rooms.set(roomId, room);
  }

  const messages: ServerToClientMessage[] = [
    { type: "room_state", room: publicRoom(room) },
  ];

  return { room, messages };
}

/**
 * 방에서 플레이어를 제거합니다.
 * 반환값: 업데이트된 RoomState + 메시지 목록, 또는 방이 삭제된 경우 null.
 */
export function leaveRoom(
  roomId: string,
  playerId: string
): { room: RoomState | null; messages: ServerToClientMessage[] } {
  const room = rooms.get(roomId);
  if (!room) return { room: null, messages: [] };

  const updated: RoomState = {
    ...room,
    players: room.players.filter((p) => p.id !== playerId),
    // 방장이 나간 경우 다음 플레이어를 방장으로 승격
    hostId: room.hostId === playerId
      ? (room.players.find((p) => p.id !== playerId)?.id ?? room.hostId)
      : room.hostId,
  };

  if (updated.players.length === 0) {
    rooms.delete(roomId);
    questionsByRoom.delete(roomId);
    return { room: null, messages: [] };
  }

  rooms.set(roomId, updated);
  const messages: ServerToClientMessage[] = [
    { type: "player_left", playerId },
    { type: "room_state", room: publicRoom(updated) },
  ];
  return { room: updated, messages };
}

// ─────────────────────────────────────────────
// 게임 설정
// ─────────────────────────────────────────────

/**
 * 방장이 주제와 종료 조건을 설정합니다.
 */
export function setTopicAndRule(
  roomId: string,
  topic: string,
  endCondition: EndCondition
): { room: RoomState; messages: ServerToClientMessage[] } {
  const room = getRoom(roomId);
  const updated: RoomState = { ...room, topic, endCondition };
  rooms.set(roomId, updated);

  const messages: ServerToClientMessage[] = [
    { type: "topic_set", topic, endCondition },
    { type: "room_state", room: publicRoom(updated) },
  ];
  return { room: updated, messages };
}

/**
 * 플레이어 i가 왼쪽 플레이어((i+1) % n)를 위한 단어를 제출합니다.
 * 호출자(route.ts)는 이 함수를 호출하기 전에 `fromPlayerId`가 
 * `forPlayerId`에게 단어를 부여할 권한이 있는지 확인해야 합니다.
 */
export function submitWord(
  roomId: string,
  fromPlayerId: string,
  forPlayerId: string,
  word: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  const room = getRoom(roomId);
  const targetIdx = room.players.findIndex((p) => p.id === forPlayerId);
  if (targetIdx === -1) throw new Error(`Target player not found: ${forPlayerId}`);

  // 원형 좌석 규칙 확인: fromPlayer는 forPlayer의 오른쪽 이웃이어야 합니다.
  const fromIdx = room.players.findIndex((p) => p.id === fromPlayerId);
  const expectedFromIdx = (targetIdx - 1 + room.players.length) % room.players.length;
  if (fromIdx !== expectedFromIdx) {
    throw new Error("Word assignment violates circular seating rule.");
  }

  const newPlayers = room.players.map((p) =>
    p.id === forPlayerId ? { ...p, word } : p
  );
  const updated: RoomState = { ...room, players: newPlayers };
  rooms.set(roomId, updated);

  const allAssigned = updated.players.every(
    (p) => p.isJudge || p.word !== undefined
  );

  const messages: ServerToClientMessage[] = [];
  if (allAssigned) {
    // 게임 시작 상태로 전환
    const playing: RoomState = { ...updated, status: "playing", round: 1, turnIndex: 0 };
    rooms.set(roomId, playing);
    messages.push({ type: "words_assigned" });
    messages.push({ type: "room_state", room: publicRoom(playing) });
    const firstPlayer = playing.players[playing.turnIndex];
    if (firstPlayer) {
      messages.push({
        type: "turn_started",
        playerId: firstPlayer.id,
        round: playing.round,
        turnIndex: playing.turnIndex,
      });
    }
  }

  return { room: rooms.get(roomId)!, messages };
}

// ─────────────────────────────────────────────
// 턴 관리
// ─────────────────────────────────────────────

/**
 * 다음 플레이어의 턴으로 진행합니다.
 * 모든 플레이어가 턴을 마치면 라운드를 올리고 다시 처음부터 시작합니다.
 */
export function handleTurnEnd(
  roomId: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  const room = getRoom(roomId);
  const currentPlayer = room.players[room.turnIndex];

  const messages: ServerToClientMessage[] = [
    { type: "turn_ended", playerId: currentPlayer?.id ?? "" },
  ];

  const nextIndex = (room.turnIndex + 1) % room.players.length;
  const nextRound = nextIndex === 0 ? room.round + 1 : room.round;

  const updated: RoomState = {
    ...room,
    turnIndex: nextIndex,
    round: nextRound,
  };
  rooms.set(roomId, updated);
  messages.push({ type: "room_state", room: publicRoom(updated) });

  const nextPlayer = updated.players[updated.turnIndex];
  if (nextPlayer) {
    messages.push({
      type: "turn_started",
      playerId: nextPlayer.id,
      round: updated.round,
      turnIndex: updated.turnIndex,
    });
  }

  return { room: updated, messages };
}

// ─────────────────────────────────────────────
// 게임 내 액션
// ─────────────────────────────────────────────

/**
 * 플레이어가 자신의 단어를 유추하기 위해 다른 플레이어에게 질문을 던집니다.
 */
export function handleAskQuestion(
  roomId: string,
  fromPlayerId: string,
  toPlayerId: string,
  text: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  const room = getRoom(roomId);
  const questions = questionsByRoom.get(roomId)!;

  // 침묵 여부 확인
  const from = getPlayer(room, fromPlayerId);
  if (from.penaltyUntil && from.penaltyUntil > Date.now()) {
    throw new Error("You are muted.");
  }

  const question: Question = {
    id: generateId(),
    fromPlayerId,
    toPlayerId,
    text,
    timestamp: Date.now(),
  };
  questions.set(question.id, question);

  const messages: ServerToClientMessage[] = [
    {
      type: "question_posted",
      question: { id: question.id, fromPlayerId, toPlayerId, text, timestamp: question.timestamp },
    },
  ];

  return { room, messages };
}

/**
 * 플레이어가 이전에 게시된 질문에 답변합니다.
 */
export function handleAnswerQuestion(
  roomId: string,
  fromPlayerId: string,
  questionId: string,
  text: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  const room = getRoom(roomId);
  const questions = questionsByRoom.get(roomId)!;
  const question = questions.get(questionId);
  if (!question) throw new Error(`Question not found: ${questionId}`);
  if (question.toPlayerId !== fromPlayerId)
    throw new Error("Only the addressed player may answer.");

  // 침묵 여부 확인
  const from = getPlayer(room, fromPlayerId);
  if (from.penaltyUntil && from.penaltyUntil > Date.now()) {
    throw new Error("You are muted.");
  }

  question.answer = text;
  questions.set(questionId, question);

  const messages: ServerToClientMessage[] = [
    { type: "answer_posted", questionId, answer: text },
  ];
  return { room, messages };
}

/**
 * 플레이어가 자신의 단어를 추측합니다.
 * 종료 조건이 충족되면 선택적으로 game_over 메시지를 반환합니다.
 */
export function handleGuessWord(
  roomId: string,
  playerId: string,
  guessText: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  let room = getRoom(roomId);
  const player = getPlayer(room, playerId);

  const correct =
    !!player.word &&
    player.word.trim().toLowerCase() === guessText.trim().toLowerCase();

  const messages: ServerToClientMessage[] = [];

  if (correct) {
    // 플레이어를 '생존하지 않음(탈출)' 상태로 표시 (본인의 단어를 맞춤)
    const newPlayers = room.players.map((p) =>
      p.id === playerId ? { ...p, isAlive: false } : p
    );
    room = { ...room, players: newPlayers };
    rooms.set(roomId, room);
  }

  messages.push({ type: "guess_result", playerId, correct, word: correct ? player.word : undefined });
  messages.push({ type: "room_state", room: publicRoom(room) });

  const gameOver = checkGameOver(room);
  if (gameOver) {
    room = { ...room, status: "finished" };
    rooms.set(roomId, room);
    messages.push(gameOver);
  }

  return { room, messages };
}

/**
 * 심판이 플레이어에게 경고를 주거나 침묵(Mute) 조치를 취합니다.
 */
export function handleJudgeAction(
  roomId: string,
  judgeId: string,
  targetPlayerId: string,
  action: "warn" | "mute_30s"
): { room: RoomState; messages: ServerToClientMessage[] } {
  let room = getRoom(roomId);
  const judge = getPlayer(room, judgeId);
  if (!judge.isJudge) throw new Error("Only the judge can take this action.");

  let penaltyUntil: number | undefined;

  const newPlayers = room.players.map((p) => {
    if (p.id !== targetPlayerId) return p;
    if (action === "mute_30s") {
      penaltyUntil = Date.now() + 30_000;
      return { ...p, penaltyUntil };
    }
    return p; // 경고는 정보 제공용일 뿐 상태 변화 없음
  });

  room = { ...room, players: newPlayers };
  rooms.set(roomId, room);

  const messages: ServerToClientMessage[] = [
    { type: "judge_penalty", targetPlayerId, action, penaltyUntil },
    { type: "room_state", room: publicRoom(room) },
  ];
  return { room, messages };
}

// ─────────────────────────────────────────────
// 조회 헬퍼 함수 (route.ts용)
// ─────────────────────────────────────────────

export function getRooms(): Map<string, RoomState> {
  return rooms;
}

export function getPublicRoom(roomId: string): RoomState {
  return publicRoom(getRoom(roomId));
}

/** 특정 방의 모든 질문 목록을 반환합니다. */
export function getRoomQuestions(roomId: string): Question[] {
  const roomQuestions = questionsByRoom.get(roomId);
  if (!roomQuestions) return [];
  return Array.from(roomQuestions.values());
}

/** 특정 플레이어에게 할당된 단어를 반환합니다 (서버 전용). */
export function getPlayerWord(roomId: string, playerId: string): string | undefined {
  return getRoom(roomId).players.find((p) => p.id === playerId)?.word;
}
