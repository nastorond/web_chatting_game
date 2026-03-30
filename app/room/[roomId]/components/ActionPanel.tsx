/**
 * ActionPanel.tsx
 * 
 * 플레이어가 게임 중에 수행할 수 있는 액션(채팅, 질문, 정답 시도, 턴 넘기기)을
 * 입력하고 제어하는 하단 패널 컴포넌트입니다.
 */

"use client";

import { RoomState } from "@/lib/game/types";
import styles from "../Room.module.css";

interface ChatSystemProps {
  room: RoomState | null;
  isMyTurn: boolean;      // 현재 내 차례인지 여부
  iAmJudge: boolean;     // 내가 심판(진행자)인지 여부
  chatInput: string;     // 자유 채팅 입력값
  setChatInput: (val: string) => void;
  handleSendChat: (e?: React.FormEvent) => void;
  setQuestionModalOpen: (val: boolean) => void;
  setAnswerModalOpen: (val: boolean) => void;
  loadingAction: boolean; // 액션 처리 중 로딩 상태
  performAction: (action: any) => Promise<void>;
  turnActionUsed?: { playerId: string; actionType: "question" | "answer" } | null; // 이번 턴에 이미 액션을 사용했는지 여부
  toggleNotepad?: () => void; // 메모장 열기/닫기 토글 함수
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
  turnActionUsed,
  toggleNotepad
}: ChatSystemProps) {
  // 내 차례이고 심판이 아닐 때, 그리고 게임이 "playing" 상태일 때만 액션 버튼 표시
  const showTurnActions = isMyTurn && !iAmJudge && room?.status === "playing";

  return (
    <div className={styles.actionPanel}>
      {/* ... 기존 턴 액션 생략, 하단 자유채팅에서 메모장 토글 추가 ... */}
      
      {/* 턴 액션 버튼 */}
      {showTurnActions && (
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

      {showTurnActions && turnActionUsed && (
        <div style={{ fontSize: "0.8rem", color: "#94a3b8", padding: "4px 8px", marginBottom: "8px" }}>
          이번 턴에 {turnActionUsed.actionType === "question" ? "질문" : "정답 시도"}을 수행했습니다. 채팅 후 차례를 넘겨주세요.
        </div>
      )}

      {/* 자유 채팅 입력 폼 및 메모장 토글 버튼 */}
      <form onSubmit={handleSendChat} className={styles.actionRow}>
        {toggleNotepad && (
          <button
            type="button"
            onClick={toggleNotepad}
            className={styles.button}
            style={{ width: "auto", padding: "0 12px", backgroundColor: "#475569" }}
            title="메모장 열기/닫기"
          >
            📝
          </button>
        )}
        <input
          className={styles.input}
          style={{ flex: 1, margin: 0 }}
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
