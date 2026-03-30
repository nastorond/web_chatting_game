/**
 * Notepad.tsx
 * 
 * 플레이어 전용 로컬 메모장 컴포넌트입니다.
 * 입력된 데이터는 서버에 전송되지 않으며 컴포넌트 상태로만 관리됩니다.
 * 방이 초기화되거나 게임이 끝나면(room.status 변경 시) 초기화됩니다.
 */

"use client";

import { useState, useEffect } from "react";
import styles from "../Room.module.css";
import { RoomState } from "@/lib/game/types";

interface NotepadProps {
  room: RoomState | null;
}

export function Notepad({ room }: NotepadProps) {
  const [note, setNote] = useState("");

  // 게임 진행 상태가 대기나 특정 상황으로 돌아가면 메모 초기화
  useEffect(() => {
    if (room?.status === "waiting" || room?.status === "finished") {
      setNote("");
    }
  }, [room?.status]);

  return (
    <>
      <div className={styles.notepadHeader}>
        📝 개인 메모장
      </div>
      <textarea
        className={styles.textarea}
        style={{ flex: 1, border: "none", borderRadius: 0, resize: "none" }}
        placeholder="자유롭게 메모를 작성하세요... (나에게만 보입니다)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </>
  );
}
