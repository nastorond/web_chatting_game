// ─────────────────────────────────────────────
// Domain entities
// ─────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  isJudge: boolean;
  isAlive: boolean;   // false once the player has correctly guessed their word
  word?: string;      // server-only: the word assigned to this player
  penaltyUntil?: number; // mute ends at this unix-ms timestamp
}

export type EndCondition = "firstWin" | "lastLose";

export interface RoomState {
  id: string;
  hostId: string;
  players: Player[];
  topic: string | null;
  endCondition: EndCondition | null;
  round: number;
  turnIndex: number;  // index into players[] of whoever's turn it is
  status: "waiting" | "playing" | "finished";
  createdAt: number;  // unix-ms
}

// ─────────────────────────────────────────────
// Questions stored in memory during a round
// ─────────────────────────────────────────────

export interface Question {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  text: string;
  answer?: string;
  timestamp: number;
}

// ─────────────────────────────────────────────
// Client → Server messages
// ─────────────────────────────────────────────

export type ClientToServerMessage =
  | { type: "join_room"; roomId: string; name: string }
  | { type: "set_topic_and_rule"; topic: string; endCondition: EndCondition }
  | { type: "submit_word"; forPlayerId: string; word: string }
  | { type: "ask_question"; toPlayerId: string; text: string }
  | { type: "answer_question"; questionId: string; text: string }
  | { type: "guess_word"; text: string }
  | { type: "judge_action"; targetPlayerId: string; action: "warn" | "mute_30s" };

// ─────────────────────────────────────────────
// Server → Client messages
// ─────────────────────────────────────────────

/**
 * Full room state snapshot – sent on join and after any state change.
 * The `word` field is stripped for each player before sending to the client
 * (the server decides who can see what).
 */
export type ServerToClientMessage =
  | { type: "room_state"; room: RoomState }
  | { type: "player_joined"; player: Omit<Player, "word"> }
  | { type: "player_left"; playerId: string }
  | { type: "topic_set"; topic: string; endCondition: EndCondition }
  | { type: "words_assigned" }
  | { type: "turn_started"; playerId: string; round: number; turnIndex: number }
  | { type: "turn_ended"; playerId: string }
  | { type: "question_posted"; question: Omit<Question, "answer"> }
  | { type: "answer_posted"; questionId: string; answer: string }
  | { type: "guess_result"; playerId: string; correct: boolean; word?: string }
  | {
    type: "judge_penalty";
    targetPlayerId: string;
    action: "warn" | "mute_30s";
    penaltyUntil?: number;
  }
  /**
   * Emitted when the game ends.
   * - `firstWin` → winnerId is the player who correctly guessed their word first.
   * - `lastLose` → winnerId is the **last surviving player** (i.e. the actual loser).
   *   The field is reused for symmetry; treat it as "loserId" in this mode.
   */
  | { type: "game_over"; winnerId?: string }
  | { type: "error"; message: string };

