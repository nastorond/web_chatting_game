"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RoomState,
  ServerToClientMessage,
  ClientToServerMessage,
  ChatMessage,
} from "@/lib/game/types";

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

  const fetchState = useCallback(async (playerId: string) => {
    try {
      const res = await fetch(`/api/room/${roomIdStr}/state?playerId=${playerId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.room) setRoom(data.room);
      if (data.chatMessages) setChatMessages(data.chatMessages);
      if (data.visibleWords) setVisibleWords(data.visibleWords);
    } catch (err) {
      console.error("Polling error:", err);
    }
  }, [roomIdStr]);

  const startPolling = useCallback((playerId: string) => {
    if (pollingTimer.current) clearInterval(pollingTimer.current);
    pollingTimer.current = setInterval(() => fetchState(playerId), 1000);
  }, [fetchState]);

  const performAction = async (action: ClientToServerMessage) => {
    if (!myPlayerId) return;
    setLoadingAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/room/${roomIdStr}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: myPlayerId, action }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.room) setRoom(data.room);
      if (data.chatMessages) setChatMessages(data.chatMessages);
      if (data.visibleWords) setVisibleWords(data.visibleWords);
      
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

  useEffect(() => {
    const nickname = localStorage.getItem("nickname");
    if (!nickname) {
      router.push("/");
      return;
    }

    const playerIdKey = `playerId:${roomIdStr}`;
    let playerId = localStorage.getItem(playerIdKey);
    if (!playerId) {
      playerId = `p-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(playerIdKey, playerId);
    }
    setMyPlayerId(playerId);

    const initGame = async () => {
      try {
        const res = await fetch(`/api/room/${roomIdStr}/join`, {
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
        startPolling(playerId);
      } catch (err: any) {
        setErrorBanner(`접속 오류: ${err.message}`);
        setLoading(false);
      }
    };

    initGame();

    return () => {
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
