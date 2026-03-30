/**
 * PlayerSidebar.tsx
 * 
 * 게임에 참여 중인 모든 플레이어의 목록과 상태(닉네임, 생사, 비밀 단어, 제재 등)를
 * 화면 좌측에 표시하는 사이드바 컴포넌트입니다.
 * 심판(진행자)의 경우 각 플레이어에 대한 제재 기능을 포함합니다.
 */

"use client";

import { RoomState } from "@/lib/game/types";
import styles from "../Room.module.css";

interface PlayerSidebarProps {
  room: RoomState | null;
  myPlayerId: string | null;
  visibleWords: { playerId: string; word: string | null }[]; // 내가 볼 수 있는 단어 목록
  iAmJudge: boolean;          // 내가 심판인지 여부
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
              // 현재 차례인 플레이어는 하이라이트 처리
              borderColor: active ? "#818cf8" : "#334155",
              backgroundColor: active ? "rgba(129, 140, 248, 0.1)" : "#1e293b",
              boxShadow: active ? "0 0 10px rgba(129, 140, 248, 0.3)" : "none"
            }}>
              <div className={styles.playerName}>
                {active && <span style={{ marginRight: "4px" }}>▶</span>}
                {p.name} {p.id === myPlayerId && "(나)"} {p.isJudge && "⚖️"}
              </div>
              
              {/* 비밀 단어 표시 (심판 혹은 다른 플레이어의 단어만 보임) */}
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

              {/* 플레이어 상태 배지 (단어 제출 완료, 뮤트, 탈락 등) */}
              {p.wordSubmitted && <div style={{ fontSize: "0.7rem", color: "#10b981", marginTop: "4px" }}>단어 제출됨 ✓</div>}
              {p.penaltyUntil && p.penaltyUntil > Date.now() && (
                <div style={{ fontSize: "0.7rem", color: "#fbbf24", marginTop: "4px" }}>🔇 뮤트 중</div>
              )}
              {!p.isAlive && <div style={{ fontSize: "0.7rem", color: "#ef4444", marginTop: "4px" }}>정답 맞춤! 🏁</div>}
              
              {/* 심판 전용 제재 기능 (플레이 중일 때만 가능) */}
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
