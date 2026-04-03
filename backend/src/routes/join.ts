import { Router } from "express";
import * as roomManager from "../game/roomManager";

const router = Router();

router.post("/api/room/:roomId/join", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { playerId, name } = req.body;

    if (!playerId || !name) {
      return res.status(400).json({ error: "playerId와 name이 필요합니다." });
    }

    await roomManager.joinRoom(roomId, playerId, name);

    const room = await roomManager.getPublicRoom(roomId);
    const chatMessages = await roomManager.getRoomChatMessages(roomId);
    const visibleWords = await roomManager.getVisibleWords(roomId, playerId);

    return res.json({ room, chatMessages, visibleWords });
  } catch (error: any) {
    console.error("Join error:", error);
    return res.status(500).json({ error: error.message || "서버 내부 오류" });
  }
});

export default router;
