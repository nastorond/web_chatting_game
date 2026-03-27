import { NextRequest, NextResponse } from "next/server";
import * as roomManager from "@/lib/game/roomManager";
import { ClientToServerMessage, ServerToClientMessage } from "@/lib/game/types";

/**
 * [POST] /api/room/[roomId]/action
 * 플레이어의 액션을 처리하고 업데이트된 상태를 반환합니다.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await context.params;
    const { playerId, action }: { playerId: string; action: ClientToServerMessage } = await req.json();

    if (!playerId || !action) {
      return NextResponse.json(
        { error: "playerId와 action이 필요합니다." },
        { status: 400 }
      );
    }

    let result: { messages: ServerToClientMessage[] } | null = null;

    // 액션 타입에 따라 roomManager 함수 호출
    switch (action.type) {
      case "set_topic_and_rule":
        result = roomManager.setTopicAndRule(roomId, action.topic, action.endCondition);
        break;
      case "submit_word":
        result = roomManager.submitWord(roomId, playerId, action.forPlayerId, action.word);
        break;
      case "ask_question":
        result = roomManager.handleAskQuestion(roomId, playerId, action.toPlayerId, action.text);
        break;
      case "answer_question":
        result = roomManager.handleAnswerQuestion(roomId, playerId, action.questionId, action.text);
        break;
      case "guess_word":
        result = roomManager.handleGuessWord(roomId, playerId, action.text);
        break;
      case "judge_action":
        result = roomManager.handleJudgeAction(roomId, playerId, action.targetPlayerId, action.action);
        break;
      case "join_room":
        // join_room은 별도의 /join 엔드포인트에서 처리하지만, 여기서도 호출 가능하게 둠
        const joinRes = roomManager.joinRoom(roomId, playerId, action.name);
        result = { messages: joinRes.messages };
        break;
      default:
        return NextResponse.json({ error: "알 수 없는 액션 타입입니다." }, { status: 400 });
    }

    // 변경된 최신 상태 가져오기
    const room = roomManager.getPublicRoom(roomId);
    const questions = roomManager.getRoomQuestions(roomId);

    return NextResponse.json({
      room,
      questions,
      messages: result?.messages || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
