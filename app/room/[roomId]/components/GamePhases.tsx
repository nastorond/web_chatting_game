/**
 * GamePhases.tsx
 * 
 * 게임의 진행 상태(대기, 단어 제출, 플레이 중)에 따라 
 * 서로 다른 UI 레이아웃을 전환하며 렌더링하는 중계 컴포넌트입니다.
 */

"use client";

import { useState } from "react";
import { RoomState, Player } from "@/lib/game/types";
import styles from "../Room.module.css";
import { ChatLog } from "./ChatLog";
import { ActionPanel } from "./ActionPanel";
import { Notepad } from "./Notepad";

interface PhaseProps {
  room: RoomState;
  me: Player | undefined;
  iAmJudge: boolean;
  loadingAction: boolean;
  topicInput: string;
  setTopicInput: (v: string) => void;
  wordInput: string;
  setWordInput: (v: string) => void;
  handleStartGame: () => void;
  targetForWordAssign: Player | null;
  handleSubmitWord: (id: string) => void;
  chatMessages: any[];
  isMyTurn: boolean;
  chatInput: string;
  setChatInput: (v: string) => void;
  handleSendChat: () => void;
  setQuestionModalOpen: (v: boolean) => void;
  setAnswerModalOpen: (v: boolean) => void;
  performAction: (a: any) => Promise<void>;
  currentTurnPlayer: Player | undefined;
  turnActionUsed?: { playerId: string; actionType: "question" | "answer" } | null;
}

export function GamePhases({
  room,
  me,
  iAmJudge,
  loadingAction,
  topicInput,
  setTopicInput,
  wordInput,
  setWordInput,
  handleStartGame,
  targetForWordAssign,
  handleSubmitWord,
  chatMessages,
  isMyTurn,
  chatInput,
  setChatInput,
  handleSendChat,
  setQuestionModalOpen,
  setAnswerModalOpen,
  performAction,
  currentTurnPlayer,
  turnActionUsed
}: PhaseProps) {
  
  // 메모장 열기/닫기 상태 (로컬 클라이언트 전용)
  const [isNotepadOpen, setIsNotepadOpen] = useState(false);

  return (
    <div className={styles.gameArea}>
      
      {/* 1. 상단 정보 영역 (게임의 진행 단계별 컨트롤 UI 표시) */}
      <div className={styles.gameAreaTop}>
        
        {/* 대기 단계 (waiting) */}
        {room.status === "waiting" && (
          <div className={styles.centerBox} style={{ padding: "20px" }}>
            {iAmJudge ? (
              <div className={styles.setupCard} style={{ margin: "0 auto" }}>
                <h2>🎮 게임 시작 설정</h2>
                <p>주제를 정하고 게임을 시작해 주세요.</p>
                <input
                  className={styles.input}
                  placeholder="예: 동물, 영화 제목, 브랜드명..."
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  style={{ marginBottom: "12px" }}
                />
                <select className={styles.select} disabled style={{ width: "100%", marginBottom: "12px" }}>
                  <option value="firstWin">최초 승자 모드 (먼저 맞추면 승리)</option>
                </select>
                <button className={styles.button} onClick={handleStartGame} disabled={loadingAction}>
                  {loadingAction ? "시작 중..." : "게임 시작"}
                </button>
              </div>
            ) : (
              <div className={styles.infoText}>심판이 게임을 준비 중입니다. 잠시만 기다려주세요...</div>
            )}
          </div>
        )}

        {/* 단어 제출 단계 (word_submission) */}
        {room.status === "word_submission" && (
          <div className={styles.centerBox} style={{ padding: "20px" }}>
            <div className={styles.setupCard} style={{ margin: "0 auto" }}>
              <h2>📝 단어 제출 단계</h2>
              {iAmJudge ? (
                <div className={styles.infoText}>
                  진행자(심판)는 단어를 제출하지 않습니다.<br/>
                  플레이어들이 단어를 제출할 때까지 기다려 주세요.
                </div>
              ) : (
                <>
                  <p>배정할 단어를 입력해주세요.<br/><small style={{ color: "#94a3b8" }}>(서버가 자동으로 다른 플레이어에게 할당합니다.)</small></p>
                  {me?.wordSubmitted ? (
                    <div className={styles.successText}>
                      단어를 제출했습니다. 다른 플레이어들이 완료할 때까지 기다려주세요.
                    </div>
                  ) : (
                    <>
                      <input
                        className={styles.input}
                        placeholder="배정할 단어 입력"
                        value={wordInput}
                        onChange={(e) => setWordInput(e.target.value)}
                        style={{ marginBottom: "12px" }}
                      />
                      <button 
                        className={styles.button} 
                        onClick={() => targetForWordAssign && handleSubmitWord(targetForWordAssign.id)} 
                        disabled={loadingAction}
                      >
                        {loadingAction ? "제출 중..." : "단어 제출"}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 게임 플레이 중 차례 정보 (playing) */}
        {room.status === "playing" && (
          <div className={styles.turnInfo}>
            <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <span style={{ fontWeight: 700, color: "#818cf8" }}>라운드 {room.round}</span>
              <span style={{ margin: "0 10px" }}>|</span>
              <span>현재 차례: <strong>{currentTurnPlayer?.name}</strong></span>
              {isMyTurn && <span className={styles.myTurnBadge}>당신의 차례입니다!</span>}
            </div>
            {iAmJudge && (
              <button 
                className={styles.forceTurnButton} 
                onClick={() => performAction({ type: "force_next_turn" })}
                disabled={loadingAction}
              >
                차례 강제 넘기기 ⏩
              </button>
            )}
          </div>
        )}

      </div>

      {/* 2. 하단 채팅 & 메모장 영역 (모든 단계에서 상시 표시) */}
      <div className={styles.lowerArea}>
        
        {/* 왼쪽: 채팅 기록 및 액션 패널 */}
        <div className={styles.chatWrapper}>
          <ChatLog 
            chatMessages={chatMessages} 
            room={room} 
            iAmJudge={iAmJudge} 
            performAction={performAction} 
            loadingAction={loadingAction} 
          />
          <ActionPanel
            room={room}
            isMyTurn={isMyTurn}
            iAmJudge={iAmJudge}
            chatInput={chatInput}
            setChatInput={setChatInput}
            handleSendChat={handleSendChat}
            setQuestionModalOpen={setQuestionModalOpen}
            setAnswerModalOpen={setAnswerModalOpen}
            loadingAction={loadingAction}
            performAction={performAction}
            turnActionUsed={turnActionUsed}
            toggleNotepad={() => setIsNotepadOpen((prev) => !prev)}
          />
        </div>

        {/* 오른쪽: 개인 로컬 메모장 (팝업/토글 형태) */}
        {isNotepadOpen && (
          <div className={styles.notepadWrapper}>
            <Notepad room={room} />
          </div>
        )}

      </div>

    </div>
  );
}
