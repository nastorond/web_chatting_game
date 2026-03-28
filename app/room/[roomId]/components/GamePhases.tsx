"use client";

import { RoomState, Player } from "@/lib/game/types";
import styles from "../Room.module.css";
import { ChatLog } from "./ChatLog";
import { ActionPanel } from "./ActionPanel";

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
  
  if (room.status === "waiting") {
    return (
      <div className={styles.centerBox}>
        {iAmJudge ? (
          <div className={styles.setupCard}>
            <h2>🎮 게임 시작 설정</h2>
            <p>주제를 정하고 게임을 시작해 주세요.</p>
            <input
              className={styles.input}
              placeholder="예: 동물, 영화 제목, 브랜드명..."
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
            />
            <select className={styles.select} disabled>
              <option value="firstWin">종합 승리 모드 (firstWin)</option>
            </select>
            <button className={styles.button} onClick={handleStartGame} disabled={loadingAction}>
              {loadingAction ? "시작 중..." : "게임 시작"}
            </button>
          </div>
        ) : (
          <div className={styles.infoText}>심판이 게임을 준비 중입니다. 잠시만 기다려주세요...</div>
        )}
      </div>
    );
  }

  if (room.status === "word_submission") {
    return (
      <div className={styles.centerBox}>
        <div className={styles.setupCard}>
          <h2>📝 단어 배정 단계</h2>
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
    );
  }

  return (
    <div className={styles.gameArea}>
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
              강제 넘기기 ⏩
            </button>
          )}
        </div>
      )}

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
      />
    </div>
  );
}
