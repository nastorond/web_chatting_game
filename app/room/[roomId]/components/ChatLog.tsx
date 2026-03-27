"use client";

import { useEffect, useRef } from "react";
import { RoomState, ChatMessage } from "@/lib/game/types";
import styles from "../Room.module.css";
import { useRouter } from "next/navigation";

interface ChatLogProps {
  chatMessages: ChatMessage[];
  room: RoomState | null;
}

export function ChatLog({ chatMessages, room }: ChatLogProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const getChatStyle = (kind: string) => {
    switch (kind) {
      case "system": return styles.chatSystem;
      case "guess": return styles.chatGuess;
      case "question": return styles.chatQuestion;
      case "answer": return styles.chatAnswer;
      default: return styles.chatNormal;
    }
  };

  if (!room) return null;

  return (
    <div className={styles.logContainer} ref={scrollRef}>
      {chatMessages.map((msg) => (
        <div key={msg.id} className={`${styles.chatRow} ${getChatStyle(msg.kind)}`}>
          {(msg.kind === "question" || msg.kind === "answer") && (
            <div className={msg.kind === "question" ? styles.questionTag : styles.answerTag}>
              {msg.kind === "question" ? "[질문]" : "[정답 시도]"}
            </div>
          )}
          {msg.kind !== "system" && msg.kind !== "guess" && (
            <span className={styles.chatAuthor}>
              {room.players.find(p => p.id === msg.playerId)?.name || "Unknown"}:
            </span>
          )}
          <span className={styles.chatText}>{msg.text}</span>
        </div>
      ))}
      {room.status === "finished" && (
        <div className={styles.finishAnnouncement}>
          <h2>🏁 게임 종료</h2>
          {room.winnerPlayerId && (
            <p>최종 승자: <strong>{room.players.find(p => p.id === room.winnerPlayerId)?.name}</strong></p>
          )}
          <button className={styles.button} style={{ width: "auto", marginTop: "20px" }} onClick={() => router.push("/")}>
            로비로 이동
          </button>
        </div>
      )}
    </div>
  );
}
