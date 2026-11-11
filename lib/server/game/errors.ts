/**
 * errors.ts
 *
 * 클라이언트에게 그대로 보여줘도 되는 "예상된" 에러입니다.
 * 라우터는 GameError 의 status / code / message 를 그대로 응답하고,
 * 그 외의 에러는 500 + 일반 메시지로 숨깁니다.
 */

import { ApiErrorCode } from "@/lib/game/types";

export class GameError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code: ApiErrorCode = "BAD_REQUEST"
  ) {
    super(message);
    this.name = "GameError";
  }
}

export const badRequest = (msg: string) => new GameError(msg, 400, "BAD_REQUEST");
export const forbidden = (msg: string) => new GameError(msg, 403, "FORBIDDEN");
export const invalidState = (msg: string) => new GameError(msg, 409, "INVALID_STATE");
