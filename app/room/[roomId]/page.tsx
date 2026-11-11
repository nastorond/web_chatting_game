/**
 * GameRoomPage (page.tsx)
 * 
 * 실제 게임이 진행되는 메인 컴포넌트입니다.
 * 하위 컴포넌트들을 조립하고, 게임의 각 단계(대기, 단어 제출, 게임 진행)에 따른
 * 로직을 조절하며 상태를 관리합니다.
 */

"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EndCondition } from "@/lib/game/types";
import { LIMITS } from "@/lib/game/limits";
import { useGameRoom } from "./hooks/useGameRoom";
import { GameHeader } from "./components/GameHeader";
import { PlayerSidebar } from "./components/PlayerSidebar";
import { GamePhases } from "./components/GamePhases";
import { GameModals } from "./components/GameModals";
import styles from "./Room.module.css";

export default function GameRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const roomIdStr = Array.isArray(roomId) ? roomId[0] : roomId;
  const router = useRouter();

  // 게임 상태 및 통신을 관장하는 커스텀 훅 사용
  const {
    room,
    chatMessages,
    visibleWords,
    myPlayerId,
    loading,
    loadingAction,
    errorBanner,
    setErrorBanner,
    fatalError,
    performAction,
  } = useGameRoom(roomIdStr);

  // 화면 하단 메시지 입력 및 모달 제어 상태
  const [topicInput, setTopicInput] = useState("");
  const [endConditionInput, setEndConditionInput] = useState<EndCondition>("firstWin");
  const [wordInput, setWordInput] = useState("");
  const [chatInput, setChatInput] = useState("");

  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [answerModalOpen, setAnswerModalOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState("");

  if (loading) return <div className={styles.fullscreenCenter}>접속 중...</div>;

  // 입장 불가 / 방 없음 등 더 이상 진행할 수 없는 경우
  if (fatalError) {
    return (
      <div className={styles.fullscreenCenter} style={{ flexDirection: "column", gap: "16px", textAlign: "center", padding: "16px" }}>
        <div>{fatalError}</div>
        <button className={styles.button} style={{ width: "auto", padding: "0 20px" }} onClick={() => router.push("/")}>
          로비로 이동
        </button>
      </div>
    );
  }

  // 내 정보 및 현재 턴 정보 계산
  const me = room?.players.find((p) => p.id === myPlayerId);
  const iAmJudge = !!me?.isJudge;
  const currentTurnPlayer = room?.players[room.turnIndex];
  const isMyTurn = currentTurnPlayer?.id === myPlayerId;

  // 단어 배정 순서 계산 (자신의 다음 플레이어 찾기)
  const nonJudgePlayers = room ? room.players.filter(p => !p.isJudge) : [];
  const myIndexInNonJudge = room && myPlayerId ? nonJudgePlayers.findIndex(p => p.id === myPlayerId) : -1;
  const targetForWordAssign = room && myIndexInNonJudge !== -1 ? nonJudgePlayers[(myIndexInNonJudge + 1) % nonJudgePlayers.length] : null;

  // 핸들러들
  // 주제 설정 및 게임 시작 (심판 전용)
  const handleStartGame = () => {
    if (!topicInput.trim()) {
      setErrorBanner("주제를 입력해주세요.");
      return;
    }
    performAction({ type: "set_topic_and_rule", topic: topicInput.trim(), endCondition: endConditionInput });
  };

  // 단어 제출 핸들러
  const handleSubmitWord = (forPlayerId: string) => {
    if (!wordInput.trim()) {
      setErrorBanner("단어를 입력해주세요.");
      return;
    }
    performAction({ type: "submit_word", forPlayerId, word: wordInput.trim() });
    setWordInput("");
  };

  // 채팅 전송
  const handleSendChat = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    performAction({ type: "chat", text: chatInput });
    setChatInput("");
  };

  // 질문 수행 (모달 연동)
  const handlePostQuestion = () => {
    if (!questionText.trim()) return;
    performAction({ type: "post_question", text: questionText });
    setQuestionText("");
    setQuestionModalOpen(false);
  };

  // 정답 제출 (모달 연동)
  const handlePostAnswer = () => {
    if (!answerText.trim()) return;
    performAction({ type: "post_answer", text: answerText });
    setAnswerText("");
    setAnswerModalOpen(false);
  };

  return (
    <div className={styles.wrapper}>
      <GameHeader room={room} roomIdStr={roomIdStr} iAmJudge={iAmJudge} loadingAction={loadingAction} performAction={performAction} />
      
      {errorBanner && <div className={styles.errorBanner}>{errorBanner}</div>}

      <main className={styles.main}>
        <PlayerSidebar
          room={room}
          myPlayerId={myPlayerId}
          visibleWords={visibleWords}
          iAmJudge={iAmJudge}
          performAction={performAction}
          loadingAction={loadingAction}
        />
        
        <section className={styles.content}>
          {room && (
            <GamePhases
              room={room}
              me={me}
              iAmJudge={iAmJudge}
              loadingAction={loadingAction}
              topicInput={topicInput}
              setTopicInput={setTopicInput}
              endConditionInput={endConditionInput}
              setEndConditionInput={setEndConditionInput}
              wordInput={wordInput}
              setWordInput={setWordInput}
              handleStartGame={handleStartGame}
              targetForWordAssign={targetForWordAssign}
              handleSubmitWord={handleSubmitWord}
              chatMessages={chatMessages}
              isMyTurn={isMyTurn}
              chatInput={chatInput}
              setChatInput={setChatInput}
              handleSendChat={handleSendChat}
              setQuestionModalOpen={setQuestionModalOpen}
              setAnswerModalOpen={setAnswerModalOpen}
              performAction={performAction}
              currentTurnPlayer={currentTurnPlayer}
              turnActionUsed={room.turnActionUsed}
            />
          )}
        </section>
      </main>

      <GameModals
        questionModalOpen={questionModalOpen}
        setQuestionModalOpen={setQuestionModalOpen}
        questionText={questionText}
        setQuestionText={setQuestionText}
        handlePostQuestion={handlePostQuestion}
        answerModalOpen={answerModalOpen}
        setAnswerModalOpen={setAnswerModalOpen}
        answerText={answerText}
        setAnswerText={setAnswerText}
        handlePostAnswer={handlePostAnswer}
        questionMaxLength={LIMITS.CHAT_MAX}
        answerMaxLength={LIMITS.WORD_MAX}
      />
    </div>
  );
}
