// ─────────────────────────────────────────────
// 도메인 엔티티
// ─────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  isJudge: boolean;
  isAlive: boolean;   // 플레이어가 자신의 단어를 올바르게 맞추면 false가 됨
  word?: string;      // 서버 전용: 각 플레이어에게 할당된 단어
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
  status: "waiting" | "playing" | "finished";
  createdAt: number;  // 생성 시점 (Unix MS)
}

// ─────────────────────────────────────────────
// 라운드 중에 메모리에 저장되는 질문들
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
// 클라이언트 → 서버 메시지
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
// 서버 → 클라이언트 메시지
// ─────────────────────────────────────────────

/**
 * 전체 방 상태 스냅샷 - 입장 시 또는 상태 변경 후에 전송됩니다.
 * 각 플레이어에게 보내기 전 'word' 필드는 제거됩니다 
 * (서버가 각 플레이어에게 무엇을 보여줄지 결정합니다).
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
   * 게임이 종료되었을 때 발생합니다.
   * - `firstWin` → winnerId는 자신의 단어를 가장 먼저 맞춘 플레이어입니다.
   * - `lastLose` → winnerId는 **마지막까지 남은 플레이어**(즉, 실제 패배자)입니다.
   *   필드는 대칭성을 위해 재사용됩니다. 이 모드에서는 "loserId"로 간주하십시오.
   */
  | { type: "game_over"; winnerId?: string }
  | { type: "error"; message: string };

