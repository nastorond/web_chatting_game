/**
 * GameHeader.tsx
 * 
 * 게임 화면 최상단에 방 ID, 현재 대주제, 게임 진행 상태 및
 * 내 역할(심판/플레이어)을 표시하는 헤더 컴포넌트입니다.
 */

"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();

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

  /** 방 나가기 처리 로직 */
  const handleLeaveRoom = async () => {
    // 게임이 진행 중이거나 단어 제출 단계일 때 경고 표시
    if (room?.status === "playing" || room?.status === "word_submission") {
      const confirmed = window.confirm("진행 중인 게임입니다. 정말 나가시겠습니까?");
      if (!confirmed) return;
    }

    await performAction({ type: "leave_room" });
    router.push("/");
  };

  return (
    <header className={styles.header}>
      {/* 왼쪽: 방 ID 및 주제 표시 */}
      <div className={styles.headerTitle}>
        Room ID: {roomIdStr} 
        {room?.topic && <span className={styles.topicTag}>주제: {room.topic}</span>}
      </div>
      
      {/* 오른쪽: 진행 상태, 내 역할 배지 및 나가기 버튼 */}
      <div className={styles.headerStats}>
        <span className={styles.badge}>상태: {getStatusLabel(room?.status)}</span>
        <span className={styles.badge} style={{ backgroundColor: iAmJudge ? "#ef4444" : "#10b981" }}>
          역할: {iAmJudge ? "심판" : "플레이어"}
        </span>
        <button 
          onClick={handleLeaveRoom}
          disabled={loadingAction}
          className={styles.miniButton}
          style={{ padding: "6px 12px", backgroundColor: "#334155", marginLeft: "8px" }}
        >
          🚪 방 나가기
        </button>
      </div>
    </header>
  );
}
