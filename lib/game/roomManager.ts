import {
  RoomState,
  Player,
  Question,
  EndCondition,
  ServerToClientMessage,
} from "./types";

// ─────────────────────────────────────────────
// In-memory store
// ─────────────────────────────────────────────

const rooms = new Map<string, RoomState>();

/**
 * Per-room questions live separately so RoomState stays clean.
 * questionsByRoom[roomId][questionId] = Question
 */
const questionsByRoom = new Map<string, Map<string, Question>>();

// ─────────────────────────────────────────────
// Helpers
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

/** Return a safe copy of the room – strips `word` from all players. */
function publicRoom(room: RoomState): RoomState {
  return {
    ...room,
    players: room.players.map(({ word: _w, ...rest }) => rest as Player),
  };
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** Check finish conditions and return a game_over message if the game is done. */
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
// Room lifecycle
// ─────────────────────────────────────────────

/**
 * Create a new room and register it.
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
 * Add a player to an existing room (or create if missing).
 * Returns: updated RoomState + messages to broadcast.
 */
export function joinRoom(
  roomId: string,
  playerId: string,
  name: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  let room = rooms.get(roomId) ?? createRoom(roomId, playerId);

  // Don't add duplicates (reconnect case)
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
 * Remove a player from a room.
 * Returns updated RoomState + messages, or null if the room was deleted.
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
    // If host left, promote the next player
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
// Game setup
// ─────────────────────────────────────────────

/**
 * Host sets the topic and end condition.
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
 * Player i submits a word for the player on their left: (i+1) % n.
 * The caller (route.ts) should verify that `fromPlayerId` is actually
 * allowed to write for `forPlayerId` before calling this.
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

  // Verify circular seating rule: fromPlayer must be the right neighbour of forPlayer.
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
    // Transition to playing
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
// Turn management
// ─────────────────────────────────────────────

/**
 * Advance to the next player's turn.
 * Wraps around and increments round when all players have gone.
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
// In-game actions
// ─────────────────────────────────────────────

/**
 * A player asks another player a question about their own word.
 */
export function handleAskQuestion(
  roomId: string,
  fromPlayerId: string,
  toPlayerId: string,
  text: string
): { room: RoomState; messages: ServerToClientMessage[] } {
  const room = getRoom(roomId);
  const questions = questionsByRoom.get(roomId)!;

  // Check mute
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
 * A player answers a previously posted question.
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

  // Check mute
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
 * A player guesses their own word.
 * Returns an optional game_over message if the end condition is met.
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
    // Mark player as no longer alive (they've won their own word)
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
 * The judge warns or mutes a player.
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
    return p; // warn is informational only
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
// Read helpers (for route.ts)
// ─────────────────────────────────────────────

export function getRooms(): Map<string, RoomState> {
  return rooms;
}

export function getPublicRoom(roomId: string): RoomState {
  return publicRoom(getRoom(roomId));
}

/** Returns the word assigned to a specific player (server-only). */
export function getPlayerWord(roomId: string, playerId: string): string | undefined {
  return getRoom(roomId).players.find((p) => p.id === playerId)?.word;
}
