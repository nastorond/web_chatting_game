"use client";

import { RoomState } from "@/lib/game/types";
import styles from "../Room.module.css";

interface ChatSystemProps {
  room: RoomState | null;
  isMyTurn: boolean;
  iAmJudge: boolean;
  chatInput: string;
  setChatInput: (val: string) => void;
  handleSendChat: (e?: React.FormEvent) => void;
  setQuestionModalOpen: (val: boolean) => void;
  setAnswerModalOpen: (val: boolean) => void;
  loadingAction: boolean;
  performAction: (action: any) => Promise<void>;
  turnActionUsed?: { playerId: string; actionType: "question" | "answer" } | null;
}

export function ActionPanel({
  room,
  isMyTurn,
  iAmJudge,
  chatInput,
  setChatInput,
  handleSendChat,
  setQuestionModalOpen,
  setAnswerModalOpen,
  loadingAction,
  performAction,
  turnActionUsed
}: ChatSystemProps) {
  if (room?.status !== "playing") return null;

  return (
    <div className={styles.actionPanel}>
      {/* 턴 액션 버튼 */}
      {isMyTurn && !iAmJudge && (
        <div className={styles.turnButtonGroup}>
          <button 
            className={styles.actionButton} 
            onClick={() => setQuestionModalOpen(true)} 
            disabled={loadingAction || !!turnActionUsed}
          >
            질문하기
          </button>
          <button 
            className={styles.actionButton} 
            style={{ backgroundColor: "#059669" }} 
            onClick={() => setAnswerModalOpen(true)}
            disabled={loadingAction || !!turnActionUsed}
          >
            정답 시도하기
          </button>
          <button 
            className={styles.actionButton} 
            style={{ backgroundColor: "#475569" }} 
            onClick={() => performAction({ type: "end_turn" })}
            disabled={loadingAction}
          >
            차례 넘기기
          </button>
        </div>
      )}
      {isMyTurn && !iAmJudge && turnActionUsed && (
        <div style={{ fontSize: "0.8rem", color: "#94a3b8", padding: "4px 8px", marginBottom: "8px" }}>
          이번 턴에 {turnActionUsed.actionType === "question" ? "질문" : "정답 시도"}을 수행했습니다. 채팅 후 차례를 넘겨주세요.
        </div>
      )}
      {/* 자유 채팅 입력 */}
      <form onSubmit={handleSendChat} className={styles.actionRow}>
        <input
          className={styles.input}
          style={{ flex: 1, marginBottom: 0 }}
          placeholder="자유롭게 채팅하세요 (질문/답변은 버튼 클릭)"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          disabled={loadingAction}
        />
        <button type="submit" className={styles.button} style={{ width: "80px" }} disabled={loadingAction || !chatInput.trim()}>
          전송
        </button>
      </form>
    </div>
  );
}
