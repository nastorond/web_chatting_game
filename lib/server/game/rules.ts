/**
 * rules.ts
 *
 * 방 상태를 받아 새 방 상태를 돌려주는 순수 함수 모음입니다. (Redis 접근 없음)
 * 플레이어 입장/퇴장처럼 인원이 바뀐 뒤에는 normalizeRoom 으로
 * "심판은 항상 1명", "차례는 참여 가능한 플레이어에게" 같은 규칙을 다시 맞춥니다.
 */

import { RoomState, Player } from "@/lib/game/types";
import { LIMITS } from "@/lib/game/limits";

/** 게임 진행 정보를 모두 지우고 대기 상태로 되돌립니다. (플레이어 목록은 유지) */
export function resetToWaiting(room: RoomState): RoomState {
  return {
    ...room,
    status: "waiting",
    topic: null,
    endCondition: null,
    round: 0,
    turnIndex: 0,
    winnerPlayerId: null,
    loserPlayerId: null,
    turnActionUsed: null,
    players: room.players.map((p) => ({
      ...p,
      isAlive: true,
      secretWord: null,
      wordSubmitted: false,
      penaltyUntil: undefined,
    })),
  };
}

/** 단어 제출 단계에서 모든 플레이어에게 단어가 배정되었으면 게임을 시작합니다. */
export function startPlayingIfReady(room: RoomState): { room: RoomState; started: boolean } {
  if (room.status !== "word_submission") return { room, started: false };
  const nonJudge = room.players.filter((p) => !p.isJudge);
  const ready = nonJudge.length >= LIMITS.MIN_PLAYERS && nonJudge.every((p) => p.secretWord !== null);
  if (!ready) return { room, started: false };

  const firstTurnIdx = room.players.findIndex((p) => p.id === nonJudge[0].id);
  return {
    room: { ...room, status: "playing", round: 1, turnIndex: firstTurnIdx, turnActionUsed: null },
    started: true,
  };
}

/**
 * 플레이어들을 목록에서 제거하고 turnIndex 가 계속 같은 사람을 가리키도록 보정합니다.
 * 현재 차례인 사람이 제거되면 순서상 그 다음 사람에게 차례가 넘어갑니다.
 */
export function removePlayers(room: RoomState, ids: string[]): { room: RoomState; turnMoved: boolean } {
  const removed = new Set(ids);
  const players = room.players.filter((p) => !removed.has(p.id));
  const current = room.players[room.turnIndex];

  let turnIndex = 0;
  let round = room.round;
  let turnMoved = false;

  if (players.length > 0) {
    if (current && !removed.has(current.id)) {
      turnIndex = players.findIndex((p) => p.id === current.id);
    } else {
      // 원래 순서에서 현재 차례보다 앞에 있던 사람 수 = 새 목록에서 "다음 사람"의 위치
      let k = room.players.slice(0, room.turnIndex).filter((p) => !removed.has(p.id)).length;
      if (k >= players.length) {
        k = 0;
        if (room.status === "playing") round++;
      }
      turnIndex = k;
      turnMoved = room.status === "playing";
    }
  }

  return {
    room: {
      ...room,
      players,
      turnIndex,
      round,
      turnActionUsed: turnMoved ? null : room.turnActionUsed,
    },
    turnMoved,
  };
}

/**
 * 인원 변동 후 방의 규칙을 다시 맞춥니다.
 * - 플레이어가 없으면 null (방 삭제)
 * - 심판이 없으면 첫 번째 플레이어를 심판으로 지정
 * - 게임 중인데 플레이어가 최소 인원 미만이면 대기 상태로 복귀
 * - 단어 제출 단계: 단어 전달 순서를 다시 계산하고, 모두 배정됐으면 게임 시작
 * - 진행 단계: 종료 조건 확인, 현재 차례가 참여 불가능한 사람이면 다음 사람으로
 *
 * notes 는 채팅창에 시스템 메시지로 남길 문구입니다.
 */
