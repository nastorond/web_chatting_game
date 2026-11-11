/**
 * limits.ts
 *
 * 입력값 길이 제한 등 게임 전반의 상수입니다.
 * (프론트엔드의 lib/game/limits.ts 와 동일하게 유지해야 합니다.)
 */

export const LIMITS = {
  NAME_MAX: 20,       // 닉네임 최대 길이
  TOPIC_MAX: 50,      // 주제 최대 길이
  WORD_MAX: 30,       // 비밀 단어 / 정답 시도 최대 길이
  CHAT_MAX: 300,      // 채팅 / 질문 최대 길이
  ROOM_ID_MAX: 20,    // 방 ID 최대 길이
  MAX_PLAYERS: 12,    // 방 최대 인원 (심판 포함)
  MIN_PLAYERS: 2,     // 게임 시작에 필요한 최소 플레이어 수 (심판 제외)
} as const;
