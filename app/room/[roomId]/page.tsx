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
 * UI 흐름 및 사용자 경험(UX) 개선 버전
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
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // 게임 설정 입력 (심판용)
  const [topicInput, setTopicInput] = useState("");
  const [endConditionInput, setEndConditionInput] = useState<EndCondition>("firstWin");

  // 게임 플레이 입력
  const [askToPlayerId, setAskToPlayerId] = useState("");
  const [askText, setAskText] = useState("");
  const [guessText, setGuessText] = useState("");
  const [judgeActionTarget, setJudgeActionTarget] = useState("");

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
      if (!res.ok) throw new Error("서버 응답 오류");
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

  // ─── 메시지 처리 ─────────────────────────────
  const handleServerMessages = (messages: ServerToClientMessage[]) => {
    messages.forEach((msg) => {
      switch (msg.type) {
        case "guess_result":
          setErrorBanner(
            msg.correct
              ? `🎉 ${msg.word ? `[${msg.word}] ` : ""}정답입니다!`
              : "❌ 땡! 틀렸습니다."
          );
          setTimeout(() => setErrorBanner(null), 3000);
          break;
        case "judge_penalty":
          const action = msg.action === "mute_30s" ? "30초 간 침묵" : "주의";
          setErrorBanner(`👨‍⚖️ [심판] ${msg.targetPlayerId}에게 ${action} 조치!`);
          setTimeout(() => setErrorBanner(null), 3000);
          break;
        case "game_over":
          setRoom(prev => prev ? { ...prev, status: "finished" } : null);
          setErrorBanner(`🏆 게임 종료! 승자: ${msg.winnerId || "없음"}`);
          // 종료 시에는 에러 배너를 오래 유지하거나 수동으로 닫게 함
          break;
        case "error":
          setErrorBanner(`❌ 에러: ${msg.message}`);
          setTimeout(() => setErrorBanner(null), 5000);
          break;
      }
    });
  };

  // ─── 액션 전송 ─────────────────────────────────
  const performAction = async (action: ClientToServerMessage) => {
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
      if (data.messages) handleServerMessages(data.messages);
    } catch (err: any) {
      setErrorBanner(`작업 실패: ${err.message}`);
      setTimeout(() => setErrorBanner(null), 3000);
    }
  };

  // 심판 전용: 게임 시작
  const handleStartGame = () => {
    if (!topicInput) {
      setErrorBanner("주제를 입력해주세요.");
      return;
    }
    performAction({
      type: "set_topic_and_rule",
      topic: topicInput,
      endCondition: endConditionInput,
    });
  };

  const handleAsk = () => {
    if (!askToPlayerId || !askText) return;
    performAction({ type: "ask_question", toPlayerId: askToPlayerId, text: askText });
    setAskText("");
  };

  const handleGuess = () => {
    if (!guessText) return;
    performAction({ type: "guess_word", text: guessText });
    setGuessText("");
  };

  const handleJudge = (action: "warn" | "mute_30s") => {
    if (!judgeActionTarget) return;
    performAction({
      type: "judge_action",
      targetPlayerId: judgeActionTarget,
      action,
    });
  };

  // ─── 렌더링 변수 ──────────────────────────
  if (loading) return <div style={styles.fullscreenCenter}>접속 중...</div>;

  const me = room?.players.find((p) => p.id === myPlayerId);
  const iAmJudge = me?.isJudge;
  const currentTurnPlayer = room?.players[room.turnIndex];
  const isMyTurn = currentTurnPlayer?.id === myPlayerId;

  const getStatusText = (status: string | undefined) => {
    switch (status) {
      case "waiting": return "대기 중";
      case "playing": return "진행 중";
      case "finished": return "종료";
      default: return "-";
    }
  };

  // ─── 메인 렌더링 ──────────────────────────
  return (
    <div style={styles.wrapper}>
      {/* [1] 헤더 개선 */}
      <header style={styles.header}>
        <div style={styles.headerTitle}>
          Room ID: <span style={{ color: "#818cf8" }}>{roomIdStr}</span>
        </div>
        <div style={styles.headerStats}>
          <span style={styles.badge}>상태: {getStatusText(room?.status)}</span>
          <span style={{ ...styles.badge, backgroundColor: iAmJudge ? "#ef4444" : "#10b981" }}>
            역할: {iAmJudge ? "심판" : "플레이어"}
          </span>
          {room?.status === "playing" && (
            <span style={{ ...styles.badge, backgroundColor: "#4f46e5" }}>
              현재 턴: {currentTurnPlayer?.name || "대기 중"}
            </span>
          )}
        </div>
      </header>

      <div style={styles.body}>
        {/* 사이드바: 플레이어 목록 */}
        <aside style={styles.sidebar}>
          <h3 style={styles.sidebarHeader}>플레이어 ({room?.players.length})</h3>
          <div style={styles.playerList}>
            {room?.players.map((p) => (
              <div
                key={p.id}
                style={{
                  ...styles.playerCard,
                  borderColor: room?.status === "playing" && p.id === currentTurnPlayer?.id ? "#818cf8" : "#334155",
                  opacity: p.isAlive ? 1 : 0.5,
                }}
              >
                <div style={styles.playerName}>
                  {p.name} {p.id === myPlayerId && "(나)"}
                  {p.isJudge && " ⚖️"}
                </div>
                <div style={styles.playerStatus}>
                  {!p.isAlive && "🏁 도착"}
                  {p.penaltyUntil && p.penaltyUntil > Date.now() && "🔇 Muted"}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* 콘텐츠 영역 */}
        <section style={styles.content}>
          {errorBanner && <div style={styles.errorBanner}>{errorBanner}</div>}

          {/* [2] 심판 전용 게임 세팅 (Waiting 상태일 때) */}
          {iAmJudge && room?.status === "waiting" && (
            <div style={styles.setupBox}>
              <h2 style={{ marginBottom: "16px", fontSize: "1.2rem" }}>🎮 게임 시작 설정</h2>
              <div style={styles.controlRow}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  placeholder="게임 주제 입력 (예: 동물, 영화 제목...)"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                />
                <select
                  style={styles.select}
                  value={endConditionInput}
                  onChange={(e) => setEndConditionInput(e.target.value as EndCondition)}
                >
                  <option value="firstWin">한 명만 맞추면 종료 (선착순)</option>
                  <option value="lastLose">마지막 한 명 남을 때까지 진행</option>
                </select>
                <button style={styles.button} onClick={handleStartGame}>
                  게임 시작
                </button>
              </div>
            </div>
          )}

          {/* [3] 안내 문구 */}
          <div style={styles.instructionBanner}>
            {room?.status === "waiting" && (
              iAmJudge ? "플레이어들이 모두 모이면 주제를 정하고 게임을 시작하세요." : "심판이 게임을 시작하기를 기다리고 있습니다..."
            )}
            {room?.status === "playing" && (
              isMyTurn
                ? "💡 당신의 턴입니다! 다른 플레이어에게 질문하거나 자신의 단어를 맞춰보세요."
                : `${currentTurnPlayer?.name} 플레이어의 턴을 기다리는 중입니다.`
            )}
            {room?.status === "finished" && (
              "🏁 게임이 종료되었습니다. 수고하셨습니다!"
            )}
          </div>

          <div style={styles.logContainer} ref={scrollRef}>
            {questions.map((q) => (
              <div key={q.id} style={styles.logItem}>
                <div style={styles.logHeader}>
                  <span style={{ color: "#818cf8" }}>
                    {room?.players.find((p) => p.id === q.fromPlayerId)?.name}
                  </span>{" "}
                  →{" "}
                  <span style={{ color: "#a78bfa" }}>
                    {room?.players.find((p) => p.id === q.toPlayerId)?.name}
                  </span>
                </div>
                <div style={styles.logQuestion}>❓ {q.text}</div>
                {q.answer && (
                  <div style={styles.logAnswer}>💬 {q.answer}</div>
                )}
              </div>
            ))}
            {questions.length === 0 && (
              <div style={styles.emptyLog}>아직 질문이 없습니다.</div>
            )}
          </div>

          {/* [4] 컨트롤 노출 조건 */}
          <div style={styles.controls}>
            {/* 일반 플레이어용 진행 중 컨트롤 */}
            {room?.status === "playing" && !iAmJudge && (
              <>
                <div style={styles.controlRow}>
                  <select
                    style={styles.select}
                    value={askToPlayerId}
                    onChange={(e) => setAskToPlayerId(e.target.value)}
                    disabled={!isMyTurn}
                  >
                    <option value="">질문할 상대 선택</option>
                    {room.players
                      .filter((p) => p.id !== myPlayerId && !p.isJudge)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <input
                    style={{ ...styles.input, flex: 1 }}
                    placeholder={isMyTurn ? "상대에게 질문하기..." : "내 턴이 아닙니다"}
                    value={askText}
                    onChange={(e) => setAskText(e.target.value)}
                    disabled={!isMyTurn}
                  />
                  <button
                    style={styles.button}
                    onClick={handleAsk}
                    disabled={!isMyTurn}
                  >
                    질문하기
                  </button>
                </div>
                <div style={styles.controlRow}>
                  <input
                    style={{ ...styles.input, flex: 1 }}
                    placeholder={isMyTurn ? "내 단어 정답 추측..." : "내 턴이 아닙니다"}
                    value={guessText}
                    onChange={(e) => setGuessText(e.target.value)}
                    disabled={!isMyTurn}
                  />
                  <button
                    style={{ ...styles.button, backgroundColor: "#059669" }}
                    onClick={handleGuess}
                    disabled={!isMyTurn}
                  >
                    정답 확인
                  </button>
                </div>
              </>
            )}

            {/* 심판용 진행 중 도구 */}
            {iAmJudge && room?.status === "playing" && (
              <div style={styles.judgeControls}>
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>⚖️ 심판 도구 (진행 중)</div>
                <div style={styles.controlRow}>
                  <select
                    style={styles.select}
                    value={judgeActionTarget}
                    onChange={(e) => setJudgeActionTarget(e.target.value)}
                  >
                    <option value="">제재 대상 선택</option>
                    {room.players
                      .filter((p) => !p.isJudge)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <button
                    style={{ ...styles.button, backgroundColor: "#d97706" }}
                    onClick={() => handleJudge("warn")}
                  >
                    경고
                  </button>
                  <button
                    style={{ ...styles.button, backgroundColor: "#dc2626" }}
                    onClick={() => handleJudge("mute_30s")}
                  >
                    30초 침묵
                  </button>
                </div>
              </div>
            )}

            {/* 대기/종료 상태 안내 (플레이어용) */}
            {room?.status !== "playing" && (
              <div style={styles.turnIndicator}>
                {room?.status === "waiting" ? "게임을 준비 중입니다." : "게임이 종료되었습니다."}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── 스타일 (기존 스타일 유지 및 일부 추가) ────────────────
const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#0f172a",
    color: "#f1f5f9",
    overflow: "hidden",
  },
  fullscreenCenter: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
  headerTitle: { fontSize: "1.1rem", fontWeight: 700 },
  headerStats: { display: "flex", gap: "12px" },
  badge: {
    padding: "4px 12px",
    backgroundColor: "#334155",
    borderRadius: "100px",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  body: { flex: 1, display: "flex", overflow: "hidden" },
  sidebar: {
    width: "260px",
    backgroundColor: "#111827",
    padding: "20px",
    borderRight: "1px solid #334155",
    display: "flex",
    flexDirection: "column",
  },
  sidebarHeader: { fontSize: "0.875rem", color: "#94a3b8", marginBottom: "16px" },
  playerList: { flex: 1, overflowY: "auto" },
  playerCard: {
    padding: "12px",
    backgroundColor: "#1e293b",
    borderRadius: "8px",
    marginBottom: "10px",
    border: "2px solid #334155",
    transition: "border-color 0.2s",
  },
  playerName: { fontWeight: 600, fontSize: "0.9rem" },
  playerStatus: { fontSize: "0.7rem", color: "#94a3b8", marginTop: "4px" },
  content: { flex: 1, display: "flex", flexDirection: "column", position: "relative" },
  errorBanner: {
    position: "absolute",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "10px 20px",
    backgroundColor: "#1e293b",
    border: "1px solid #4f46e5",
    borderRadius: "8px",
    fontSize: "0.9rem",
    zIndex: 100,
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.4)",
  },
  instructionBanner: {
    padding: "12px 24px",
    backgroundColor: "#1e293b",
    borderBottom: "1px solid #334155",
    fontSize: "0.9rem",
    color: "#cbd5e1",
    textAlign: "center",
    fontWeight: 500,
  },
  setupBox: {
    padding: "24px",
    backgroundColor: "#1e293b",
    borderBottom: "1px solid #4f46e5",
  },
  logContainer: { flex: 1, padding: "24px", overflowY: "auto" },
  emptyLog: { textAlign: "center", color: "#64748b", marginTop: "40px" },
  logItem: { marginBottom: "16px", backgroundColor: "#1e293b", padding: "16px", borderRadius: "12px" },
  logHeader: { fontSize: "0.75rem", color: "#94a3b8", marginBottom: "6px" },
  logQuestion: { fontSize: "1rem", fontWeight: 500 },
  logAnswer: { marginTop: "8px", paddingLeft: "12px", borderLeft: "2px solid #10b981", color: "#10b981" },
  controls: { padding: "24px", backgroundColor: "#1e293b", borderTop: "1px solid #334155" },
  controlRow: { display: "flex", gap: "10px", marginBottom: "12px" },
  select: {
    padding: "8px 12px",
    backgroundColor: "#334155",
    border: "1px solid #475569",
    borderRadius: "8px",
    color: "#f1f5f9",
    fontSize: "0.875rem",
  },
  input: {
    padding: "8px 12px",
    backgroundColor: "#334155",
    border: "1px solid #475569",
    borderRadius: "8px",
    color: "#f1f5f9",
    fontSize: "0.9rem",
  },
  button: {
    padding: "8px 20px",
    backgroundColor: "#6366f1",
    color: "white",
    fontWeight: 600,
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  judgeControls: {
    padding: "16px",
    backgroundColor: "#111827",
    borderRadius: "12px",
    border: "1px solid #475569",
  },
  turnIndicator: {
    textAlign: "center",
    fontSize: "0.875rem",
    color: "#64748b",
    marginTop: "8px",
  },
};
