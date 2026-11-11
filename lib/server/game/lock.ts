/**
 * lock.ts
 *
 * 방 단위 잠금입니다. 같은 방에 대한 "읽기 → 수정 → 저장" 작업을 한 번에 하나씩만 실행해서
 * 동시 요청 시 데이터가 덮어써지는 문제를 막습니다.
 *
 * Vercel 서버리스 함수는 여러 인스턴스에서 동시에 실행되므로 Redis 잠금(SET NX PX)을 사용합니다.
 * 같은 인스턴스 안의 요청끼리는 메모리에서 먼저 줄을 세워 Redis 재시도 횟수를 줄입니다.
 */

import { randomBytes } from "crypto";
import { tryAcquireLock, releaseLock } from "./store";
import { GameError } from "./errors";

const LOCK_TTL_MS = 10_000;     // 잠금 자동 해제 시간 (작업은 보통 수십 ms)
const ACQUIRE_TIMEOUT_MS = 8_000; // 이 시간 안에 못 잡으면 503

const localTails = new Map<string, Promise<void>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRedisLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const owner = randomBytes(12).toString("base64url");
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
  let wait = 20;

  while (!(await tryAcquireLock(roomId, owner, LOCK_TTL_MS))) {
    if (Date.now() > deadline) {
      throw new GameError("요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해주세요.", 503, "INTERNAL");
    }
    await sleep(wait + Math.random() * wait);
    wait = Math.min(wait * 2, 200);
  }

  try {
    return await fn();
  } finally {
    await releaseLock(roomId, owner).catch((e) => console.error("[lock] release failed", e));
  }
}

export function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const prev = localTails.get(roomId) ?? Promise.resolve();
  const run = prev.then(() => withRedisLock(roomId, fn));
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  localTails.set(roomId, tail);
  tail.then(() => {
    if (localTails.get(roomId) === tail) localTails.delete(roomId);
  });
  return run;
}
