/**
 * ChatLog.tsx
 * 
 * 게임 내 모든 채팅 내역(시스템 메시지, 일반 채팅, 질문, 정답 시도 등)을
 * 시간순으로 출력하고, 게임 종료 시 결과 화면을 표시하는 컴포넌트입니다.
 */

"use client";

import { useEffect, useRef } from "react";
import { RoomState, ChatMessage } from "@/lib/game/types";
import styles from "../Room.module.css";
import { useRouter } from "next/navigation";

interface ChatLogProps {
  chatMessages: ChatMessage[];
  room: RoomState | null;
  iAmJudge: boolean;          // 현재 접속자가 심판인지 여부
  performAction: (action: any) => Promise<void>;
  loadingAction: boolean;
}

export function ChatLog({ chatMessages, room, iAmJudge, performAction, loadingAction }: ChatLogProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // 새로운 메시지가 추가될 때마다 최하단으로 자동 스크롤합니다.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  /** 메시지 종류(kind)에 따라 적절한 CSS 클래스를 반환합니다. */
  const getChatStyle = (kind: string) => {
    switch (kind) {
      case "system": return styles.chatSystem; // 시스템 공지
      case "guess": return styles.chatGuess;   // 정답 시도 결과
      case "question": return styles.chatQuestion; // 플레이어 질문
      case "answer": return styles.chatAnswer;     // 정답 제출 내용
      default: return styles.chatNormal;           // 일반 채팅
    }
  };

  if (!room) return null;

  return (
    <div className={styles.logContainer} ref={scrollRef}>
      {/* 메시지 목록 렌더링 */}
      {chatMessages.map((msg) => (
        <div key={msg.id} className={`${styles.chatRow} ${getChatStyle(msg.kind)}`}>
          {/* 질문/정답 시도의 경우 상단에 태그 표시 */}
          {(msg.kind === "question" || msg.kind === "answer") && (
            <div className={msg.kind === "question" ? styles.questionTag : styles.answerTag}>
              {msg.kind === "question" ? "[질문]" : "[정답 시도]"}
            </div>
          )}
          {/* 시스템 메시지나 정답 결과가 아닌 경우 닉네임 표시 */}
          {msg.kind !== "system" && msg.kind !== "guess" && (
            <span className={styles.chatAuthor}>
              {room.players.find(p => p.id === msg.playerId)?.name || "Unknown"}:
            </span>
          )}
          <span className={styles.chatText}>{msg.text}</span>
        </div>
      ))}

      {/* 게임이 종료된 경우 결과창 및 재시작/로비 이동 버튼 표시 */}
      {room.status === "finished" && (
        <div className={styles.finishAnnouncement}>
          <h2>🏁 게임 종료</h2>
          {room.winnerPlayerId && (
            <p>최종 승자: <strong>{room.players.find(p => p.id === room.winnerPlayerId)?.name}</strong></p>
          )}
          <div className={styles.buttonGroup}>
            {/* 심판(진행자)만 게임을 재시작할 수 있습니다. */}
            {iAmJudge && (
              <button 
                className={styles.button} 
                style={{ width: "auto", marginTop: "20px", marginRight: "10px", backgroundColor: "#818cf8" }} 
                onClick={() => performAction({ type: "restart_game" })}
                disabled={loadingAction}
              >
                {loadingAction ? "재시작 중..." : "다시 시작"}
              </button>
            )}
            <button className={styles.button} style={{ width: "auto", marginTop: "20px" }} onClick={() => router.push("/")}>
              로비로 이동
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
