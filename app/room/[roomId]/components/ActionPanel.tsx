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
  // 게임이 진행 중(playing)일 때만 패널을 표시합니다.
  if (room?.status !== "playing") return null;

  return (
    <div className={styles.actionPanel}>
      {/* 내 차례이고 심판이 아닐 때만 질문/정답/턴 넘기기 버튼을 표시합니다. */}
      {isMyTurn && !iAmJudge && (
        <div className={styles.turnButtonGroup}>
          {/* 질문하기: 모달을 열어 질문을 입력받습니다. */}
          <button 
            className={styles.actionButton} 
            onClick={() => setQuestionModalOpen(true)} 
            disabled={loadingAction || !!turnActionUsed}
          >
            질문하기
          </button>
          {/* 정답 시도하기: 모달을 열어 정답을 입력받습니다. */}
          <button 
            className={styles.actionButton} 
            style={{ backgroundColor: "#059669" }} 
            onClick={() => setAnswerModalOpen(true)}
            disabled={loadingAction || !!turnActionUsed}
          >
            정답 시도하기
          </button>
          {/* 차례 넘기기: 자신의 턴을 종료하고 다음 플레이어에게 넘깁니다. */}
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

      {/* 이미 이번 턴에 액션을 사용했을 경우 안내 메시지 표시 */}
      {isMyTurn && !iAmJudge && turnActionUsed && (
        <div style={{ fontSize: "0.8rem", color: "#94a3b8", padding: "4px 8px", marginBottom: "8px" }}>
          이번 턴에 {turnActionUsed.actionType === "question" ? "질문" : "정답 시도"}을 수행했습니다. 채팅 후 차례를 넘겨주세요.
        </div>
      )}

      {/* 자유 채팅 입력 폼 (모든 상태의 플레이어가 가능) */}
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