export function normalizeRoom(
  input: RoomState,
  opts: { announceTurn?: boolean } = {}
): { room: RoomState | null; notes: string[] } {
  const notes: string[] = [];
  if (input.players.length === 0) return { room: null, notes };

  let room: RoomState = { ...input, players: input.players.map((p) => ({ ...p })) };

  // 1. 심판은 항상 정확히 1명
  let judgeSeen = false;
  for (const p of room.players) {
    if (p.isJudge && !judgeSeen) judgeSeen = true;
    else if (p.isJudge) p.isJudge = false;
  }
  if (!judgeSeen) {
    const promoted = room.players[0];
    promoted.isJudge = true;
    promoted.wordSubmitted = false;
    notes.push(`${promoted.name}님이 새 심판이 되었습니다.`);
  }
  const judge = room.players.find((p) => p.isJudge)!;
  room.hostId = judge.id;

  // 2. 게임 중 최소 인원 확인
  const inGame = room.status === "word_submission" || room.status === "playing";
  const nonJudgeCount = room.players.filter((p) => !p.isJudge).length;
  if (inGame && nonJudgeCount < LIMITS.MIN_PLAYERS) {
    notes.push(`플레이어가 ${LIMITS.MIN_PLAYERS}명 미만이 되어 게임이 대기 상태로 돌아갔습니다.`);
    return { room: resetToWaiting(room), notes };
  }

  // 3. 단어 제출 단계: "내 다음 사람이 단어를 가지고 있으면 나는 할 일이 끝남"
  if (room.status === "word_submission") {
    const nonJudge = room.players.filter((p) => !p.isJudge);
    const doneById = new Map<string, boolean>();
    nonJudge.forEach((p, i) => {
      const target = nonJudge[(i + 1) % nonJudge.length];
      doneById.set(p.id, target.secretWord !== null);
    });
    room.players = room.players.map((p) =>
      p.isJudge ? { ...p, wordSubmitted: false } : { ...p, wordSubmitted: doneById.get(p.id) ?? false }
    );

    const res = startPlayingIfReady(room);
    if (res.started) {
      room = res.room;
      notes.push("모든 단어 배정이 완료되었습니다. 게임을 시작합니다!");
      notes.push(`현재 차례: ${room.players[room.turnIndex].name}`);
    }
    return { room, notes };
  }

  // 4. 진행 단계
  if (room.status === "playing") {
    const ended = checkLastLoseEnd(room);
    if (ended) {
      notes.push(ended.note);
      return { room: ended.room, notes };
    }

    let advanced = false;
    const current: Player | undefined = room.players[room.turnIndex];
    if (!current || !isEligibleForTurn(current)) {
      room = nextTurn(room);
      advanced = true;
    }
    if (advanced || opts.announceTurn) {
      notes.push(`현재 차례: ${room.players[room.turnIndex].name}`);
    }
  }

  return { room, notes };
}

/** lastLose 모드: 아직 못 맞힌 사람이 1명 이하로 남으면 게임 종료 (남은 사람이 패배) */
export function checkLastLoseEnd(room: RoomState): { room: RoomState; note: string } | null {
  if (room.status !== "playing" || room.endCondition !== "lastLose") return null;
  const remaining = room.players.filter(isEligibleForTurn);
  if (remaining.length > 1) return null;

  const loser = remaining[0];
  return {
    room: { ...room, status: "finished", loserPlayerId: loser?.id ?? null, turnActionUsed: null },
    note: loser
      ? `🏁 게임 종료! 마지막까지 단어를 맞히지 못한 ${loser.name}님이 패배했습니다.`
      : "🏁 게임 종료!",
  };
}

export const isEligibleForTurn = (p: Player) => !p.isJudge && p.isAlive;

/**
 * 다음 차례 플레이어로 넘깁니다. (심판과 이미 맞힌 플레이어는 건너뜀)
 * preferOnline 이 주어지면 접속 중인 플레이어를 우선하고, 아무도 없으면 접속 여부를 무시합니다.
 */
export function nextTurn(room: RoomState, preferOnline?: (playerId: string) => boolean): RoomState {
  const players = room.players;
  const n = players.length;
  if (n === 0) return { ...room, turnActionUsed: null };

  const passes: ((p: Player) => boolean)[] = preferOnline
    ? [(p) => isEligibleForTurn(p) && preferOnline(p.id), isEligibleForTurn]
    : [isEligibleForTurn];

  for (const eligible of passes) {
    let idx = room.turnIndex;
    let round = room.round;
    for (let i = 0; i < n; i++) {
      idx = (idx + 1) % n;
      if (idx === 0) round++;
      if (eligible(players[idx])) {
        return { ...room, turnIndex: idx, round, turnActionUsed: null };
      }
    }
  }

  return { ...room, turnActionUsed: null };
}
