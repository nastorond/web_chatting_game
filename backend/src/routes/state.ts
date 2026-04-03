import { Router } from "express";
import { getPublicRoom, getRoomChatMessages, getVisibleWords } from "../game/roomManager";

const router = Router();

router.get("/api/room/:roomId/state", async (req, res) => {
  try {
    const { roomId } = req.params;
    const playerId = req.query.playerId as string;

    if (!playerId) {
      return res.status(400).json({ error: "playerId 쿼리 파라미터가 필요합니다." });
    }

    const room = await getPublicRoom(roomId);
    const chatMessages = await getRoomChatMessages(roomId);
    const visibleWords = await getVisibleWords(roomId, playerId);

    return res.json({ room, chatMessages, visibleWords });
  } catch (error: any) {
    console.error("State API Error:", error);
    return res.status(404).json({ error: error.message || "방 정보를 불러올 수 없습니다." });
  }
});

export default router;
