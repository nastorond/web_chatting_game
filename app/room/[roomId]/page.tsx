"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useGameRoom } from "./hooks/useGameRoom";
import { GameHeader } from "./components/GameHeader";
import { PlayerSidebar } from "./components/PlayerSidebar";
import { GamePhases } from "./components/GamePhases";
import { GameModals } from "./components/GameModals";
import styles from "./Room.module.css";

export default function GameRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const roomIdStr = Array.isArray(roomId) ? roomId[0] : roomId;

  const {
    room,
    chatMessages,
    visibleWords,
    myPlayerId,
    loading,
    loadingAction,
    errorBanner,
    setErrorBanner,
    performAction,
  } = useGameRoom(roomIdStr);

  // 로컬 컴포넌트 전용 상태 (입력값 등)
  const [topicInput, setTopicInput] = useState("");
  const [wordInput, setWordInput] = useState("");
  const [chatInput, setChatInput] = useState("");

  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [answerModalOpen, setAnswerModalOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState("");

  if (loading) return <div className={styles.fullscreenCenter}>접속 중...</div>;

  const me = room?.players.find((p) => p.id === myPlayerId);
  const iAmJudge = !!me?.isJudge;
  const currentTurnPlayer = room?.players[room.turnIndex];
  const isMyTurn = currentTurnPlayer?.id === myPlayerId;

  const nonJudgePlayers = room ? room.players.filter(p => !p.isJudge) : [];
  const myIndexInNonJudge = room && myPlayerId ? nonJudgePlayers.findIndex(p => p.id === myPlayerId) : -1;
  const targetForWordAssign = room && myIndexInNonJudge !== -1 ? nonJudgePlayers[(myIndexInNonJudge + 1) % nonJudgePlayers.length] : null;

  // 핸들러들
  const handleStartGame = () => {
    if (!topicInput) {
      setErrorBanner("주제를 입력해주세요.");
      return;
    }
    performAction({ type: "set_topic_and_rule", topic: topicInput, endCondition: "firstWin" });
  };

  const handleSubmitWord = (forPlayerId: string) => {
    if (!wordInput) {
      setErrorBanner("단어를 입력해주세요.");
      return;
    }
    performAction({ type: "submit_word", forPlayerId, word: wordInput });
    setWordInput("");
  };

  const handleSendChat = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    performAction({ type: "chat", text: chatInput });
    setChatInput("");
  };

  const handlePostQuestion = () => {
    if (!questionText.trim()) return;
    performAction({ type: "post_question", text: questionText });
    setQuestionText("");
    setQuestionModalOpen(false);
  };

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
      />
    </div>
  );
}
