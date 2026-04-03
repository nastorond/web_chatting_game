import { Router } from "express";
import * as roomManager from "../game/roomManager";
import { ClientToServerMessage, ServerToClientMessage } from "../game/types";

const router = Router();

router.post("/api/room/:roomId/action", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { playerId, action }: { playerId: string; action: ClientToServerMessage } = req.body;

    if (!roomId || !playerId || !action) {
      return res.status(400).json({ error: "roomId, playerId, action 필드가 필요합니다." });
    }

    let result: { messages: ServerToClientMessage[] } | null = null;

    switch (action.type) {
      case "set_topic_and_rule":
        if (!action.topic || !action.endCondition) {
          return res.status(400).json({ error: "topic과 endCondition이 필요합니다." });
        }
        result = await roomManager.setTopicAndRule(roomId, action.topic, action.endCondition);
        break;

      case "submit_word":
        if (!action.forPlayerId || !action.word) {
          return res.status(400).json({ error: "forPlayerId와 word가 필요합니다." });
        }
        result = await roomManager.submitWord(roomId, playerId, action.forPlayerId, action.word);
        break;

      case "chat":
        if (!action.text) {
          return res.status(400).json({ error: "채팅 내용이 필요합니다." });
        }
        result = await roomManager.handleChat(roomId, playerId, action.text);
        break;

      case "post_question":
        if (!action.text) {
          return res.status(400).json({ error: "질문 내용이 필요합니다." });
        }
        result = await roomManager.postQuestion(roomId, playerId, action.text);
        break;

      case "post_answer":
        if (!action.text) {
          return res.status(400).json({ error: "전달할 내용이 필요합니다." });
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
          return res.status(400).json({ error: "추측할 text가 필요합니다." });
        }
        result = await roomManager.handleGuessWord(roomId, playerId, action.text);
        break;

      case "judge_action":
        if (!action.targetPlayerId || !action.action) {
          return res.status(400).json({ error: "targetPlayerId와 action이 필요합니다." });
        }
        result = await roomManager.handleJudgeAction(roomId, playerId, action.targetPlayerId, action.action);
        break;

      case "restart_game":
        result = await roomManager.restartGame(roomId, playerId);
        break;

      case "join_room":
        if (!action.name) {
          return res.status(400).json({ error: "name이 필요합니다." });
        }
        const joinRes = await roomManager.joinRoom(roomId, playerId, action.name);
        result = { messages: joinRes.messages };
        break;

      case "leave_room":
        const leaveRes = await roomManager.leaveRoom(roomId, playerId);
        if (!leaveRes.room) {
          return res.json({
            room: null,
            chatMessages: [],
            visibleWords: [],
            messages: leaveRes.messages,
          });
        }
        result = { messages: leaveRes.messages };
        break;

      default:
        return res.status(400).json({ error: "지원하지 않는 액션 타입입니다." });
    }

    const room = await roomManager.getPublicRoom(roomId);
    const chatMessages = await roomManager.getRoomChatMessages(roomId);
    const visibleWords = await roomManager.getVisibleWords(roomId, playerId);

    return res.json({
      room,
      chatMessages,
      visibleWords,
      messages: result?.messages || [],
    });
  } catch (error: any) {
    console.error("Action handler error:", error);
    return res.status(500).json({ error: error.message || "서버 내부 오류" });
  }
});

export default router;
