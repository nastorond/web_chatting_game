/**
 * POST /api/room/[roomId]/join
 * 방에 입장(없으면 생성)하고 인증 토큰과 현재 상태를 반환합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { joinRoom, getRoomSnapshot } from "@/lib/server/game/roomService";
import { withRoomLock } from "@/lib/server/game/lock";
import { LIMITS } from "@/lib/game/limits";
import * as v from "@/lib/server/game/validate";
import { readJson, readToken, errorResponse } from "@/lib/server/http";

export async function POST(req: NextRequest, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const roomId = v.roomId((await ctx.params).roomId);
    const body = await readJson(req);
    const playerId = v.playerId(body.playerId);
    const name = v.text(body.name, "닉네임", LIMITS.NAME_MAX);

    const { token } = await withRoomLock(roomId, () => joinRoom(roomId, playerId, name, readToken(req)));
    const snapshot = await getRoomSnapshot(roomId, playerId);
    return NextResponse.json({ ...snapshot, token });
  } catch (error) {
    return errorResponse(error, "join");
  }
}
