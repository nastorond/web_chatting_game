"use client";

import { RoomState } from "@/lib/game/types";
import styles from "../Room.module.css";

interface GameHeaderProps {
  room: RoomState | null;
  roomIdStr: string;
  iAmJudge: boolean;
  loadingAction: boolean;
  performAction: (action: any) => Promise<void>;
}

export function GameHeader({ room, roomIdStr, iAmJudge, loadingAction, performAction }: GameHeaderProps) {
  const getStatusLabel = (status: string | undefined) => {
    switch (status) {
      case "waiting": return "대기 중";
      case "word_submission": return "단어 제출 단계";
      case "playing": return "진행 중";
      case "finished": return "게임 종료";
      default: return "-";
    }
  };

  const currentTurnPlayer = room?.players[room.turnIndex];

  return (
    <header className={styles.header}>
      <div className={styles.headerTitle}>
        Room ID: {roomIdStr} 
        {room?.topic && <span className={styles.topicTag}>주제: {room.topic}</span>}
      </div>
      <div className={styles.headerStats}>
        <span className={styles.badge}>상태: {getStatusLabel(room?.status)}</span>
        <span className={styles.badge} style={{ backgroundColor: iAmJudge ? "#ef4444" : "#10b981" }}>
          역할: {iAmJudge ? "심판" : "플레이어"}
        </span>
      </div>
    </header>
  );
}
