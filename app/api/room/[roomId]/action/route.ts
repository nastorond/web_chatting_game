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
        result = await roomManager.setTopicAndRule(roomId, action.topic, action.endCondition);
        break;

      case "submit_word":
        if (!action.forPlayerId || !action.word) {
          return NextResponse.json({ error: "forPlayerId와 word가 필요합니다." }, { status: 400 });
        }
        result = await roomManager.submitWord(roomId, playerId, action.forPlayerId, action.word);
        break;

      case "chat":
        if (!action.text) {
          return NextResponse.json({ error: "채팅 내용이 필요합니다." }, { status: 400 });
        }
        result = await roomManager.handleChat(roomId, playerId, action.text);
        break;

      case "post_question":
        if (!action.text) {
          return NextResponse.json({ error: "질문 내용이 필요합니다." }, { status: 400 });
        }
        result = await roomManager.postQuestion(roomId, playerId, action.text);
        break;

      case "post_answer":
        if (!action.text) {
          return NextResponse.json({ error: "전달할 내용이 필요합니다." }, { status: 400 });
        }
        result = await roomManager.postAnswer(roomId, playerId, action.text);
        break;

      case "end_turn":
        result = await roomManager.endTurn(roomId, playerId);
        break;

      case "force_next_turn":
        result = await roomManager.forceNextTurn(roomId, playerId);
        break;

      case "guess_word":
        if (!action.text) {
          return NextResponse.json({ error: "추측할 text가 필요합니다." }, { status: 400 });
        }
        result = await roomManager.handleGuessWord(roomId, playerId, action.text);
        break;

      case "judge_action":
        if (!action.targetPlayerId || !action.action) {
          return NextResponse.json({ error: "targetPlayerId와 action이 필요합니다." }, { status: 400 });
        }
        result = await roomManager.handleJudgeAction(roomId, playerId, action.targetPlayerId, action.action);
        break;

      case "join_room":
        if (!action.name) {
          return NextResponse.json({ error: "name이 필요합니다." }, { status: 400 });
        }
        const joinRes = await roomManager.joinRoom(roomId, playerId, action.name);
        result = { messages: joinRes.messages };
        break;

      case "leave_room":
        const leaveRes = await roomManager.leaveRoom(roomId, playerId);
        if (!leaveRes.room) {
          // 방이 삭제된 경우
          return NextResponse.json({
            room: null,
            chatMessages: [],
            visibleWords: [],
            messages: leaveRes.messages,
          });
        }
        result = { messages: leaveRes.messages };
        break;

      default:
        return NextResponse.json({ error: "지원하지 않는 액션 타입입니다." }, { status: 400 });
    }

    // 처리 후 최신 상태 및 가시 단어 목록 반환
    const room = await roomManager.getPublicRoom(roomId);
    const chatMessages = await roomManager.getRoomChatMessages(roomId);
    const visibleWords = await roomManager.getVisibleWords(roomId, playerId);

    return NextResponse.json({
      room,
      chatMessages,
      visibleWords,
      messages: result?.messages || [],
    });
  } catch (error: any) {
    console.error("Action handler error:", error);
    return NextResponse.json({ error: error.message || "서버 내부 오류" }, { status: 500 });
  }
}
