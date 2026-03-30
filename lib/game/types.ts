/**
 * types.ts
 * 
 * 게임에서 사용되는 모든 데이터 모델과 통신 메시지 규격을 정의한 타입 파일입니다.
 */

// ─────────────────────────────────────────────
// 도메인 엔티티 (상태 모델)
// ─────────────────────────────────────────────

export interface Player {
  id: string;        // 플레이어 고유 ID
  name: string;      // 플레이어 닉네임
  isJudge: boolean;  // 심판(진행자) 여부
  isAlive: boolean;  // 생존 여부 (자신의 단어를 맞추면 false가 됨)
  secretWord: string | null; // 할당된 비밀 단어 (본인은 알 수 없음)
  wordSubmitted: boolean;    // 본인이 다음 사람을 위한 단어를 제출했는지 여부
  penaltyUntil?: number;     // 제재(침묵)가 종료되는 타임스탬프 (ms)
}

export type EndCondition = "firstWin" | "lastLose";

export interface RoomState {
  id: string;
  hostId: string;    // 방장(방 최초 생성자) ID
  players: Player[]; // 참여 중인 모든 플레이어 목록
  topic: string | null;         // 게임 대주제
  endCondition: EndCondition | null; // 게임 종료 조건
  round: number;     // 현재 라운드 수
  turnIndex: number; // 현재 발언 중인 플레이어의 인덱스
  status: "waiting" | "word_submission" | "playing" | "finished"; // 게임 상태
  winnerPlayerId?: string | null; // 승리한 플레이어 ID (종료 시)
  turnActionUsed?: { playerId: string; actionType: "question" | "answer" } | null; // 현재 턴에서 액션 사용 여부
  createdAt: number; // 방 생성 시각
}

// ─────────────────────────────────────────────
// 채팅 메시지 모델
// ─────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  playerId: string; // 메시지를 보낸 사람 (시스템인 경우 "system")
  text: string;     // 메시지 본문
  kind: "chat" | "system" | "guess" | "question" | "answer"; // 메시지 종류
  timestamp: number;
}

// ─────────────────────────────────────────────
// 클라이언트 → 서버 메시지 (요청)
// ─────────────────────────────────────────────

export type ClientToServerMessage =
  | { type: "join_room"; roomId: string; name: string }
  | { type: "leave_room" }
  | { type: "set_topic_and_rule"; topic: string; endCondition: EndCondition }
  | { type: "submit_word"; forPlayerId: string; word: string }
  | { type: "chat"; text: string }
  | { type: "post_question"; text: string }
  | { type: "post_answer"; text: string }
  | { type: "end_turn" }
  | { type: "force_next_turn" }
  | { type: "guess_word"; text: string }
  | { type: "judge_action"; targetPlayerId: string; action: "warn" | "mute_30s" }
  | { type: "restart_game" };

// ─────────────────────────────────────────────
// 서버 → 클라이언트 메시지 (응답/알림)
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
  | { type: "game_restarted" }
  | { type: "error"; message: string };
