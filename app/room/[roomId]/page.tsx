"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  RoomState,
  ServerToClientMessage,
  ClientToServerMessage,
  ChatMessage,
} from "@/lib/game/types";

export default function GameRoomPage() {
  const router = useRouter();
  const { roomId } = useParams<{ roomId: string }>();
  const roomIdStr = Array.isArray(roomId) ? roomId[0] : roomId;

  // ─── 상태 관리 ──────────────────────────────────
  const [room, setRoom] = useState<RoomState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [visibleWords, setVisibleWords] = useState<{ playerId: string; word: string | null }[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // 입력 필드들
  const [topicInput, setTopicInput] = useState("");
  const [wordInput, setWordInput] = useState("");
  const [chatInput, setChatInput] = useState("");

  // 모달 상태 (질문/정답 전용)
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [answerModalOpen, setAnswerModalOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 초기 진입 및 폴링 ──────────────────────────
  useEffect(() => {
    const nickname = localStorage.getItem("nickname");
    if (!nickname) {
      router.push("/");
      return;
    }

    const playerIdKey = `playerId:${roomIdStr}`;
    let playerId = localStorage.getItem(playerIdKey);
    if (!playerId) {
      playerId = `p-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(playerIdKey, playerId);
    }
    setMyPlayerId(playerId);

    const initGame = async () => {
      try {
        const res = await fetch(`/api/room/${roomIdStr}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, name: nickname }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setRoom(data.room);
        setChatMessages(data.chatMessages || []);
        setVisibleWords(data.visibleWords || []);
        setLoading(false);
        startPolling();
      } catch (err: any) {
        setErrorBanner(`접속 오류: ${err.message}`);
        setLoading(false);
      }
    };

    initGame();

    return () => {
      if (pollingTimer.current) clearInterval(pollingTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdStr, router]);

  const startPolling = () => {
    if (pollingTimer.current) clearInterval(pollingTimer.current);
    pollingTimer.current = setInterval(fetchState, 1000);
  };

  const fetchState = async () => {
    try {
      const res = await fetch(`/api/room/${roomIdStr}/state?playerId=${myPlayerId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.room) setRoom(data.room);
      if (data.chatMessages) setChatMessages(data.chatMessages);
      if (data.visibleWords) setVisibleWords(data.visibleWords);
    } catch (err) {
      console.error("Polling error:", err);
    }
  };

  // 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // ─── 액션 전송 ─────────────────────────────────
  const performAction = async (action: ClientToServerMessage) => {
    setLoadingAction(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/room/${roomIdStr}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: myPlayerId, action }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.room) setRoom(data.room);
      if (data.chatMessages) setChatMessages(data.chatMessages);
      if (data.visibleWords) setVisibleWords(data.visibleWords);
      
      if (data.messages) {
        data.messages.forEach((msg: ServerToClientMessage) => {
          if (msg.type === "guess_result") {
            setErrorBanner(msg.correct ? "🎉 정답입니다!" : "❌ 틀렸습니다.");
            setTimeout(() => setErrorBanner(null), 3000);
          }
        });
      }
    } catch (err: any) {
      setErrorBanner(`작업 실패: ${err.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  // ─── 액션 핸들러 ──────────────────────────────
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

  const handlePostQuestion = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!questionText.trim()) return;
    performAction({ type: "post_question", text: questionText });
    setQuestionText("");
    setQuestionModalOpen(false);
  };

  const handlePostAnswer = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!answerText.trim()) return;
    performAction({ type: "post_answer", text: answerText });
    setAnswerText("");
    setAnswerModalOpen(false);
  };

  if (loading) return <div style={styles.fullscreenCenter}>접속 중...</div>;

  const me = room?.players.find((p) => p.id === myPlayerId);
  const iAmJudge = me?.isJudge;
  const currentTurnPlayer = room?.players[room.turnIndex];
  const isMyTurn = currentTurnPlayer?.id === myPlayerId;

  const myIndex = room ? room.players.findIndex(p => p.id === myPlayerId) : -1;
  const targetForWordAssign = room && myIndex !== -1 
    ? room.players[(myIndex + 1) % room.players.length] 
    : null;

  const getStatusLabel = (status: string | undefined) => {
    switch (status) {
      case "waiting": return "대기 중";
      case "word_submission": return "단어 제출 단계";
      case "playing": return "진행 중";
      case "finished": return "게임 종료";
      default: return "-";
    }
  };

  const getChatStyle = (kind: string) => {
    switch (kind) {
      case "system": return styles.chatSystem;
      case "guess": return styles.chatGuess;
      case "question": return styles.chatQuestion;
      case "answer": return styles.chatAnswer;
      default: return styles.chatNormal;
    }
  };

  // ─── 메인 뷰 ──────────────────────────────
  return (
    <div style={styles.wrapper}>
      {/* 1. 상단 헤더 */}
      <header style={styles.header}>
        <div style={styles.headerTitle}>
          Room ID: {roomIdStr} 
          {room?.topic && <span style={styles.topicTag}>주제: {room.topic}</span>}
        </div>
        <div style={styles.headerStats}>
          <span style={styles.badge}>상태: {getStatusLabel(room?.status)}</span>
          <span style={{ ...styles.badge, backgroundColor: iAmJudge ? "#ef4444" : "#10b981" }}>
            역할: {iAmJudge ? "심판" : "플레이어"}
          </span>
        </div>
      </header>

      {errorBanner && <div style={styles.errorBanner}>{errorBanner}</div>}

      <main style={styles.main}>
        {/* 사이드바: 플레이어 목록 */}
        <aside style={styles.sidebar}>
          <h3 style={styles.sidebarHeader}>플레이어 ({room?.players.length})</h3>
          <div style={styles.playerList}>
            {room?.players.map((p) => {
              const v = visibleWords.find(vw => vw.playerId === p.id);
              const active = room?.status === "playing" && p.id === currentTurnPlayer?.id;
              return (
                <div key={p.id} style={{
                  ...styles.playerCard,
                  borderColor: active ? "#818cf8" : "#334155",
                  backgroundColor: active ? "rgba(129, 140, 248, 0.1)" : "#1e293b",
                  boxShadow: active ? "0 0 10px rgba(129, 140, 248, 0.3)" : "none"
                }}>
                  <div style={styles.playerName}>
                    {active && <span style={{ marginRight: "4px" }}>▶</span>}
                    {p.name} {p.id === myPlayerId && "(나)"} {p.isJudge && "⚖️"}
                  </div>
                  <div style={styles.playerWord}>
                    {p.id === myPlayerId ? (
                      <span style={{ color: "#94a3b8" }}>내 단어: ???</span>
                    ) : (
                      v?.word ? (
                        <span style={{ color: "#fbbf24" }}>단어: {v.word}</span>
                      ) : (
                        <span style={{ color: "#64748b" }}>단어: (미정)</span>
                      )
                    )}
                  </div>
                  {p.wordSubmitted && <div style={{ fontSize: "0.7rem", color: "#10b981", marginTop: "4px" }}>단어 제출됨 ✓</div>}
                  {!p.isAlive && <div style={{ fontSize: "0.7rem", color: "#ef4444", marginTop: "4px" }}>게임 종료 🏁</div>}
                </div>
              );
            })}
          </div>
        </aside>

        {/* 메인 콘텐츠 영역 */}
        <section style={styles.content}>
          {/* (1) status === "waiting" */}
          {room?.status === "waiting" && (
            <div style={styles.centerBox}>
              {iAmJudge ? (
                <div style={styles.setupCard}>
                  <h2>🎮 게임 시작 설정</h2>
                  <p>주제를 정하고 게임을 시작해 주세요.</p>
                  <input
                    style={styles.input}
                    placeholder="예: 동물, 영화 제목, 브랜드명..."
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                  />
                  <select style={styles.select} disabled>
                    <option value="firstWin">종합 승리 모드 (firstWin)</option>
                  </select>
                  <button style={styles.button} onClick={handleStartGame} disabled={loadingAction}>
                    {loadingAction ? "시작 중..." : "게임 시작"}
                  </button>
                </div>
              ) : (
                <div style={styles.infoText}>심판이 게임을 준비 중입니다. 잠시만 기다려주세요...</div>
              )}
            </div>
          )}

          {/* (2) status === "word_submission" */}
          {room?.status === "word_submission" && (
            <div style={styles.centerBox}>
              <div style={styles.setupCard}>
                <h2>📝 단어 배정 단계</h2>
                {iAmJudge ? (
                  <div style={styles.infoText}>
                    진행자(심판)는 단어를 제출하지 않습니다.<br/>
                    플레이어들이 단어를 제출할 때까지 기다려 주세요.
                  </div>
                ) : (
                  <>
                    <p>배정할 단어를 입력해주세요.<br/><small style={{ color: "#94a3b8" }}>(서버가 자동으로 다른 플레이어에게 할당합니다.)</small></p>
                    
                    {me?.wordSubmitted ? (
                      <div style={styles.successText}>
                        단어를 제출했습니다. 다른 플레이어들이 완료할 때까지 기다려주세요.
                      </div>
                    ) : (
                      <>
                        <input
                          style={styles.input}
                          placeholder="배정할 단어 입력"
                          value={wordInput}
                          onChange={(e) => setWordInput(e.target.value)}
                        />
                        <button 
                          style={styles.button} 
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

          {/* (3) status === "playing" | "finished" */}
          {(room?.status === "playing" || room?.status === "finished") && (
            <div style={styles.gameArea}>
              {room?.status === "playing" && (
                <div style={styles.turnInfo}>
                  <span style={{ fontWeight: 700, color: "#818cf8" }}>라운드 {room.round}</span>
                  <span style={{ margin: "0 10px" }}>|</span>
                  <span>현재 차례: <strong>{currentTurnPlayer?.name}</strong></span>
                  {isMyTurn && <span style={styles.myTurnBadge}>당신의 차례입니다!</span>}
                </div>
              )}

              {/* 채팅 로그 */}
              <div style={styles.logContainer} ref={scrollRef}>
                {chatMessages.map((msg) => (
                  <div key={msg.id} style={{ ...styles.chatRow, ...getChatStyle(msg.kind) }}>
                    {(msg.kind === "question" || msg.kind === "answer") && (
                      <div style={msg.kind === "question" ? styles.questionTag : styles.answerTag}>
                        {msg.kind === "question" ? "[질문]" : "[정답 시도]"}
                      </div>
                    )}
                    {msg.kind !== "system" && msg.kind !== "guess" && (
                      <span style={styles.chatAuthor}>
                        {room.players.find(p => p.id === msg.playerId)?.name || "Unknown"}:
                      </span>
                    )}
                    <span style={styles.chatText}>{msg.text}</span>
                  </div>
                ))}
                {room?.status === "finished" && (
                  <div style={styles.finishAnnouncement}>
                    <h2>🏁 게임 종료</h2>
                    {room.winnerPlayerId && (
                      <p>최종 승자: <strong>{room.players.find(p => p.id === room.winnerPlayerId)?.name}</strong></p>
                    )}
                    <button style={{ ...styles.button, width: "auto", marginTop: "20px" }} onClick={() => router.push("/")}>
                      로비로 이동
                    </button>
                  </div>
                )}
              </div>

              {/* 플레이어 조작 영역 */}
              {room?.status === "playing" && (
                <div style={styles.actionPanel}>
                  {/* 턴 액션 버튼 */}
                  {isMyTurn && !iAmJudge && (
                    <div style={styles.turnButtonGroup}>
                      <button style={styles.actionButton} onClick={() => setQuestionModalOpen(true)}>질문하기</button>
                      <button style={{ ...styles.actionButton, backgroundColor: "#059669" }} onClick={() => setAnswerModalOpen(true)}>정답 시도하기</button>
                    </div>
                  )}
                  {/* 자유 채팅 입력 */}
                  <form onSubmit={handleSendChat} style={styles.actionRow}>
                    <input
                      style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                      placeholder="자유롭게 채팅하세요 (질문/답변은 버튼 클릭)"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={loadingAction}
                    />
                    <button type="submit" style={{ ...styles.button, width: "80px" }} disabled={loadingAction || !chatInput.trim()}>
                      전송
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* 질문 모달 */}
      {questionModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3>❓ 질문하기</h3>
            <p>공통 채팅창에 공개될 질문을 입력하세요.</p>
            <textarea
              style={styles.textarea}
              placeholder="질문을 입력하세요..."
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
            />
            <div style={styles.modalButtons}>
              <button style={styles.modalCancel} onClick={() => setQuestionModalOpen(false)}>취소</button>
              <button style={styles.modalSubmit} onClick={handlePostQuestion}>질문 전송</button>
            </div>
          </div>
        </div>
      )}

      {/* 정답 모달 */}
      {answerModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3>🎯 정답 제시하기</h3>
            <p>당신의 비밀 단어는 무엇인가요?</p>
            <input
              style={styles.input}
              placeholder="예상 단어 입력"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
            />
            <div style={styles.modalButtons}>
              <button style={styles.modalCancel} onClick={() => setAnswerModalOpen(false)}>취소</button>
              <button style={{ ...styles.modalSubmit, backgroundColor: "#059669" }} onClick={handlePostAnswer}>정답 시도</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { height: "100vh", display: "flex", flexDirection: "column", backgroundColor: "#0f172a", color: "#f1f5f9" },
  fullscreenCenter: { height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", backgroundColor: "#0f172a", color: "#f1f5f9" },
  header: { padding: "16px 24px", backgroundColor: "#1e293b", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: "1.2rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "12px" },
  topicTag: { fontSize: "0.9rem", color: "#fbbf24", backgroundColor: "rgba(251, 191, 36, 0.1)", padding: "4px 10px", borderRadius: "6px", border: "1px solid rgba(251, 191, 36, 0.3)" },
  headerStats: { display: "flex", gap: "10px" },
  badge: { padding: "4px 12px", backgroundColor: "#334155", borderRadius: "20px", fontSize: "0.85rem", fontWeight: 600 },
  main: { flex: 1, display: "flex", overflow: "hidden" },
  sidebar: { width: "280px", backgroundColor: "#111827", padding: "20px", borderRight: "1px solid #334155", display: "flex", flexDirection: "column" },
  sidebarHeader: { fontSize: "0.9rem", color: "#94a3b8", marginBottom: "16px", textTransform: "uppercase" },
  playerList: { flex: 1, overflowY: "auto" },
  playerCard: { padding: "12px", borderRadius: "8px", marginBottom: "8px", border: "2px solid #334155", transition: "all 0.2s" },
  playerName: { fontWeight: 600, fontSize: "0.95rem" },
  playerWord: { fontSize: "0.85rem", marginTop: "4px", fontWeight: 500 },
  content: { flex: 1, display: "flex", flexDirection: "column", position: "relative" },
  errorBanner: { position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", padding: "10px 24px", backgroundColor: "#ef4444", color: "white", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 100, fontWeight: 600 },
  centerBox: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" },
  setupCard: { maxWidth: "400px", width: "100%", padding: "32px", backgroundColor: "#1e293b", borderRadius: "16px", border: "1px solid #4f46e5", textAlign: "center" },
  infoText: { fontSize: "1.1rem", color: "#94a3b8", textAlign: "center" },
  successText: { color: "#10b981", marginTop: "16px", fontSize: "0.9rem", fontWeight: 600 },
  gameArea: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  turnInfo: { padding: "12px 24px", backgroundColor: "#1e293b", borderBottom: "1px solid #334155", display: "flex", alignItems: "center" },
  myTurnBadge: { marginLeft: "20px", padding: "2px 10px", backgroundColor: "#4f46e5", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700 },
  logContainer: { flex: 1, padding: "24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" },
  chatRow: { padding: "8px 14px", borderRadius: "12px", maxWidth: "80%" },
  chatNormal: { backgroundColor: "rgba(255,255,255,0.05)", alignSelf: "flex-start" },
  chatSystem: { backgroundColor: "rgba(148, 163, 184, 0.1)", color: "#94a3b8", fontSize: "0.85rem", alignSelf: "center", textAlign: "center", maxWidth: "90%", borderRadius: "20px" },
  chatGuess: { backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", alignSelf: "center", borderRadius: "8px" },
  chatQuestion: { backgroundColor: "rgba(16, 185, 129, 0.1)", border: "2px solid #10b981", alignSelf: "flex-start" },
  chatAnswer: { backgroundColor: "rgba(59, 130, 246, 0.1)", border: "2px solid #3b82f6", alignSelf: "flex-start" },
  chatAuthor: { fontWeight: 700, marginRight: "8px", color: "#818cf8" },
  chatText: { wordBreak: "break-all" },
  questionTag: { fontSize: "0.7rem", fontWeight: 800, color: "#10b981", marginBottom: "2px", textTransform: "uppercase" },
  answerTag: { fontSize: "0.7rem", fontWeight: 800, color: "#3b82f6", marginBottom: "2px", textTransform: "uppercase" },
  finishAnnouncement: { padding: "40px", textAlign: "center", backgroundColor: "#1e293b", borderRadius: "16px", marginTop: "20px", border: "2px solid #fbbf24" },
  actionPanel: { padding: "20px 24px", backgroundColor: "#1e293b", borderTop: "1px solid #334155" },
  turnButtonGroup: { display: "flex", gap: "12px", marginBottom: "12px" },
  actionButton: { flex: 1, padding: "10px", backgroundColor: "#4f46e5", color: "white", fontWeight: 800, borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.9rem" },
  actionRow: { display: "flex", gap: "10px" },
  input: { width: "100%", padding: "12px", backgroundColor: "#334155", border: "1px solid #475569", borderRadius: "8px", color: "#f1f5f9", marginBottom: "0px", fontSize: "1rem" },
  textarea: { width: "100%", height: "100px", padding: "12px", backgroundColor: "#334155", border: "1px solid #475569", borderRadius: "8px", color: "#f1f5f9", fontSize: "1rem", resize: "none" },
  select: { padding: "8px 12px", backgroundColor: "#334155", border: "1px solid #475569", borderRadius: "8px", color: "#f1f5f9" },
  button: { width: "100%", padding: "12px", backgroundColor: "#6366f1", color: "white", fontWeight: 700, border: "none", borderRadius: "8px", cursor: "pointer" },
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" },
  modalContent: { maxWidth: "450px", width: "100%", backgroundColor: "#1e293b", padding: "32px", borderRadius: "20px", border: "1px solid #334155", textAlign: "left" },
  modalButtons: { display: "flex", gap: "12px", marginTop: "20px" },
  modalSubmit: { flex: 2, padding: "12px", backgroundColor: "#4f46e5", color: "white", fontWeight: 700, borderRadius: "8px", border: "none", cursor: "pointer" },
  modalCancel: { flex: 1, padding: "12px", backgroundColor: "transparent", color: "#94a3b8", fontWeight: 700, borderRadius: "8px", border: "1px solid #334155", cursor: "pointer" },
};
