/**
 * state/route.ts
 * 
 * 특정 방의 동기화를 위해 최신 상태 정보를 조회하는 API입니다.
 * 클라이언트는 이 API를 주기적으로 호출(Polling)하여 실시간 게임 진행 상황을 업데이트합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPublicRoom, getRoomChatMessages, getVisibleWords } from "@/lib/game/roomManager";

/**
 * [GET] /api/room/[roomId]/state
 * 방의 최신 상태(RoomState), 최근 채팅 메시지, 그리고 요청자별 가시 단어 목록을 반환합니다.
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
      return NextResponse.json({ error: "playerId 쿼리 파라미터가 필요합니다." }, { status: 400 });
    }

    // roomManager를 통해 공개된 방 상태, 채팅, 가시 단어 정보를 조회
    const room = await getPublicRoom(roomId);
    const chatMessages = await getRoomChatMessages(roomId);
    const visibleWords = await getVisibleWords(roomId, playerId);

    return NextResponse.json({
      room,
      chatMessages,
      visibleWords,
    });
  } catch (error: any) {
    console.error("State API Error:", error);
    return NextResponse.json(
      { error: error.message || "방 정보를 불러올 수 없습니다." },
      { status: 404 }
    );
  }
}
