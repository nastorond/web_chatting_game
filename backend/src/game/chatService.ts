import { ChatMessage, RoomState, ServerToClientMessage } from "./types";
import { getChatMessages, saveChatMessages } from "./store";
import { getRoom, getPlayer, generateId } from "./utils";

export async function addSystemMessage(roomId: string, text: string): Promise<void> {
  const messages = await getChatMessages(roomId);
  const sysMsg: ChatMessage = {
    id: generateId(),
    playerId: "system",
    text,
    kind: "system",
    timestamp: Date.now(),
  };
  messages.push(sysMsg);
  await saveChatMessages(roomId, messages);
}

export async function handleChat(
  roomId: string,
  playerId: string,
  text: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  const room = await getRoom(roomId);
  const player = getPlayer(room, playerId);

  if (player.penaltyUntil && player.penaltyUntil > Date.now()) {
    throw new Error("채팅 금지 상태입니다.");
  }

  const messages = await getChatMessages(roomId);
  const chatMsg: ChatMessage = {
    id: generateId(),
    playerId,
    text,
    kind: "chat",
    timestamp: Date.now(),
  };
  messages.push(chatMsg);
  await saveChatMessages(roomId, messages);

  return { room, messages: [{ type: "chat_posted", message: chatMsg }] };
}

export async function getRoomChatMessages(roomId: string): Promise<ChatMessage[]> {
  return getChatMessages(roomId);
}
