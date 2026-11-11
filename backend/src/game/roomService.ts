/**
 * roomService.ts
 *
 * 방 입장 / 퇴장, 인증, 클라이언트 응답용 스냅샷 생성을 담당합니다.
 * 상태를 바꾸는 함수는 반드시 라우터에서 withRoomLock 안에서 호출해야 합니다.
 */

import { timingSafeEqual } from "crypto";
import { RoomState, Player, ServerToClientMessage, RoomSnapshotResponse } from "./types";
import {
  getRoomFromRedis,
  saveRoom,
  deleteRoom,
  getToken,
  setToken,
  markSeen,
  forgetPlayers,
  getSnapshot,
} from "./store";
import { publicRoom, generateToken } from "./utils";
import { normalizeRoom, removePlayers } from "./rules";
import { addSystemMessage } from "./chatService";
import { GameError } from "./errors";
import { LIMITS } from "./limits";

// ─── 인증 ───────────────────────────────────────

function sameToken(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** 요청한 playerId 가 해당 토큰의 주인인지 확인합니다. */
export async function authenticate(roomId: string, playerId: string, token: string | undefined): Promise<void> {
  const stored = await getToken(roomId, playerId);
  if (!stored || !token || !sameToken(stored, token)) {
    throw new GameError("인증 정보가 올바르지 않습니다. 다시 입장해주세요.", 401, "UNAUTHORIZED");
  }
  await markSeen(roomId, playerId);
}

// ─── 입장 / 퇴장 ─────────────────────────────────

async function createRoom(roomId: string, hostId: string): Promise<RoomState> {
  const room: RoomState = {
    id: roomId,
    hostId,
    players: [],
    topic: null,
    endCondition: null,
    round: 0,
    turnIndex: 0,
    status: "waiting",
    createdAt: Date.now(),
  };
  await deleteRoom(roomId); // 같은 ID 로 남아 있던 찌꺼기 키 정리
  await saveRoom(roomId, room);
  return room;
}

/**
 * 방에 입장합니다. 방이 없으면 새로 만들고, 첫 입장자가 심판이 됩니다.
 * - 이미 참가 중인 플레이어: 토큰이 일치해야 재접속 가능 (새로고침 등)
 * - 새 플레이어: 대기 / 종료 상태에서만 입장 가능
 * 반환된 token 은 이후 모든 요청의 X-Player-Token 헤더로 보내야 합니다.
 */
export async function joinRoom(
  roomId: string,
  playerId: string,
  name: string,
  token: string | undefined
): Promise<{ token: string }> {
  let room = (await getRoomFromRedis(roomId)) ?? (await createRoom(roomId, playerId));
  const existing = room.players.find((p) => p.id === playerId);

  if (existing) {
    const stored = await getToken(roomId, playerId);
    if (stored) {
      if (!token || !sameToken(stored, token)) {
        throw new GameError("이미 다른 사람이 사용 중인 플레이어입니다.", 401, "UNAUTHORIZED");
      }
      await markSeen(roomId, playerId);
      return { token: stored };
    }
    // 토큰 도입 이전에 만들어진 플레이어: 새 토큰 발급
    const issued = generateToken();
    await setToken(roomId, playerId, issued);
    await markSeen(roomId, playerId);
    return { token: issued };
  }

  if (room.status === "word_submission" || room.status === "playing") {
    throw new GameError("게임이 진행 중이라 입장할 수 없습니다. 게임이 끝난 뒤 다시 시도해주세요.", 409, "GAME_IN_PROGRESS");
  }
  if (room.players.length >= LIMITS.MAX_PLAYERS) {
    throw new GameError(`방이 가득 찼습니다. (최대 ${LIMITS.MAX_PLAYERS}명)`, 409, "ROOM_FULL");
  }

  const newPlayer: Player = {
    id: playerId,
    name,
    isJudge: !room.players.some((p) => p.isJudge),
    isAlive: true,
    secretWord: null,
    wordSubmitted: false,
  };
  room = { ...room, players: [...room.players, newPlayer] };
  if (newPlayer.isJudge) room.hostId = playerId;

  const issued = generateToken();
  await setToken(roomId, playerId, issued);
  await markSeen(roomId, playerId);
  await saveRoom(roomId, room);
  await addSystemMessage(roomId, `${name}님이 입장하셨습니다.${newPlayer.isJudge ? " (심판)" : ""}`);

  return { token: issued };
}

/**
 * 여러 플레이어를 방에서 내보내고 규칙(심판 승계, 차례 보정 등)을 다시 맞춥니다.
 * 마지막 사람이 나가면 방을 삭제하고 null 을 반환합니다.
 */
export async function removeFromRoom(
  roomId: string,
  room: RoomState,
  ids: string[],
  describe: (name: string) => string
): Promise<RoomState | null> {
  const leaving = room.players.filter((p) => ids.includes(p.id));
  if (leaving.length === 0) return room;

  const { room: removed, turnMoved } = removePlayers(room, ids);
  const { room: normalized, notes } = normalizeRoom(removed, { announceTurn: turnMoved });

  if (!normalized) {
    await deleteRoom(roomId);
    return null;
  }

  await forgetPlayers(roomId, ids);
  await saveRoom(roomId, normalized);
  for (const p of leaving) await addSystemMessage(roomId, describe(p.name));
  for (const note of notes) await addSystemMessage(roomId, note);
  return normalized;
}

export async function leaveRoom(
  roomId: string,
  playerId: string
): Promise<{ room: RoomState | null; messages: ServerToClientMessage[] }> {
  const room = await getRoomFromRedis(roomId);
  if (!room) return { room: null, messages: [] };

  const updated = await removeFromRoom(roomId, room, [playerId], (name) => `${name}님이 퇴장하셨습니다.`);
  if (!updated) return { room: null, messages: [] };

  return {
    room: updated,
    messages: [
      { type: "player_left", playerId },
      { type: "room_state", room: publicRoom(updated) },
    ],
  };
}

// ─── 스냅샷 ─────────────────────────────────────

/** 특정 플레이어 시점에서 본 방 상태 (본인의 비밀 단어는 숨김) */
export async function getRoomSnapshot(roomId: string, viewerPlayerId: string): Promise<RoomSnapshotResponse> {
  const snap = await getSnapshot(roomId);
  if (!snap.room) throw new GameError("방을 찾을 수 없습니다.", 404, "ROOM_NOT_FOUND");

  return {
    room: publicRoom(snap.room, snap.presence),
    chatMessages: snap.chat,
    visibleWords: snap.room.players.map((p) => ({
      playerId: p.id,
      word: p.id === viewerPlayerId ? null : p.secretWord,
    })),
    version: snap.version,
  };
}
