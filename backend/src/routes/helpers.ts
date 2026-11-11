/**
 * helpers.ts
 *
 * 라우터 공통 헬퍼: 에러 응답 변환, 인증 토큰 읽기
 */

import type { Request, Response } from "express";
import { GameError } from "../game/errors";

export const TOKEN_HEADER = "x-player-token";

export function readToken(req: Request): string | undefined {
  const value = req.header(TOKEN_HEADER);
  return value || undefined;
}

/** GameError 는 그대로, 그 외 에러는 내부 정보를 숨기고 500 으로 응답합니다. */
export function sendError(res: Response, error: unknown, label: string) {
  if (error instanceof GameError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error(`[${label}]`, error);
  return res.status(500).json({ error: "서버 내부 오류가 발생했습니다.", code: "INTERNAL" });
}
