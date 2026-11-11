/**
 * validate.ts
 *
 * 클라이언트 입력값 검증 헬퍼입니다. 실패하면 400 GameError 를 던집니다.
 */

import { badRequest } from "./errors";
import { LIMITS } from "./limits";
import { EndCondition } from "./types";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 문자열인지 확인하고, 앞뒤 공백을 제거한 뒤 길이를 검사합니다. */
export function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw badRequest(`${label}이(가) 필요합니다.`);
  const trimmed = value.trim();
  if (!trimmed) throw badRequest(`${label}이(가) 비어 있습니다.`);
  if (trimmed.length > max) throw badRequest(`${label}은(는) ${max}자 이하로 입력해주세요.`);
  return trimmed;
}

export function id(value: unknown, label: string, max = 40): string {
  if (typeof value !== "string" || !value || value.length > max || !ID_PATTERN.test(value)) {
    throw badRequest(`올바르지 않은 ${label}입니다.`);
  }
  return value;
}

export const roomId = (value: unknown) => id(value, "방 ID", LIMITS.ROOM_ID_MAX);
export const playerId = (value: unknown) => id(value, "플레이어 ID");

export function endCondition(value: unknown): EndCondition {
  if (value !== "firstWin" && value !== "lastLose") throw badRequest("올바르지 않은 게임 모드입니다.");
  return value;
}

export function judgeAction(value: unknown): "warn" | "mute_30s" {
  if (value !== "warn" && value !== "mute_30s") throw badRequest("올바르지 않은 심판 조치입니다.");
  return value;
}
