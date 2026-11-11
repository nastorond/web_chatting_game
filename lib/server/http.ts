/**
 * http.ts
 *
 * API 라우트 공통 헬퍼: 에러 응답 변환, 인증 토큰 읽기, 요청 본문 파싱
 */

import { NextRequest, NextResponse } from "next/server";
import { GameError, badRequest } from "./game/errors";

export const TOKEN_HEADER = "x-player-token";

export function readToken(req: NextRequest): string | undefined {
  return req.headers.get(TOKEN_HEADER) || undefined;
}

const MAX_BODY_BYTES = 16 * 1024;

/** JSON 본문을 읽습니다. 너무 크거나 형식이 잘못되면 400. */
export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw badRequest("요청 본문이 너무 큽니다.");
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object") return data;
  } catch { /* 아래에서 처리 */ }
  throw badRequest("잘못된 요청 형식입니다.");
}

/** GameError 는 그대로, 그 외 에러는 내부 정보를 숨기고 500 으로 응답합니다. */
export function errorResponse(error: unknown, label: string) {
  if (error instanceof GameError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(`[${label}]`, error);
  return NextResponse.json({ error: "서버 내부 오류가 발생했습니다.", code: "INTERNAL" }, { status: 500 });
}

const lastTouchAt = new Map<string, number>();
const TOUCH_INTERVAL_MS = 60_000;

/** 방 TTL 연장은 인스턴스당 방마다 1분에 한 번만 (Redis 명령 수 절약) */
export function shouldTouch(roomId: string, now = Date.now()): boolean {
  if (now - (lastTouchAt.get(roomId) ?? 0) < TOUCH_INTERVAL_MS) return false;
  lastTouchAt.set(roomId, now);
  if (lastTouchAt.size > 5_000) {
    for (const [id, at] of lastTouchAt) if (now - at > 10 * 60_000) lastTouchAt.delete(id);
  }
  return true;
}
