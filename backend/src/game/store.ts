import { RoomState, ChatMessage } from "./types";
import { redis } from "../lib/redis";

const ROOM_TTL = 3600;
const FINISHED_ROOM_TTL = 300;

export async function getRoomFromRedis(roomId: string): Promise<RoomState | null> {
  const raw = await redis.get(`room:${roomId}`);
  return raw ? (JSON.parse(raw) as RoomState) : null;
}

export async function saveRoom(roomId: string, room: RoomState): Promise<void> {
  const ttl = room.status === "finished" ? FINISHED_ROOM_TTL : ROOM_TTL;
  await redis.set(`room:${roomId}`, JSON.stringify(room), "EX", ttl);
}

export async function deleteRoom(roomId: string): Promise<void> {
  await redis.del(`room:${roomId}`, `chat:${roomId}`);
}

export async function getChatMessages(roomId: string): Promise<ChatMessage[]> {
  const raw = await redis.get(`chat:${roomId}`);
  return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
}

export async function saveChatMessages(roomId: string, messages: ChatMessage[]): Promise<void> {
  const trimmed = messages.slice(-200);
  const room = await getRoomFromRedis(roomId);
  const ttl = room?.status === "finished" ? FINISHED_ROOM_TTL : ROOM_TTL;
  await redis.set(`chat:${roomId}`, JSON.stringify(trimmed), "EX", ttl);
}
