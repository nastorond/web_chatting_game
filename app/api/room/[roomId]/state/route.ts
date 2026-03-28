import { NextRequest, NextResponse } from "next/server";
import { getPublicRoom, getRoomChatMessages, getVisibleWords } from "@/lib/game/roomManager";

/**
 * [GET] /api/room/[roomId]/state
 * 방의 최신 상태(RoomState), 채팅 메시지 소량, 그리고 관찰자별 가시 단어 목록을 반환합니다.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await context.params;
    const { searchParams } = new URL(req.url);
    const playerId = searchParams.get("playerId");

    if (!playerId) {
      return NextResponse.json({ error: "playerId query parameter is required" }, { status: 400 });
    }

    const room = await getPublicRoom(roomId);
    const chatMessages = await getRoomChatMessages(roomId);
    const visibleWords = await getVisibleWords(roomId, playerId);

    return NextResponse.json({
      room,
      chatMessages,
      visibleWords,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "방을 찾을 수 없습니다." },
      { status: 404 }
    );
  }
}
