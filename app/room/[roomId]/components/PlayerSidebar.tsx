"use client";

import { RoomState } from "@/lib/game/types";
import styles from "../Room.module.css";

interface PlayerSidebarProps {
  room: RoomState | null;
  myPlayerId: string | null;
  visibleWords: { playerId: string; word: string | null }[];
  iAmJudge: boolean;
  performAction: (action: any) => Promise<void>;
  loadingAction: boolean;
}

export function PlayerSidebar({ 
  room, 
  myPlayerId, 
  visibleWords, 
  iAmJudge, 
  performAction, 
  loadingAction 
}: PlayerSidebarProps) {
  const currentTurnPlayer = room?.players[room.turnIndex];

  return (
    <aside className={styles.sidebar}>
      <h3 className={styles.sidebarHeader}>플레이어 ({room?.players.length || 0})</h3>
      <div className={styles.playerList}>
        {room?.players.map((p) => {
          const v = visibleWords.find(vw => vw.playerId === p.id);
          const active = room?.status === "playing" && p.id === currentTurnPlayer?.id;
          return (
            <div key={p.id} className={styles.playerCard} style={{
              borderColor: active ? "#818cf8" : "#334155",
              backgroundColor: active ? "rgba(129, 140, 248, 0.1)" : "#1e293b",
              boxShadow: active ? "0 0 10px rgba(129, 140, 248, 0.3)" : "none"
            }}>
              <div className={styles.playerName}>
                {active && <span style={{ marginRight: "4px" }}>▶</span>}
                {p.name} {p.id === myPlayerId && "(나)"} {p.isJudge && "⚖️"}
              </div>
              <div className={styles.playerWord}>
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
              {p.penaltyUntil && p.penaltyUntil > Date.now() && (
                <div style={{ fontSize: "0.7rem", color: "#fbbf24", marginTop: "4px" }}>🔇 뮤트 중</div>
              )}
              {!p.isAlive && <div style={{ fontSize: "0.7rem", color: "#ef4444", marginTop: "4px" }}>게임 종료 🏁</div>}
              
              {iAmJudge && !p.isJudge && p.isAlive && room?.status === "playing" && (
                <div className={styles.judgeActions}>
                  <button 
                    onClick={() => performAction({ type: "judge_action", targetPlayerId: p.id, action: "warn" })}
                    disabled={loadingAction}
                    className={styles.miniButton}
                  >
                    ⚠️ 경고
                  </button>
                  <button 
                    onClick={() => performAction({ type: "judge_action", targetPlayerId: p.id, action: "mute_30s" })}
                    disabled={loadingAction}
                    className={styles.miniButton}
                    style={{ backgroundColor: "#94a3b8" }}
                  >
                    🔇 뮤트
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
