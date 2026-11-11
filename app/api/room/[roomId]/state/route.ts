/**
 * GET /api/room/[roomId]/state?playerId=...
 * 클라이언트가 1초마다 호출하는 상태 동기화 API (X-Player-Token 필요)
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticate, getRoomSnapshot } from "@/lib/server/game/roomService";
import { shouldSweep, sweepRoom } from "@/lib/server/game/presenceService";
import { touchRoom } from "@/lib/server/game/store";
import { withRoomLock } from "@/lib/server/game/lock";
import * as v from "@/lib/server/game/validate";
import { readToken, errorResponse, shouldTouch } from "@/lib/server/http";

export async function GET(req: NextRequest, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const roomId = v.roomId((await ctx.params).roomId);
    const playerId = v.playerId(req.nextUrl.searchParams.get("playerId"));
    await authenticate(roomId, playerId, readToken(req));

    if (shouldSweep(roomId)) {
      await withRoomLock(roomId, () => sweepRoom(roomId));
    }

    const snapshot = await getRoomSnapshot(roomId, playerId, { markSeen: true });
    if (snapshot.room && shouldTouch(roomId)) await touchRoom(roomId, snapshot.room);
    return NextResponse.json(snapshot);
  } catch (error) {
    return errorResponse(error, "state");
  }
}
