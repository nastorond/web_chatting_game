/**
 * useGameRoom.ts
 *
 * 특정 게임 방의 상태 관리, 실시간 업데이트(Polling), 그리고 서버와의 액션 통신을
 * 담당하는 클라이언트 사이드 커스텀 훅입니다.
 *
 * - 입장 시 서버가 발급한 토큰을 localStorage 에 저장하고, 모든 요청에 X-Player-Token 헤더로 보냅니다.
 * - 응답의 version 을 비교해 늦게 도착한 오래된 응답이 최신 상태를 덮어쓰지 않게 합니다.
 * - 연결이 끊겨 방에서 제외된 경우 자동으로 다시 입장을 시도합니다.
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RoomState,
  ServerToClientMessage,
  ClientToServerMessage,
  ChatMessage,
  ApiErrorCode,
} from "@/lib/game/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const POLL_INTERVAL_MS = 1000;

type VisibleWord = { playerId: string; word: string | null };

interface SnapshotData {
  room: RoomState | null;
  chatMessages?: ChatMessage[];
  visibleWords?: VisibleWord[];
  version?: number;
  messages?: ServerToClientMessage[];
  token?: string;
}

class ApiError extends Error {
  constructor(message: string, public status: number, public code?: ApiErrorCode) {
    super(message);
  }
}

/** 토큰이 무효해졌거나 방에서 제외된 경우 → 다시 입장하면 해결될 수 있음 */
const needsRejoin = (e: unknown) =>
  e instanceof ApiError && (e.code === "UNAUTHORIZED" || e.code === "NOT_IN_ROOM");

const storageKeys = (roomId: string) => ({
  playerId: `playerId:${roomId}`,
  token: `token:${roomId}`,
});

const newPlayerId = () => `p-${Math.random().toString(36).substring(2, 11)}`;

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* 저장 불가 환경 무시 */ }
}
function safeRemove(key: string) {
  try { localStorage.removeItem(key); } catch { /* 무시 */ }
}

async function request(path: string, token: string | null, init?: RequestInit): Promise<SnapshotData> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Player-Token": token } : {}),
    },
  });
  let data: Partial<SnapshotData> & { error?: string; code?: ApiErrorCode } = {};
  try { data = await res.json(); } catch { /* 본문 없음 */ }
  if (!res.ok) throw new ApiError(data.error || `요청 실패 (${res.status})`, res.status, data.code);
  return data as SnapshotData;
}

// React Strict Mode 에서 effect 가 두 번 실행되어도 입장 요청은 한 번만 보내도록 공유합니다.
const inflightJoins = new Map<string, Promise<{ data: SnapshotData; playerId: string }>>();

function joinRoomOnce(roomId: string, nickname: string) {
  const existing = inflightJoins.get(roomId);
  if (existing) return existing;

  const run = (async () => {
    const k = storageKeys(roomId);
    let playerId = safeGet(k.playerId) ?? newPlayerId();
    safeSet(k.playerId, playerId);

    const attempt = () =>
      request(`/api/room/${roomId}/join`, safeGet(k.token), {
        method: "POST",
        body: JSON.stringify({ playerId, name: nickname }),
      });

    let data: SnapshotData;
    try {
      data = await attempt();
    } catch (e) {
      // 저장된 playerId 의 토큰을 잃어버린 경우: 새 플레이어로 입장
      if (!(e instanceof ApiError && e.code === "UNAUTHORIZED")) throw e;
      playerId = newPlayerId();
      safeSet(k.playerId, playerId);
      safeRemove(k.token);
      data = await attempt();
    }

    if (data.token) safeSet(k.token, data.token);
    return { data, playerId };
  })();

  inflightJoins.set(roomId, run);
  run.finally(() => inflightJoins.delete(roomId)).catch(() => {});
  return run;
}

