import { NextRequest, NextResponse } from "next/server";
import * as roomManager from "@/lib/game/roomManager";

/**
 * [GET] /api/room/[roomId]/state
 * 방의 최신 상태와 질문 목록을 가져옵니다. (폴링용)
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await context.params;

    const room = roomManager.getPublicRoom(roomId);
    if (!room) {
      return NextResponse.json(
        { error: "방을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const questions = roomManager.getRoomQuestions(roomId);

    return NextResponse.json({
      room,
      questions,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
}
