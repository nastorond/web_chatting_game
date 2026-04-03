/**
 * useGameRoom.ts
 * 
 * 특정 게임 방의 상태 관리, 실시간 업데이트(Polling), 그리고 서버와의 액션 통신을
 * 담당하는 클라이언트 사이드 커스텀 훅입니다.
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RoomState,
  ServerToClientMessage,
  ClientToServerMessage,
  ChatMessage,
} from "@/lib/game/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function useGameRoom(roomIdStr: string) {
  const router = useRouter();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [visibleWords, setVisibleWords] = useState<{ playerId: string; word: string | null }[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 서버로부터 최신 게임 상태, 메시지 및 가시 단어 목록을 동기화합니다. */
  const fetchState = useCallback(async (playerId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/room/${roomIdStr}/state?playerId=${playerId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.room) setRoom(data.room);
      if (data.chatMessages) setChatMessages(data.chatMessages);
      if (data.visibleWords) setVisibleWords(data.visibleWords);
    } catch (err) {
      console.error("Polling error:", err);
    }
  }, [roomIdStr]);

  /** 주기적으로 fetchState를 호출하는 타이머를 시작합니다. (1초 간격) */
  const startPolling = useCallback((playerId: string) => {
    if (pollingTimer.current) clearInterval(pollingTimer.current);
    pollingTimer.current = setInterval(() => fetchState(playerId), 1000);
  }, [fetchState]);

  /** 플레이어의 액션(채팅, 질문, 정답 제출 등)을 서버로 전송합니다. */
  const performAction = async (action: ClientToServerMessage) => {
    if (!myPlayerId) return;
    setLoadingAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`${API_BASE}/api/room/${roomIdStr}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: myPlayerId, action }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // 액션 성공 시 즉시 상태 업데이트
      if (data.room) setRoom(data.room);
      if (data.chatMessages) setChatMessages(data.chatMessages);
      if (data.visibleWords) setVisibleWords(data.visibleWords);
      
      // 서버로부터 받은 추가 메시지(ex: 정답 성공/실패 알림) 처리
      if (data.messages) {
        data.messages.forEach((msg: ServerToClientMessage) => {
          if (msg.type === "guess_result") {
            setErrorBanner(msg.correct ? "🎉 정답입니다!" : "❌ 틀렸습니다.");
            setTimeout(() => setErrorBanner(null), 3000);
          }
        });
      }
    } catch (err: any) {
      setErrorBanner(`작업 실패: ${err.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  /** 컴포넌트 마운트 시 초기 유저 인증 및 게임 입장을 수행합니다. */
  useEffect(() => {
    // 닉네임이 없으면 홈으로 튕겨냄
    const nickname = localStorage.getItem("nickname");
    if (!nickname) {
      router.push("/");
      return;
    }

    // 로컬 스토리지에 저장된 플레이어 ID를 확인하거나 새로 생성
    const playerIdKey = `playerId:${roomIdStr}`;
    let playerId = localStorage.getItem(playerIdKey);
    if (!playerId) {
      playerId = `p-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(playerIdKey, playerId);
    }
    setMyPlayerId(playerId);

    const initGame = async () => {
      try {
        // 방에 동기화 요청
        const res = await fetch(`${API_BASE}/api/room/${roomIdStr}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, name: nickname }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setRoom(data.room);
        setChatMessages(data.chatMessages || []);
        setVisibleWords(data.visibleWords || []);
        setLoading(false);

        // 실시간 업데이트 시작
        startPolling(playerId);
      } catch (err: any) {
        setErrorBanner(`접속 오류: ${err.message}`);
        setLoading(false);
      }
    };

    initGame();

    return () => {
      // 컴포넌트 언마운트 시 폴링 타이머 정리
      if (pollingTimer.current) clearInterval(pollingTimer.current);
    };
  }, [roomIdStr, router, startPolling]);

  return {
    room,
    chatMessages,
    visibleWords,
    myPlayerId,
    loading,
    loadingAction,
    errorBanner,
    setErrorBanner,
    performAction,
  };
}
