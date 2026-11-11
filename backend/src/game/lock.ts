/**
 * lock.ts
 *
 * 방 단위 직렬화 잠금입니다.
 * 같은 방에 대한 "읽기 → 수정 → 저장" 작업을 한 번에 하나씩만 실행해서
 * 동시 요청 시 데이터가 덮어써지는 문제를 막습니다.
 *
 * ⚠️ 프로세스 메모리 기반이므로 백엔드 인스턴스가 1개일 때만 유효합니다.
 *    여러 인스턴스로 확장한다면 Redis 기반 분산 잠금으로 교체해야 합니다.
 */

const tails = new Map<string, Promise<void>>();

export function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(roomId) ?? Promise.resolve();
  const run = prev.then(fn);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  tails.set(roomId, tail);
  tail.then(() => {
    if (tails.get(roomId) === tail) tails.delete(roomId);
  });
  return run;
}
