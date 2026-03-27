import { NextRequest, NextResponse } from "next/server";
import { getPublicRoom, getRoomChatMessages } from "@/lib/game/roomManager";

/**
 * [GET] /api/room/[roomId]/state
 * 방의 최신 상태(RoomState)와 채팅 메시지 리스트를 반환합니다.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await context.params;

    const room = getPublicRoom(roomId);
    const chatMessages = getRoomChatMessages(roomId);

    return NextResponse.json({
      room,
      chatMessages,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "방을 찾을 수 없습니다." },
      { status: 404 }
    );
  }
}
