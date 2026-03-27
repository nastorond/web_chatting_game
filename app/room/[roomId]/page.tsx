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
 */
export default function GameRoomPage() {
  const router = useRouter();
  const { roomId } = useParams<{ roomId: string }>();
  // roomId가 string | string[] 일 수 있으니 방어하려면:
  const roomIdStr = Array.isArray(roomId) ? roomId[0] : roomId;

  // ─── 상태 관리 ──────────────────────────────────
  const [room, setRoom] = useState<RoomState | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "open" | "closed" | "error"
  >("connecting");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Input states
  const [askToPlayerId, setAskToPlayerId] = useState("");
  const [askText, setAskText] = useState("");
  const [guessText, setGuessText] = useState("");
  const [judgeActionTarget, setJudgeActionTarget] = useState("");

  const ws = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ─── 웹소켓 이펙트 ────────────────────────
  useEffect(() => {
    const nickname = localStorage.getItem("nickname");
    if (!nickname) {
      router.push("/");
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws?roomId=${roomId}`;

    const socket = new WebSocket(wsUrl);
    ws.current = socket;

    socket.onopen = () => {
      setConnectionStatus("open");
      socket.send(
        JSON.stringify({
          type: "join_room",
          roomId,
          name: nickname,
        } satisfies ClientToServerMessage)
      );
    };

    socket.onmessage = (event) => {
      const data: ServerToClientMessage = JSON.parse(event.data);
      handleServerMessage(data, nickname);
    };

    socket.onclose = () => setConnectionStatus("closed");
    socket.onerror = () => setConnectionStatus("error");

    return () => {
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, router]);

  // Q&A 로그 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [questions]);

  // ─── 메시지 핸들러 ─────────────────────────
  const handleServerMessage = (msg: ServerToClientMessage, myName: string) => {
    switch (msg.type) {
      case "room_state":
        setRoom(msg.room);
        // 닉네임을 사용하여 플레이어 목록에서 나 자신을 찾음
        // 서버에서 join_room 성공 시 직접 playerId를 제공하지 않으므로 이름을 기준으로 찾습니다.
        const me = msg.room.players.find((p) => p.name === myName);
        if (me) setMyPlayerId(me.id);
        break;

      case "question_posted":
        setQuestions((prev) => [...prev, msg.question as Question]);
        break;

      case "answer_posted":
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === msg.questionId ? { ...q, answer: msg.answer } : q
          )
        );
        break;

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
        setRoom((prev) => (prev ? { ...prev, status: "finished" } : null));
        setErrorBanner(`🏆 게임 종료! 승자: ${msg.winnerId || "없음"}`);
        break;

      case "error":
        setErrorBanner(`❌ 에러: ${msg.message}`);
        setTimeout(() => setErrorBanner(null), 5000);
        break;

      default:
        // 다른 메시지들은 room_state 업데이트를 통해 반영됩니다.
        break;
    }
  };

  // ─── 액션 ─────────────────────────────────
  const send = (msg: ClientToServerMessage) => {
    ws.current?.send(JSON.stringify(msg));
  };

  const handleAsk = () => {
    if (!askToPlayerId || !askText) return;
    send({ type: "ask_question", toPlayerId: askToPlayerId, text: askText });
    setAskText("");
  };

  const handleGuess = () => {
    if (!guessText) return;
    send({ type: "guess_word", text: guessText });
    setGuessText("");
  };

  const handleJudge = (action: "warn" | "mute_30s") => {
    if (!judgeActionTarget) return;
    send({
      type: "judge_action",
      targetPlayerId: judgeActionTarget,
      action,
    });
  };

  // ─── 렌더링 헬퍼 ──────────────────────────
  if (connectionStatus === "connecting")
    return <div style={styles.fullscreenCenter}>접속 중...</div>;
  if (connectionStatus === "closed")
    return <div style={styles.fullscreenCenter}>연결이 종료되었습니다.</div>;
  if (connectionStatus === "error")
    return <div style={styles.fullscreenCenter}>연결 오류가 발생했습니다.</div>;

  const currentTurnPlayer = room?.players[room.turnIndex];
  const isMyTurn = currentTurnPlayer?.id === myPlayerId;
  const iAmJudge = room?.players.find((p) => p.id === myPlayerId)?.isJudge;

  return (
    <div style={styles.wrapper}>
      {/* 헤더 */}
      <header style={styles.header}>
        <div style={styles.headerTitle}>
          Room ID: <span style={{ color: "#818cf8" }}>{roomId}</span>
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
