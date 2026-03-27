import { NextRequest, NextResponse } from "next/server";
import * as roomManager from "@/lib/game/roomManager";

/**
 * [POST] /api/room/[roomId]/join
 * 플레이어 ID와 닉네임을 사용해 방에 입장합니다.
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

    // roomManager를 통해 방 입장 처리
    const { messages } = roomManager.joinRoom(roomId, playerId, name);
    const room = roomManager.getPublicRoom(roomId);

    // 이 방의 모든 질문 목록 가져오기
    const questions = roomManager.getRoomQuestions(roomId);

    return NextResponse.json({
      room,
      questions,
      messages,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
