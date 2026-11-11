/**
 * chatService.ts
 *
 * 채팅 / 시스템 메시지 추가 로직입니다.
 * 채팅은 Redis 리스트에 RPUSH 로 원자적으로 추가되므로 동시에 보내도 유실되지 않습니다.
 */

import { ChatMessage, RoomState, ServerToClientMessage } from "./types";
import { appendChat } from "./store";
import { getRoom, getPlayer, generateId } from "./utils";
import { GameError } from "./errors";
import { LIMITS } from "./limits";
import * as v from "./validate";

export async function addSystemMessage(roomId: string, text: string): Promise<void> {
  await appendChat(roomId, {
    id: generateId(),
    playerId: "system",
    text,
    kind: "system",
    timestamp: Date.now(),
  });
}

export async function addPlayerMessage(
  roomId: string,
  playerId: string,
  name: string,
  kind: ChatMessage["kind"],
  text: string
): Promise<ChatMessage> {
  const msg: ChatMessage = { id: generateId(), playerId, name, text, kind, timestamp: Date.now() };
  await appendChat(roomId, msg);
  return msg;
}

export function assertNotMuted(player: { penaltyUntil?: number }, what = ""): void {
  if (player.penaltyUntil && player.penaltyUntil > Date.now()) {
    const sec = Math.ceil((player.penaltyUntil - Date.now()) / 1000);
    throw new GameError(`채팅 금지 상태입니다.${what ? ` ${what}` : ""} (${sec}초 남음)`, 403, "FORBIDDEN");
  }
}

export async function handleChat(
  roomId: string,
  playerId: string,
  rawText: unknown
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  const text = v.text(rawText, "채팅 내용", LIMITS.CHAT_MAX);
  const room = await getRoom(roomId);
  const player = getPlayer(room, playerId);
  assertNotMuted(player);

  const msg = await addPlayerMessage(roomId, playerId, player.name, "chat", text);
  return { room, messages: [{ type: "chat_posted", message: msg }] };
}
