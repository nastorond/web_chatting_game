import { NextRequest, NextResponse } from "next/server";
import * as roomManager from "@/lib/game/roomManager";
import { ClientToServerMessage, ServerToClientMessage } from "@/lib/game/types";

/**
 * [POST] /api/room/[roomId]/action
 * 플레이어의 다양한 액션(발언, 단어 제출, 정답 추측, 심판 조치 등)을 처리합니다.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await context.params;
    const { playerId, action }: { playerId: string; action: ClientToServerMessage } = await req.json();

    if (!roomId || !playerId || !action) {
      return NextResponse.json(
        { error: "roomId, playerId, action 필드가 필요합니다." },
        { status: 400 }
      );
    }

    let result: { messages: ServerToClientMessage[] } | null = null;

    // 액션 타입별 디스패처
    switch (action.type) {
      case "set_topic_and_rule":
        if (!action.topic || !action.endCondition) {
          return NextResponse.json({ error: "topic과 endCondition이 필요합니다." }, { status: 400 });
        }
        result = roomManager.setTopicAndRule(roomId, action.topic, action.endCondition);
        break;

      case "submit_word":
        if (!action.forPlayerId || !action.word) {
          return NextResponse.json({ error: "forPlayerId와 word가 필요합니다." }, { status: 400 });
        }
        result = roomManager.submitWord(roomId, playerId, action.forPlayerId, action.word);
        break;

      case "chat":
        if (!action.text) {
          return NextResponse.json({ error: "채팅 내용이 필요합니다." }, { status: 400 });
        }
        result = roomManager.handleChat(roomId, playerId, action.text);
        break;

      case "guess_word":
        if (!action.text) {
          return NextResponse.json({ error: "추측할 text가 필요합니다." }, { status: 400 });
        }
        result = roomManager.handleGuessWord(roomId, playerId, action.text);
        break;

      case "judge_action":
        if (!action.targetPlayerId || !action.action) {
          return NextResponse.json({ error: "targetPlayerId와 action이 필요합니다." }, { status: 400 });
        }
        result = roomManager.handleJudgeAction(roomId, playerId, action.targetPlayerId, action.action);
        break;

      case "join_room":
        if (!action.name) {
          return NextResponse.json({ error: "name이 필요합니다." }, { status: 400 });
        }
        const joinRes = roomManager.joinRoom(roomId, playerId, action.name);
        result = { messages: joinRes.messages };
        break;

      case "leave_room":
        const leaveRes = roomManager.leaveRoom(roomId, playerId);
        result = { messages: leaveRes.messages };
        break;

      default:
        return NextResponse.json({ error: "지원하지 않는 액션 타입입니다." }, { status: 400 });
    }

    // 처리 후 최신 상태 반환
    const room = roomManager.getPublicRoom(roomId);
    const chatMessages = roomManager.getRoomChatMessages(roomId);

    return NextResponse.json({
      room,
      chatMessages,
      messages: result?.messages || [],
    });
  } catch (error: any) {
    console.error("Action handler error:", error);
    return NextResponse.json({ error: error.message || "서버 내부 오류" }, { status: 500 });
  }
}
