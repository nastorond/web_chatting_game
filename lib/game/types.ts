// ─────────────────────────────────────────────
// 도메인 엔티티
// ─────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  isJudge: boolean;
  isAlive: boolean;   // 플레이어가 자신의 단어를 올바르게 맞추면 false가 됨
  secretWord: string | null; // 각 플레이어에게 할당된 비밀 단어 (본인은 모름)
  wordSubmitted: boolean;    // 이 플레이어가 다음 사람의 단어를 제출했는지 여부
  penaltyUntil?: number; // 침묵(Mute)이 종료되는 Unix MS 타임스탬프
}

export type EndCondition = "firstWin" | "lastLose";

export interface RoomState {
  id: string;
  hostId: string;
  players: Player[];
  topic: string | null;
  endCondition: EndCondition | null;
  round: number;
  turnIndex: number;  // 현재 발언 차례인 플레이어의 index (players[] 내 인덱스)
  status: "waiting" | "word_submission" | "playing" | "finished";
  winnerPlayerId?: string | null; // 게임 종료 시 승리한 플레이어 ID
  createdAt: number;  // 생성 시점 (Unix MS)
}

// ─────────────────────────────────────────────
// 채팅 메시지 모델
// ─────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  playerId: string;
  text: string;
  kind: "chat" | "system" | "guess" | "question" | "answer";
  timestamp: number;
}

// ─────────────────────────────────────────────
// 클라이언트 → 서버 메시지
// ─────────────────────────────────────────────

export type ClientToServerMessage =
  | { type: "join_room"; roomId: string; name: string }
  | { type: "leave_room" }
  | { type: "set_topic_and_rule"; topic: string; endCondition: EndCondition }
  | { type: "submit_word"; forPlayerId: string; word: string }
  | { type: "chat"; text: string }
  | { type: "post_question"; text: string }
  | { type: "post_answer"; text: string }
  | { type: "guess_word"; text: string }
  | { type: "judge_action"; targetPlayerId: string; action: "warn" | "mute_30s" };

// ─────────────────────────────────────────────
// 서버 → 클라이언트 메시지
// ─────────────────────────────────────────────

export type ServerToClientMessage =
  | { type: "room_state"; room: RoomState }
  | { type: "player_joined"; player: Player }
  | { type: "player_left"; playerId: string }
  | { type: "topic_set"; topic: string; endCondition: EndCondition }
  | { type: "words_assigned" }
  | { type: "turn_started"; playerId: string; round: number; turnIndex: number }
  | { type: "turn_ended"; playerId: string }
  | { type: "chat_posted"; message: ChatMessage }
  | { type: "guess_result"; playerId: string; correct: boolean; word?: string }
  | {
    type: "judge_penalty";
    targetPlayerId: string;
    action: "warn" | "mute_30s";
    penaltyUntil?: number;
  }
  | { type: "game_over"; winnerId?: string }
  | { type: "error"; message: string };