export function useGameRoom(roomIdStr: string) {
  const router = useRouter();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [visibleWords, setVisibleWords] = useState<VisibleWord[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  /** 더 이상 진행할 수 없는 오류 (방 없음, 게임 중 입장 불가 등) — 화면 전체에 표시 */
  const [fatalError, setFatalError] = useState<string | null>(null);

  const playerIdRef = useRef<string | null>(null);
  const versionRef = useRef(-1);
  const stoppedRef = useRef(false);
  const rejoinRef = useRef<Promise<void> | null>(null);

  const token = () => safeGet(storageKeys(roomIdStr).token);

  /** 응답을 화면 상태에 반영합니다. 이미 반영한 것보다 오래된 버전이면 무시합니다. */
  const applySnapshot = useCallback((data: SnapshotData) => {
    if (typeof data.version === "number") {
      if (data.version < versionRef.current) return;
      versionRef.current = data.version;
    }
    if (data.room) setRoom(data.room);
    if (data.chatMessages) setChatMessages(data.chatMessages);
    if (data.visibleWords) setVisibleWords(data.visibleWords);
  }, []);

  const stop = useCallback((message?: string) => {
    stoppedRef.current = true;
    if (message) setFatalError(message);
  }, []);

  /** 방에 입장(또는 재입장)합니다. 실패 시 fatalError 로 전환합니다. */
  const join = useCallback(async (): Promise<boolean> => {
    const nickname = safeGet("nickname");
    if (!nickname) {
      router.push("/");
      return false;
    }
    try {
      const { data, playerId } = await joinRoomOnce(roomIdStr, nickname);
      playerIdRef.current = playerId;
      setMyPlayerId(playerId);
      versionRef.current = -1; // 방이 새로 만들어졌을 수 있으므로 버전 초기화
      applySnapshot(data);
      return true;
    } catch (e) {
      stop(e instanceof Error ? e.message : "방에 입장할 수 없습니다.");
      return false;
    }
  }, [roomIdStr, router, applySnapshot, stop]);

  /** 동시에 여러 요청이 인증 실패해도 재입장은 한 번만 수행합니다. */
  const rejoin = useCallback(async () => {
    if (!rejoinRef.current) {
      rejoinRef.current = join().then(() => undefined).finally(() => { rejoinRef.current = null; });
    }
    await rejoinRef.current;
  }, [join]);

  /** 폴링 / 액션 공통 에러 처리. 처리했으면 true. */
  const handleFatalOrAuth = useCallback(async (e: unknown): Promise<boolean> => {
    if (needsRejoin(e)) {
      await rejoin();
      return true;
    }
    if (e instanceof ApiError && e.code === "ROOM_NOT_FOUND") {
      stop("방이 종료되었거나 존재하지 않습니다.");
      return true;
    }
    return false;
  }, [rejoin, stop]);

  /** 플레이어의 액션(채팅, 질문, 정답 제출 등)을 서버로 전송합니다. */
  const performAction = async (action: ClientToServerMessage) => {
    const playerId = playerIdRef.current;
    if (!playerId || stoppedRef.current) return;
    setLoadingAction(true);
    setErrorBanner(null);
    try {
      const data = await request(`/api/room/${roomIdStr}/action`, token(), {
        method: "POST",
        body: JSON.stringify({ playerId, action }),
      });

      if (action.type === "leave_room") {
        stoppedRef.current = true;
        safeRemove(storageKeys(roomIdStr).token);
        return;
      }

      applySnapshot(data);

      // 서버로부터 받은 추가 메시지(ex: 정답 성공/실패 알림) 처리
      data.messages?.forEach((msg) => {
        if (msg.type === "guess_result") {
          setErrorBanner(msg.correct ? "🎉 정답입니다!" : "❌ 틀렸습니다.");
          setTimeout(() => setErrorBanner(null), 3000);
        }
      });
    } catch (err) {
      if (action.type === "leave_room") {
        // 나가기는 실패해도 화면은 떠나므로 폴링만 멈춤 (서버가 연결 끊김으로 정리함)
        stoppedRef.current = true;
        return;
      }
      if (await handleFatalOrAuth(err)) {
        if (needsRejoin(err)) setErrorBanner("연결이 갱신되었습니다. 다시 시도해주세요.");
        return;
      }
      setErrorBanner(`작업 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingAction(false);
    }
  };

  /** 마운트 시 입장 후, 이전 요청이 끝나면 다음 요청을 보내는 방식으로 폴링합니다. */
  useEffect(() => {
    stoppedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const poll = async () => {
      if (disposed || stoppedRef.current) return;
      const playerId = playerIdRef.current;
      if (playerId) {
        try {
          const data = await request(`/api/room/${roomIdStr}/state?playerId=${encodeURIComponent(playerId)}`, token());
          if (!disposed) applySnapshot(data);
        } catch (e) {
          if (!disposed && !(await handleFatalOrAuth(e))) console.error("Polling error:", e);
        }
      }
      if (!disposed && !stoppedRef.current) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    (async () => {
      const ok = await join();
      if (disposed) return;
      setLoading(false);
      if (ok) timer = setTimeout(poll, POLL_INTERVAL_MS);
    })();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdStr]);

  return {
    room,
    chatMessages,
    visibleWords,
    myPlayerId,
    loading,
    loadingAction,
    errorBanner,
    setErrorBanner,
    fatalError,
    performAction,
  };
}
