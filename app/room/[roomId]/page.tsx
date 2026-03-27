"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  RoomState,
  ServerToClientMessage,
  ClientToServerMessage,
  Question,
  Player,
} from "@/lib/game/types";

/**
 * 게임 방 페이지 (app/room/[roomId]/page.tsx)
 * WebSocket 대신 HTTP 폴링 방식으로 동작하도록 수정되었습니다.
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

  // 입력 상태
  const [askToPlayerId, setAskToPlayerId] = useState("");
  const [askText, setAskText] = useState("");
  const [guessText, setGuessText] = useState("");
  const [judgeActionTarget, setJudgeActionTarget] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 초기 진입 및 폴링 로컬 로직 ────────────────────────
  useEffect(() => {
    const nickname = localStorage.getItem("nickname");
    if (!nickname) {
      router.push("/");
      return;
    }

    // playerId 관리
    const playerIdKey = `playerId:${roomIdStr}`;
    let playerId = localStorage.getItem(playerIdKey);
    if (!playerId) {
      playerId = `p-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(playerIdKey, playerId);
    }
    setMyPlayerId(playerId);

    // 초기 입장(Join) 처리
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

        // 폴링 시작 (1초 간격)
        startPolling(playerId);
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

  const startPolling = (playerId: string) => {
    if (pollingTimer.current) clearInterval(pollingTimer.current);
    pollingTimer.current = setInterval(() => fetchState(), 1000);
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
      // 폴링 에러 시 배너를 띄울 수도 있지만 너무 잦으면 방해되므로 콘솔에만 기록
    }
  };

  // Q&A 로그 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [questions]);

  // ─── 액션 메시지 처리 ─────────────────────────
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
          setErrorBanner(`🏆 게임 종료! 승자: ${msg.winnerId || "없음"}`);
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

      // 즉시 상태 반영
      if (data.room) setRoom(data.room);
      if (data.questions) setQuestions(data.questions);
      if (data.messages) handleServerMessages(data.messages);
    } catch (err: any) {
      setErrorBanner(`작업 실패: ${err.message}`);
      setTimeout(() => setErrorBanner(null), 3000);
    }
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

  // ─── 렌더링 헬퍼 ──────────────────────────
  if (loading) return <div style={styles.fullscreenCenter}>접속 중...</div>;

  const currentTurnPlayer = room?.players[room.turnIndex];
  const isMyTurn = currentTurnPlayer?.id === myPlayerId;
  const iAmJudge = room?.players.find((p) => p.id === myPlayerId)?.isJudge;

  return (
    <div style={styles.wrapper}>
      {/* 헤더 */}
      <header style={styles.header}>
        <div style={styles.headerTitle}>
          Room ID: <span style={{ color: "#818cf8" }}>{roomIdStr}</span>
        </div>
        <div style={styles.headerStats}>
          {room?.topic && (
            <span style={styles.badge}>주제: {room.topic}</span>
          )}
          <span style={styles.badge}>Round {room?.round}</span>
          <span style={{ ...styles.badge, backgroundColor: "#4f46e5" }}>
            현재 턴: {currentTurnPlayer?.name || "대기 중"}
          </span>
        </div>
      </header>

      {/* 메인 바디 */}
      <div style={styles.body}>
        {/* 사이드바: 플레이어 */}
        <aside style={styles.sidebar}>
          <h3 style={styles.sidebarHeader}>플레이어 ({room?.players.length})</h3>
          <div style={styles.playerList}>
            {room?.players.map((p) => (
              <div
                key={p.id}
                style={{
                  ...styles.playerCard,
                  borderColor: p.id === currentTurnPlayer?.id ? "#818cf8" : "#334155",
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

        {/* 콘텐츠 섹션 */}
        <section style={styles.content}>
          {errorBanner && <div style={styles.errorBanner}>{errorBanner}</div>}

          {/* Q&A 로그 */}
          <div style={styles.logContainer} ref={scrollRef}>
            {questions.length === 0 && (
              <div style={styles.emptyLog}>질문을 시작해보세요!</div>
            )}
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
          </div>

          {/* 사용자 컨트롤 */}
          <div style={styles.controls}>
            {room?.status === "playing" && !iAmJudge && (
              <>
                <div style={styles.controlRow}>
                  <select
                    style={styles.select}
                    value={askToPlayerId}
                    onChange={(e) => setAskToPlayerId(e.target.value)}
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
                    placeholder="상대에게 질문하기..."
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
                    placeholder="내 단어 정답 추측..."
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

            {/* 심판 컨트롤 */}
            {iAmJudge && room?.status === "playing" && (
              <div style={styles.judgeControls}>
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>⚖️ 심판 도구</div>
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

            {!isMyTurn && room?.status === "playing" && !iAmJudge && (
              <div style={styles.turnIndicator}>다른 플레이어의 턴을 기다리는 중...</div>
            )}

            {room?.status === "waiting" && (
              <div style={styles.turnIndicator}>다른 플레이어들이 참여하기를 기다리는 중...</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────

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
  headerStats: { display: "flex", gap: "10px" },
  badge: {
    padding: "4px 10px",
    backgroundColor: "#334155",
    borderRadius: "100px",
    fontSize: "0.75rem",
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
  },
  playerName: { fontWeight: 600, fontSize: "0.9rem" },
  playerStatus: { fontSize: "0.7rem", color: "#94a3b8", marginTop: "4px" },
  content: { flex: 1, display: "flex", flexDirection: "column", position: "relative" },
  errorBanner: {
    position: "absolute",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "8px 16px",
    backgroundColor: "#1e293b",
    border: "1px solid #4f46e5",
    borderRadius: "8px",
    fontSize: "0.875rem",
    zIndex: 10,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  logContainer: { flex: 1, padding: "24px", overflowY: "auto" },
  emptyLog: { textAlign: "center", color: "#64748b", marginTop: "40px" },
  logItem: { marginBottom: "20px", backgroundColor: "#1e293b", padding: "16px", borderRadius: "12px" },
  logHeader: { fontSize: "0.75rem", color: "#94a3b8", marginBottom: "6px" },
  logQuestion: { fontSize: "1rem", fontWeight: 500 },
  logAnswer: { marginTop: "8px", paddingLeft: "12px", borderLeft: "2px solid #059669", color: "#10b981" },
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
    padding: "8px 16px",
    backgroundColor: "#6366f1",
    color: "white",
    fontWeight: 600,
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
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
