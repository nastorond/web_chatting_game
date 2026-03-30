/**
 * GameHeader.tsx
 * 
 * 게임 화면 최상단에 방 ID, 현재 대주제, 게임 진행 상태 및
 * 내 역할(심판/플레이어)을 표시하는 헤더 컴포넌트입니다.
 */

"use client";

import { RoomState } from "@/lib/game/types";
import styles from "../Room.module.css";

interface GameHeaderProps {
  room: RoomState | null;
  roomIdStr: string;
  iAmJudge: boolean;      // 접속자가 심판인지 여부
  loadingAction: boolean;
  performAction: (action: any) => Promise<void>;
}

export function GameHeader({ room, roomIdStr, iAmJudge, loadingAction, performAction }: GameHeaderProps) {
  /** 게임 상태(status)를 한글 라벨로 변환합니다. */
  const getStatusLabel = (status: string | undefined) => {
    switch (status) {
      case "waiting": return "대기 중";
      case "word_submission": return "단어 제출 단계";
      case "playing": return "진행 중";
      case "finished": return "게임 종료";
      default: return "-";
    }
  };

  return (
    <header className={styles.header}>
      {/* 왼쪽: 방 ID 및 주제 표시 */}
      <div className={styles.headerTitle}>
        Room ID: {roomIdStr} 
        {room?.topic && <span className={styles.topicTag}>주제: {room.topic}</span>}
      </div>
      
      {/* 오른쪽: 진행 상태 및 내 역할 배지 */}
      <div className={styles.headerStats}>
        <span className={styles.badge}>상태: {getStatusLabel(room?.status)}</span>
        <span className={styles.badge} style={{ backgroundColor: iAmJudge ? "#ef4444" : "#10b981" }}>
          역할: {iAmJudge ? "심판" : "플레이어"}
        </span>
      </div>
    </header>
  );
}
