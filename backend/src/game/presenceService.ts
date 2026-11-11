/**
 * presenceService.ts
 *
 * 창을 닫거나 연결이 끊긴 플레이어를 처리합니다. (폴링 요청 시 방마다 최대 5초에 한 번 실행)
 * - 대기 / 단어 제출 / 종료 상태: 일정 시간 응답이 없으면 방에서 내보냄
 * - 게임 진행 중: 내보내지 않고, 응답 없는 사람의 차례만 자동으로 넘김
 */

import { getRoomFromRedis, getPresence, markSeen, saveRoom } from "./store";
import { isOnline } from "./utils";
import { isEligibleForTurn, nextTurn } from "./rules";
import { removeFromRoom } from "./roomService";
import { addSystemMessage } from "./chatService";

const SWEEP_INTERVAL_MS = 5_000;
const REMOVE_AFTER_MS = 60_000;  // 게임 중이 아닐 때 이 시간 동안 응답 없으면 퇴장 처리
const SKIP_TURN_AFTER_MS = 30_000; // 게임 중 자기 차례에 이 시간 동안 응답 없으면 차례 넘김

const lastSweepAt = new Map<string, number>();

/** 이번 요청에서 정리 작업을 실행할 차례인지 확인합니다. */
export function shouldSweep(roomId: string, now = Date.now()): boolean {
  const last = lastSweepAt.get(roomId) ?? 0;
  if (now - last < SWEEP_INTERVAL_MS) return false;
  lastSweepAt.set(roomId, now);

  if (lastSweepAt.size > 5_000) {
    for (const [id, at] of lastSweepAt) if (now - at > 10 * 60_000) lastSweepAt.delete(id);
  }
  return true;
}

/** withRoomLock 안에서 호출해야 합니다. */
export async function sweepRoom(roomId: string): Promise<void> {
  const room = await getRoomFromRedis(roomId);
  if (!room) return;

  const now = Date.now();
  const presence = await getPresence(roomId);

  // 접속 기록이 없는 플레이어(이전 버전에서 입장)는 지금부터 시간을 잽니다.
  for (const p of room.players) {
    if (presence[p.id] === undefined) {
      presence[p.id] = now;
      await markSeen(roomId, p.id, now);
    }
  }

  if (room.status !== "playing") {
    const stale = room.players.filter((p) => now - presence[p.id] > REMOVE_AFTER_MS).map((p) => p.id);
    if (stale.length > 0) {
      await removeFromRoom(roomId, room, stale, (name) => `${name}님의 연결이 끊겨 퇴장 처리되었습니다.`);
    }
    return;
  }

  const current = room.players[room.turnIndex];
  if (!current || !isEligibleForTurn(current)) return;
  if (now - presence[current.id] <= SKIP_TURN_AFTER_MS) return;

  const updated = nextTurn(room, (id) => isOnline(presence, id, now));
  // 넘겨받을 사람도 접속 중이 아니면 넘기지 않음 (오프라인끼리 계속 돌며 메시지가 쌓이는 것 방지)
  if (updated.turnIndex === room.turnIndex || !isOnline(presence, updated.players[updated.turnIndex].id, now)) return;

  await saveRoom(roomId, updated);
  await addSystemMessage(
    roomId,
    `${current.name}님이 응답이 없어 차례를 넘깁니다. 다음 차례: ${updated.players[updated.turnIndex].name}`
  );
}
