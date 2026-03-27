"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Utility to generate a unique Room ID
function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 9).toUpperCase();
}

/**
 * Lobby Page (app/page.tsx)
 * Used to enter a nickname and either create or join a room.
 */
export default function LobbyPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");

  // Load nickname from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("nickname");
    if (saved) {
      setNickname(saved);
    }
  }, []);

  const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNickname(e.target.value);
  };

  const validateNickname = (): boolean => {
    if (!nickname.trim()) {
      alert("닉네임을 입력해주세요!");
      return false;
    }
    localStorage.setItem("nickname", nickname.trim());
    return true;
  };

  const createRandomRoom = () => {
    if (!validateNickname()) return;
    const roomId = generateRoomId();
    router.push(`/room/${roomId}`);
  };

  const joinExistingRoom = () => {
    if (!validateNickname()) return;
    if (!roomIdInput.trim()) {
      alert("방 ID를 입력해주세요!");
      return;
    }
    router.push(`/room/${roomIdInput.trim().toUpperCase()}`);
  };

  return (
    <div style={styles.container}>
      <main style={styles.main}>
        <div style={styles.card}>
          <h1 style={styles.title}>🎭 Party Game</h1>
          <p style={styles.subtitle}>심판과 함께하는 단어 맞추기 게임</p>

          <div style={styles.inputGroup}>
            <label style={styles.label}>내 닉네임</label>
            <input
              style={styles.input}
              type="text"
              placeholder="멋진 이름을 지어주세요"
              value={nickname}
              onChange={handleNicknameChange}
            />
          </div>

          <hr style={styles.divider} />

          <div style={styles.actionSection}>
            <h2 style={styles.sectionTitle}>새로운 게임</h2>
            <button style={styles.buttonPrimary} onClick={createRandomRoom}>
              방 만들기
            </button>
          </div>

          <div style={styles.actionSection}>
            <h2 style={styles.sectionTitle}>기존 게임 참여</h2>
            <div style={styles.inlineGroup}>
              <input
                style={{ ...styles.input, flex: 1 }}
                type="text"
                placeholder="방 ID (예: X4Y2Z1)"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
              />
              <button style={styles.buttonSecondary} onClick={joinExistingRoom}>
                참가하기
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
// Basic Styling
// ─────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Inter, sans-serif",
  },
  main: {
    width: "100%",
    maxWidth: "400px",
    padding: "20px",
  },
  card: {
    backgroundColor: "#1e293b",
    padding: "32px",
    borderRadius: "16px",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
    textAlign: "center",
  },
  title: {
    fontSize: "2rem",
    fontWeight: 800,
    marginBottom: "8px",
    background: "linear-gradient(to right, #6366f1, #a855f7)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: "0.875rem",
    marginBottom: "32px",
  },
  inputGroup: {
    textAlign: "left",
    marginBottom: "20px",
  },
  label: {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#64748b",
    marginBottom: "8px",
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    backgroundColor: "#334155",
    border: "1px solid #475569",
    borderRadius: "8px",
    color: "#f1f5f9",
    outline: "none",
    fontSize: "1rem",
    transition: "border-color 0.2s",
  },
  divider: {
    border: 0,
    borderTop: "1px solid #334155",
    margin: "24px 0",
  },
  actionSection: {
    textAlign: "left",
    marginBottom: "24px",
  },
  sectionTitle: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#94a3b8",
    marginBottom: "12px",
  },
  buttonPrimary: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#6366f1",
    color: "white",
    fontWeight: 600,
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  buttonSecondary: {
    padding: "12px 20px",
    backgroundColor: "#334155",
    color: "white",
    fontWeight: 600,
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  inlineGroup: {
    display: "flex",
    gap: "8px",
  },
};
