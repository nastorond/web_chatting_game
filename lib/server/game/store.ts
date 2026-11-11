/**
 * store.ts
 *
 * Redis(Upstash) 저장소 계층입니다. 방 하나는 아래 키들로 구성됩니다.
 *   room:{id}      방 상태 (JSON 문자열)
 *   chatlog:{id}   채팅 로그 (메시지 하나당 리스트 원소 하나 → RPUSH 로 원자적 추가)
 *   tokens:{id}    playerId → 인증 토큰 (hash)
 *   presence:{id}  playerId → 마지막 요청 시각 ms (hash)
 *   ver:{id}       상태 버전 카운터 (변경될 때마다 INCR)
 *
 * 모든 키는 같은 TTL 로 함께 연장됩니다. 접속자가 폴링하는 동안에는 주기적으로 연장되므로
 * 사람이 있는 방은 만료되지 않고, 모두 떠난 방만 TTL 후 정리됩니다.
 */

import { RoomState, ChatMessage } from "@/lib/game/types";
import { redis } from "../redis";

const ACTIVE_ROOM_TTL = 3600;  // 진행 중인 방: 1시간
const FINISHED_ROOM_TTL = 300; // 종료된 방: 5분
const CHAT_HISTORY = 200;      // 보관할 채팅 개수

type Multi = ReturnType<typeof redis.multi>;

const keys = (roomId: string) => ({
  room: `room:${roomId}`,
  chat: `chatlog:${roomId}`,
  tokens: `tokens:${roomId}`,
  presence: `presence:${roomId}`,
  version: `ver:${roomId}`,
  legacyChat: `chat:${roomId}`, // 예전 버전에서 쓰던 키 (삭제 시 함께 정리)
});

const ttlFor = (room: RoomState | null) =>
  room?.status === "finished" ? FINISHED_ROOM_TTL : ACTIVE_ROOM_TTL;

function expireAll(multi: Multi, roomId: string, ttl: number) {
  const k = keys(roomId);
  multi.expire(k.room, ttl);
  multi.expire(k.chat, ttl);
  multi.expire(k.tokens, ttl);
  multi.expire(k.presence, ttl);
  multi.expire(k.version, ttl);
}

function parseRoom(raw: unknown): RoomState | null {
  return typeof raw === "string" ? (JSON.parse(raw) as RoomState) : null;
}

function parsePresence(raw: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, ts] of Object.entries(raw ?? {})) out[id] = Number(ts);
  return out;
}

// ─── 방 상태 ─────────────────────────────────────

export async function getRoomFromRedis(roomId: string): Promise<RoomState | null> {
  return parseRoom(await redis.get(keys(roomId).room));
}

export async function saveRoom(roomId: string, room: RoomState): Promise<void> {
  const ttl = ttlFor(room);
  const k = keys(roomId);
  const multi = redis.multi();
  multi.set(k.room, JSON.stringify(room), { ex: ttl });
  multi.incr(k.version);
  expireAll(multi, roomId, ttl);
  await multi.exec();
}

export async function deleteRoom(roomId: string): Promise<void> {
  const k = keys(roomId);
  await redis.del(k.room, k.chat, k.tokens, k.presence, k.version, k.legacyChat);
}

/** 방이 사용 중이므로 모든 키의 TTL 을 연장합니다. */
export async function touchRoom(roomId: string, room: RoomState): Promise<void> {
  const multi = redis.multi();
  expireAll(multi, roomId, ttlFor(room));
  await multi.exec();
}

// ─── 채팅 ───────────────────────────────────────

export async function appendChat(roomId: string, message: ChatMessage): Promise<void> {
  const k = keys(roomId);
  const multi = redis.multi();
  multi.rpush(k.chat, JSON.stringify(message));
  multi.ltrim(k.chat, -CHAT_HISTORY, -1);
  multi.expire(k.chat, ACTIVE_ROOM_TTL);
  multi.incr(k.version);
  await multi.exec();
}

export async function clearChat(roomId: string): Promise<void> {
  const k = keys(roomId);
  const multi = redis.multi();
  multi.del(k.chat);
  multi.incr(k.version);
  await multi.exec();
}

// ─── 인증 토큰 ───────────────────────────────────

export async function getToken(roomId: string, playerId: string): Promise<string | null> {
  const value = await redis.hget(keys(roomId).tokens, playerId);
  return typeof value === "string" ? value : null;
}

export async function setToken(roomId: string, playerId: string, token: string): Promise<void> {
  await redis.hset(keys(roomId).tokens, { [playerId]: token });
}

// ─── 접속 상태 ───────────────────────────────────

export async function markSeen(roomId: string, playerId: string, at = Date.now()): Promise<void> {
  await redis.hset(keys(roomId).presence, { [playerId]: String(at) });
}

export async function getPresence(roomId: string): Promise<Record<string, number>> {
  return parsePresence(await redis.hgetall(keys(roomId).presence));
}

/** 퇴장한 플레이어의 토큰과 접속 기록을 지웁니다. */
export async function forgetPlayers(roomId: string, playerIds: string[]): Promise<void> {
  if (playerIds.length === 0) return;
  const k = keys(roomId);
  const multi = redis.multi();
  multi.hdel(k.tokens, ...playerIds);
  multi.hdel(k.presence, ...playerIds);
  await multi.exec();
}

// ─── 스냅샷 ─────────────────────────────────────

export interface RoomSnapshot {
  room: RoomState | null;
  chat: ChatMessage[];
  presence: Record<string, number>;
  version: number;
}

/**
 * 방 상태 / 채팅 / 접속 정보 / 버전을 한 트랜잭션으로 읽어 일관된 스냅샷을 반환합니다.
 * seenBy 를 주면 같은 요청 안에서 그 플레이어의 접속 시각도 갱신합니다. (Redis 왕복 1회 절약)
 */
export async function getSnapshot(roomId: string, seenBy?: string): Promise<RoomSnapshot> {
  const k = keys(roomId);
  const multi = redis.multi();
  const now = Date.now();
  if (seenBy) multi.hset(k.presence, { [seenBy]: String(now) });
  multi.get(k.room);
  multi.lrange(k.chat, 0, -1);
  multi.hgetall(k.presence);
  multi.get(k.version);

  const results = (await multi.exec()) as unknown[];
  const [rawRoom, rawChat, rawPresence, rawVersion] = seenBy ? results.slice(1) : results;

  return {
    room: parseRoom(rawRoom),
    chat: ((rawChat as string[] | null) ?? []).map((m) => JSON.parse(m) as ChatMessage),
    presence: parsePresence(rawPresence as Record<string, unknown> | null),
    version: Number(rawVersion ?? 0),
  };
}

// ─── 분산 잠금 ───────────────────────────────────

const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/** 성공하면 true. ttlMs 가 지나면 자동으로 풀립니다. (함수가 비정상 종료돼도 방이 영원히 잠기지 않도록) */
export async function tryAcquireLock(roomId: string, owner: string, ttlMs: number): Promise<boolean> {
  const res = await redis.set(`lock:${roomId}`, owner, { nx: true, px: ttlMs });
  return res === "OK";
}

export async function releaseLock(roomId: string, owner: string): Promise<void> {
  await redis.eval(RELEASE_SCRIPT, [`lock:${roomId}`], [owner]);
}
