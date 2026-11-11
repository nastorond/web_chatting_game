/**
 * utils.ts
 *
 * 방 / 플레이어 조회, 공개용 변환, 차례 계산 등 서비스 공통 헬퍼입니다.
 */

import { randomBytes } from "crypto";
import { RoomState, Player } from "@/lib/game/types";
import { getRoomFromRedis } from "./store";
import { GameError } from "./errors";

/** 이 시간 안에 요청이 있었으면 "접속 중"으로 표시합니다. */
export const ONLINE_WINDOW_MS = 15_000;

export async function getRoom(roomId: string): Promise<RoomState> {
  const room = await getRoomFromRedis(roomId);
  if (!room) throw new GameError("방을 찾을 수 없습니다.", 404, "ROOM_NOT_FOUND");
  return room;
}

export function getPlayer(room: RoomState, playerId: string): Player {
  const player = room.players.find((pl) => pl.id === playerId);
  if (!player) throw new GameError("이 방에 참가하지 않은 플레이어입니다.", 403, "NOT_IN_ROOM");
  return player;
}

export function isOnline(presence: Record<string, number>, playerId: string, now = Date.now()): boolean {
  const seen = presence[playerId];
  return seen !== undefined && now - seen <= ONLINE_WINDOW_MS;
}

/** 클라이언트에 보낼 수 있도록 비밀 단어를 제거하고 접속 여부를 채웁니다. */
export function publicRoom(room: RoomState, presence: Record<string, number> = {}): RoomState {
  const now = Date.now();
  return {
    ...room,
    players: room.players.map(({ secretWord: _w, ...rest }) => ({
      ...rest,
      secretWord: null,
      isOnline: isOnline(presence, rest.id, now),
    })),
  };
}

export function generateId(): string {
  return randomBytes(6).toString("base64url");
}

export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}
