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
  performAction
}: ChatSystemProps) {
  if (room?.status !== "playing") return null;

  return (
    <div className={styles.actionPanel}>
      {/* 턴 액션 버튼 */}
      {isMyTurn && !iAmJudge && (
        <div className={styles.turnButtonGroup}>
          <button className={styles.actionButton} onClick={() => setQuestionModalOpen(true)}>질문하기</button>
          <button className={styles.actionButton} style={{ backgroundColor: "#059669" }} onClick={() => setAnswerModalOpen(true)}>정답 시도하기</button>
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
