"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  RoomState,
  ServerToClientMessage,
  ClientToServerMessage,
  Question,
  EndCondition,
} from "@/lib/game/types";

/**
 * 게임 방 페이지 (app/room/[roomId]/page.tsx)
 * 고도화된 게임 흐름 및 상태별 UI 반영 버전
 */
export default function GameRoomPage() {
  const router = useRouter();
  const { roomId } = useParams<{ roomId: string }>();
  const roomIdStr = Array.isArray(roomId) ? roomId[0] : roomId;

  // ─── 상태 관리 ──────────────────────────────────
  const [room, setRoom] = useState<RoomState | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // 입력 필드들
  const [topicInput, setTopicInput] = useState("");
  const [wordInput, setWordInput] = useState("");
  const [askToPlayerId, setAskToPlayerId] = useState("");
  const [askText, setAskText] = useState("");
  const [guessText, setGuessText] = useState("");
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});

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
        setQuestions(data.questions);
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
      const res = await fetch(`/api/room/${roomIdStr}/state`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.room) setRoom(data.room);
      if (data.questions) setQuestions(data.questions);
    } catch (err) {
      console.error("Polling error:", err);
    }
  };

  // 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [questions]);

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
      if (data.questions) setQuestions(data.questions);
      
      // 서버 메시지 처리 (예: guess_result, game_over 등)
      if (data.messages) {
        data.messages.forEach((msg: ServerToClientMessage) => {
          if (msg.type === "guess_result") {
            setErrorBanner(msg.correct ? "🎉 정답입니다!" : "❌ 틀렸습니다.");
            setTimeout(() => setErrorBanner(null), 3000);
          } else if (msg.type === "game_over") {
            setErrorBanner(`🏆 축하합니다! 승자: ${msg.winnerId}`);
          } else if (msg.type === "error") {
            setErrorBanner(`에러: ${msg.message}`);
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

  const handleAsk = () => {
    if (!askToPlayerId || !askText) return;
    performAction({ type: "ask_question", toPlayerId: askToPlayerId, text: askText });
    setAskText("");
  };

  const handleAnswer = (questionId: string) => {
    const text = answerInputs[questionId];
    if (!text) return;
    performAction({ type: "answer_question", questionId, text });
    setAnswerInputs(prev => ({ ...prev, [questionId]: "" }));
  };

  const handleGuess = () => {
    if (!guessText) return;
    performAction({ type: "guess_word", text: guessText });
    setGuessText("");
  };

  // ─── 렌더링 도우미 ──────────────────────────
  if (loading) return <div style={styles.fullscreenCenter}>접속 중...</div>;

  const me = room?.players.find((p) => p.id === myPlayerId);
  const iAmJudge = me?.isJudge;
  const currentTurnPlayer = room?.players[room.turnIndex];
  const isMyTurn = currentTurnPlayer?.id === myPlayerId;

  // 원형 좌석 기반 대상자 찾기 (i + 1) % n
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

  // ─── 메인 뷰 ──────────────────────────────
  return (
    <div style={styles.wrapper}>
      {/* 1. 상단 헤더 */}
      <header style={styles.header}>
        <div style={styles.headerTitle}>Room ID: {roomIdStr}</div>
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
            {room?.players.map((p) => (
              <div key={p.id} style={{
                ...styles.playerCard,
                borderColor: room?.status === "playing" && p.id === currentTurnPlayer?.id ? "#818cf8" : "#334155"
              }}>
                <div style={styles.playerName}>
                  {p.name} {p.id === myPlayerId && "(나)"} {p.isJudge && "⚖️"}
                </div>
                {p.wordSubmitted && <div style={{ fontSize: "0.7rem", color: "#10b981" }}>단어 제출됨 ✓</div>}
                {!p.isAlive && <div style={{ fontSize: "0.7rem", color: "#ef4444" }}>게임 종료 🏁</div>}
              </div>
            ))}
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
                <p>왼쪽 플레이어인 <strong>{targetForWordAssign?.name}</strong>님에게 줄 단어를 정해주세요.</p>
                
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
              </div>
            </div>
          )}

          {/* (3) status === "playing" */}
          {room?.status === "playing" && (
            <div style={styles.gameArea}>
              <div style={styles.turnInfo}>
                <span style={{ fontWeight: 700, color: "#818cf8" }}>라운드 {room.round}</span>
                <span style={{ margin: "0 10px" }}>|</span>
                <span>현재 턴: <strong>{currentTurnPlayer?.name}</strong></span>
                {isMyTurn && <span style={styles.myTurnBadge}>당신의 차례입니다!</span>}
              </div>

              {/* Q&A 로그 */}
              <div style={styles.logContainer} ref={scrollRef}>
                {questions.map((q) => (
                  <div key={q.id} style={styles.logItem}>
                    <div style={styles.logHeader}>
                      {room.players.find(p => p.id === q.fromPlayerId)?.name} → {room.players.find(p => p.id === q.toPlayerId)?.name}
                    </div>
                    <div style={styles.logText}>❓ {q.text}</div>
                    {q.answer ? (
                      <div style={styles.logAnswer}>💬 {q.answer}</div>
                    ) : (
                      q.toPlayerId === myPlayerId && (
                        <div style={styles.answerArea}>
                          <input
                            style={styles.smallInput}
                            placeholder="답변하기..."
                            value={answerInputs[q.id] || ""}
                            onChange={(e) => setAnswerInputs(prev => ({ ...prev, [q.id]: e.target.value }))}
                          />
                          <button style={styles.smallButton} onClick={() => handleAnswer(q.id)} disabled={loadingAction}>
                            답변
                          </button>
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>

              {/* 플레이어 조작 영역 */}
              {!iAmJudge && (
                <div style={styles.actionPanel}>
                  <h3>액션</h3>
                  <div style={styles.actionRow}>
                    <select
                      style={styles.select}
                      value={askToPlayerId}
                      onChange={(e) => setAskToPlayerId(e.target.value)}
                      disabled={!isMyTurn || loadingAction}
                    >
                      <option value="">질문 대상 선택</option>
                      {room.players.filter(p => p.id !== myPlayerId && !p.isJudge).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <input
                      style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                      placeholder="질문 내용을 입력하세요"
                      value={askText}
                      onChange={(e) => setAskText(e.target.value)}
                      disabled={!isMyTurn || loadingAction}
                    />
                    <button style={styles.button} onClick={handleAsk} disabled={!isMyTurn || loadingAction}>
                      질문 전송
                    </button>
                  </div>
                  <div style={styles.actionRow}>
                    <input
                      style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                      placeholder="내 단어를 맞춰보세요 (정답 추측)"
                      value={guessText}
                      onChange={(e) => setGuessText(e.target.value)}
                      disabled={!isMyTurn || loadingAction}
                    />
                    <button style={{ ...styles.button, backgroundColor: "#059669" }} onClick={handleGuess} disabled={!isMyTurn || loadingAction}>
                      정답 시도
                    </button>
                  </div>
                </div>
              )}

              {/* 심판 조작 영역 (필요 시 유지) */}
              {iAmJudge && (
                <div style={styles.actionPanel}>
                  <h3>심판 모니터링</h3>
                  <p style={{ fontSize: "0.85rem", color: "#94a3b8" }}>플레이어들의 발언을 지켜보고 있습니다.</p>
                </div>
              )}
            </div>
          )}

          {/* (4) status === "finished" */}
          {room?.status === "finished" && (
            <div style={styles.centerBox}>
              <div style={styles.setupCard}>
                <h1 style={{ fontSize: "3rem", marginBottom: "20px" }}>🏁</h1>
                <h2>게임이 종료되었습니다!</h2>
                {room.winnerPlayerId ? (
                  <p style={{ fontSize: "1.5rem", marginTop: "10px" }}>
                    승자: <span style={{ color: "#fbbf24", fontWeight: 700 }}>{room.players.find(p => p.id === room.winnerPlayerId)?.name}</span>
                  </p>
                ) : (
                  <p>모든 플레이어들이 도착했습니다.</p>
                )}
                <button style={{ ...styles.button, marginTop: "24px" }} onClick={() => router.push("/")}>
                  로비로 돌아가기
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── 디자인 스타일 ──────────────────────────
const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#0f172a",
    color: "#f1f5f9",
  },
  fullscreenCenter: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.2rem",
    backgroundColor: "#0f172a",
    color: "#f1f5f9",
  },
  header: {
    padding: "16px 24px",
    backgroundColor: "#1e293b",
    borderBottom: "1px solid #334155",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: "1.2rem", fontWeight: 700 },
  headerStats: { display: "flex", gap: "10px" },
  badge: {
    padding: "4px 12px",
    backgroundColor: "#334155",
    borderRadius: "20px",
    fontSize: "0.85rem",
    fontWeight: 600,
  },
  main: { flex: 1, display: "flex", overflow: "hidden" },
  sidebar: {
    width: "280px",
    backgroundColor: "#111827",
    padding: "20px",
    borderRight: "1px solid #334155",
    display: "flex",
    flexDirection: "column",
  },
  sidebarHeader: { fontSize: "0.9rem", color: "#94a3b8", marginBottom: "16px", textTransform: "uppercase" },
  playerList: { flex: 1, overflowY: "auto" },
  playerCard: {
    padding: "12px",
    backgroundColor: "#1e293b",
    borderRadius: "8px",
    marginBottom: "8px",
    border: "2px solid #334155",
  },
  playerName: { fontWeight: 600, fontSize: "0.95rem" },
  content: { flex: 1, display: "flex", flexDirection: "column", position: "relative" },
  errorBanner: {
    position: "absolute",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "10px 24px",
    backgroundColor: "#ef4444",
    color: "white",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    zIndex: 100,
    fontWeight: 600,
  },
  centerBox: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px",
  },
  setupCard: {
    maxWidth: "400px",
    width: "100%",
    padding: "32px",
    backgroundColor: "#1e293b",
    borderRadius: "16px",
    border: "1px solid #4f46e5",
    textAlign: "center",
  },
  infoText: { fontSize: "1.1rem", color: "#94a3b8", textAlign: "center" },
  successText: { color: "#10b981", marginTop: "16px", fontSize: "0.9rem", fontWeight: 600 },
  gameArea: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  turnInfo: {
    padding: "12px 24px",
    backgroundColor: "#1e293b",
    borderBottom: "1px solid #334155",
    display: "flex",
    alignItems: "center",
  },
  myTurnBadge: {
    marginLeft: "20px",
    padding: "2px 10px",
    backgroundColor: "#4f46e5",
    borderRadius: "4px",
    fontSize: "0.75rem",
    fontWeight: 700,
  },
  logContainer: { flex: 1, padding: "24px", overflowY: "auto" },
  logItem: {
    marginBottom: "16px",
    backgroundColor: "#1e293b",
    padding: "16px",
    borderRadius: "12px",
    border: "1px solid #334155",
  },
  logHeader: { fontSize: "0.75rem", color: "#94a3b8", marginBottom: "8px" },
  logText: { fontSize: "1rem", fontWeight: 600 },
  logAnswer: { marginTop: "8px", paddingLeft: "12px", borderLeft: "3px solid #10b981", color: "#10b981", fontWeight: 500 },
  answerArea: { marginTop: "12px", display: "flex", gap: "8px" },
  actionPanel: {
    padding: "24px",
    backgroundColor: "#1e293b",
    borderTop: "1px solid #334155",
  },
  actionRow: { display: "flex", gap: "10px", marginBottom: "12px" },
  input: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#334155",
    border: "1px solid #475569",
    borderRadius: "8px",
    color: "#f1f5f9",
    marginBottom: "16px",
    fontSize: "1rem",
  },
  smallInput: {
    flex: 1,
    padding: "8px 12px",
    backgroundColor: "#0f172a",
    border: "1px solid #475569",
    borderRadius: "6px",
    color: "#f1f5f9",
  },
  select: {
    padding: "8px 12px",
    backgroundColor: "#334155",
    border: "1px solid #475569",
    borderRadius: "8px",
    color: "#f1f5f9",
  },
  button: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#6366f1",
    color: "white",
    fontWeight: 700,
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  smallButton: {
    padding: "8px 16px",
    backgroundColor: "#10b981",
    color: "white",
    fontWeight: 700,
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};
