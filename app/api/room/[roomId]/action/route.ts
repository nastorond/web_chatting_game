/**
 * action/route.ts
 * 
 * 게임 내의 모든 플레이어 액션(채팅, 질문, 정답 제출, 턴 관리 등)을 처리하는 통합 API 엔드포인트입니다.
 * 클라이언트로부터 받은 action.type에 따라 roomManager의 해당 기능을 호출합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import * as roomManager from "@/lib/game/roomManager";
import { ClientToServerMessage, ServerToClientMessage } from "@/lib/game/types";

/**
 * [POST] /api/room/[roomId]/action
 * 플레이어의 다양한 액션을 처리하고, 변경된 최신 방 상태를 반환합니다.
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

    // 전달된 액션 타입에 따라 roomManager의 각 기능을 호출하는 디스패처
    switch (action.type) {
      case "set_topic_and_rule": // 주제 설정 및 게임 시작
        if (!action.topic || !action.endCondition) {
          return NextResponse.json({ error: "topic과 endCondition이 필요합니다." }, { status: 400 });
        }
        result = await roomManager.setTopicAndRule(roomId, action.topic, action.endCondition);
        break;

      case "submit_word": // 비밀 단어 제출
        if (!action.forPlayerId || !action.word) {
          return NextResponse.json({ error: "forPlayerId와 word가 필요합니다." }, { status: 400 });
        }
        result = await roomManager.submitWord(roomId, playerId, action.forPlayerId, action.word);
        break;

      case "chat": // 일반 채팅
        if (!action.text) {
          return NextResponse.json({ error: "채팅 내용이 필요합니다." }, { status: 400 });
        }
        result = await roomManager.handleChat(roomId, playerId, action.text);
        break;

      case "post_question": // 턴 플레이어의 질문
        if (!action.text) {
          return NextResponse.json({ error: "질문 내용이 필요합니다." }, { status: 400 });
        }
        result = await roomManager.postQuestion(roomId, playerId, action.text);
        break;

      case "post_answer": // 턴 플레이어의 정답 제출
        if (!action.text) {
          return NextResponse.json({ error: "전달할 내용이 필요합니다." }, { status: 400 });
        }
        result = await roomManager.postAnswer(roomId, playerId, action.text);
        break;

      case "end_turn": // 자신의 턴 수동 종료
        result = await roomManager.endTurn(roomId, playerId);
        break;

      case "force_next_turn": // 심판에 의한 턴 강제 넘기기
        result = await roomManager.forceNextTurn(roomId, playerId);
        break;

      case "guess_word": // 단어 추측 (호환성 유지용)
        if (!action.text) {
          return NextResponse.json({ error: "추측할 text가 필요합니다." }, { status: 400 });
        }
        result = await roomManager.handleGuessWord(roomId, playerId, action.text);
        break;

      case "judge_action": // 심판의 제재 액션 (경고, 침묵 등)
        if (!action.targetPlayerId || !action.action) {
          return NextResponse.json({ error: "targetPlayerId와 action이 필요합니다." }, { status: 400 });
        }
        result = await roomManager.handleJudgeAction(roomId, playerId, action.targetPlayerId, action.action);
        break;

      case "restart_game": // 게임 재시작
        result = await roomManager.restartGame(roomId, playerId);
        break;

      case "join_room": // 방 입장
        if (!action.name) {
          return NextResponse.json({ error: "name이 필요합니다." }, { status: 400 });
        }
        const joinRes = await roomManager.joinRoom(roomId, playerId, action.name);
        result = { messages: joinRes.messages };
        break;

      case "leave_room": // 방 퇴장
        const leaveRes = await roomManager.leaveRoom(roomId, playerId);
        if (!leaveRes.room) {
          // 방의 마지막 플레이어가 나가서 방이 삭제된 경우
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

    // 액션 처리 완료 후, 클라이언트 동기화를 위해 최신 상태 정보를 함께 반환
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
