/**
 * join/route.ts
 * 
 * 플레이어가 특정 방에 입장할 때 호출되는 API입니다.
 * 플레이어 정보를 등록하고, 현재 방의 최신 상태 및 채팅 기록을 반환합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import * as roomManager from "@/lib/game/roomManager";

/**
 * [POST] /api/room/[roomId]/join
 * 플레이어 ID와 닉네임을 사용해 방에 입장 처리합니다.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await context.params;
    const { playerId, name } = await req.json();

    if (!playerId || !name) {
      return NextResponse.json(
        { error: "playerId와 name이 필요합니다." },
        { status: 400 }
      );
    }

    // roomManager를 통해 비즈니스 로직(입장 처리) 수행
    const { messages } = await roomManager.joinRoom(roomId, playerId, name);

    // 입장 후의 최신 방 상태 및 데이터 조회
    const room = await roomManager.getPublicRoom(roomId);
    const chatMessages = await roomManager.getRoomChatMessages(roomId);
    const visibleWords = await roomManager.getVisibleWords(roomId, playerId);

    return NextResponse.json({
      room,
      chatMessages,
      visibleWords,
      messages,
    });
  } catch (error: any) {
    console.error("Join API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
