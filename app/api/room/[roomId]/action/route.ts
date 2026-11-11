/**
 * POST /api/room/[roomId]/action
 * 게임 액션 처리 (X-Player-Token 필요). 상태를 바꾸는 작업은 방 단위 잠금 안에서 실행합니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticate, leaveRoom, getRoomSnapshot } from "@/lib/server/game/roomService";
import {
  setTopicAndRule,
  submitWord,
  postQuestion,
  postAnswer,
  endTurn,
  forceNextTurn,
  handleJudgeAction,
  restartGame,
} from "@/lib/server/game/gameService";
import { handleChat } from "@/lib/server/game/chatService";
import { withRoomLock } from "@/lib/server/game/lock";
import { badRequest } from "@/lib/server/game/errors";
import * as v from "@/lib/server/game/validate";
import { ServerToClientMessage } from "@/lib/game/types";
import { readJson, readToken, errorResponse } from "@/lib/server/http";

type Action = { type?: unknown; [key: string]: unknown };

export async function POST(req: NextRequest, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const roomId = v.roomId((await ctx.params).roomId);
    const body = await readJson(req);
    const playerId = v.playerId(body.playerId);
    const action = body.action as Action | undefined;
    if (!action || typeof action.type !== "string") throw badRequest("action 필드가 필요합니다.");

    await authenticate(roomId, playerId, readToken(req));

    const messages = await withRoomLock(roomId, async (): Promise<ServerToClientMessage[] | null> => {
      switch (action.type) {
        case "set_topic_and_rule":
          return (await setTopicAndRule(roomId, playerId, action.topic, action.endCondition)).messages;
        case "submit_word":
          return (await submitWord(roomId, playerId, action.forPlayerId, action.word)).messages;
        case "chat":
          return (await handleChat(roomId, playerId, action.text)).messages;
        case "post_question":
          return (await postQuestion(roomId, playerId, action.text)).messages;
        case "post_answer":
        case "guess_word":
          return (await postAnswer(roomId, playerId, action.text)).messages;
        case "end_turn":
          return (await endTurn(roomId, playerId)).messages;
        case "force_next_turn":
          return (await forceNextTurn(roomId, playerId)).messages;
        case "judge_action":
          return (await handleJudgeAction(roomId, playerId, action.targetPlayerId, action.action)).messages;
        case "restart_game":
          return (await restartGame(roomId, playerId)).messages;
        case "leave_room":
          await leaveRoom(roomId, playerId);
          return null;
        default:
          throw badRequest("지원하지 않는 액션 타입입니다.");
      }
    });

    // 퇴장한 경우 더 이상 볼 방이 없음
    if (messages === null) {
      return NextResponse.json({ room: null, chatMessages: [], visibleWords: [], version: 0, messages: [] });
    }

    const snapshot = await getRoomSnapshot(roomId, playerId, { markSeen: true });
    return NextResponse.json({ ...snapshot, messages });
  } catch (error) {
    return errorResponse(error, "action");
  }
}
