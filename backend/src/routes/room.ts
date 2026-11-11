/**
 * room.ts
 *
 * 방 관련 HTTP API
 *   POST /api/room/:roomId/join    입장 (토큰 발급)
 *   GET  /api/room/:roomId/state   상태 폴링 (X-Player-Token 필요)
 *   POST /api/room/:roomId/action  게임 액션 (X-Player-Token 필요)
 *
 * 상태를 바꾸는 작업은 모두 withRoomLock 으로 방 단위 직렬화합니다.
 */

import { Router } from "express";
import { authenticate, joinRoom, leaveRoom, getRoomSnapshot } from "../game/roomService";
import {
  setTopicAndRule,
  submitWord,
  postQuestion,
  postAnswer,
  endTurn,
  forceNextTurn,
  handleJudgeAction,
  restartGame,
} from "../game/gameService";
import { handleChat } from "../game/chatService";
import { shouldSweep, sweepRoom } from "../game/presenceService";
import { touchRoom } from "../game/store";
import { withRoomLock } from "../game/lock";
import { badRequest } from "../game/errors";
import { LIMITS } from "../game/limits";
import * as v from "../game/validate";
import { ServerToClientMessage } from "../game/types";
import { readToken, sendError } from "./helpers";

const router = Router();

router.post("/api/room/:roomId/join", async (req, res) => {
  try {
    const roomId = v.roomId(req.params.roomId);
    const playerId = v.playerId(req.body?.playerId);
    const name = v.text(req.body?.name, "닉네임", LIMITS.NAME_MAX);

    const { token } = await withRoomLock(roomId, () => joinRoom(roomId, playerId, name, readToken(req)));
    const snapshot = await getRoomSnapshot(roomId, playerId);
    return res.json({ ...snapshot, token });
  } catch (error) {
    return sendError(res, error, "join");
  }
});

router.get("/api/room/:roomId/state", async (req, res) => {
  try {
    const roomId = v.roomId(req.params.roomId);
    const playerId = v.playerId(req.query.playerId);
    await authenticate(roomId, playerId, readToken(req));

    if (shouldSweep(roomId)) {
      await withRoomLock(roomId, () => sweepRoom(roomId));
    }

    const snapshot = await getRoomSnapshot(roomId, playerId);
    if (snapshot.room) await touchRoom(roomId, snapshot.room);
    return res.json(snapshot);
  } catch (error) {
    return sendError(res, error, "state");
  }
});

router.post("/api/room/:roomId/action", async (req, res) => {
  try {
    const roomId = v.roomId(req.params.roomId);
    const playerId = v.playerId(req.body?.playerId);
    const action = req.body?.action;
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
      return res.json({ room: null, chatMessages: [], visibleWords: [], version: 0, messages: [] });
    }

    const snapshot = await getRoomSnapshot(roomId, playerId);
    return res.json({ ...snapshot, messages });
  } catch (error) {
    return sendError(res, error, "action");
  }
});

export default router;
