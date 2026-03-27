/**
 * app/api/ws/route.ts
 *
 * WebSocketPair 패턴을 사용하는 웹소켓 엔드포인트입니다.
 *
 * ⚠️ 환경 참고 사항:
 *   `WebSocketPair`는 Cloudflare Workers 및 Vercel Edge Runtime의 네이티브 Web API입니다.
 *   표준 Node.js 런타임에서는 사용할 수 없습니다.
 *
 *   - Vercel 배포 시 → `runtime = "edge"` 설정이나 Node 함수용 WebSocketPair 폴리필이 포함된 인프라에서만 작동합니다.
 *   - 로컬 `next dev` (Node.js) → 런타임 시 WebSocketPair가 정의되지 않습니다.
 *
 *   로컬 웹소켓 지원이 필요한 경우 `ws` 패키지를 사용하는 커스텀 서버 방식을 참고하세요.
 *
 *   아래의 타입 선언(`WebSocketPair`, `ExtendedResponse`)은 @types/node나 TS DOM 라이브러리에 포함되어 있지 않아 직접 작성되었습니다.
 */

export const runtime = "edge";

import { NextRequest } from "next/server";
import * as roomManager from "@/lib/game/roomManager";
import type { ClientToServerMessage, ServerToClientMessage } from "@/lib/game/types";

// ─────────────────────────────────────────────
// WebSocketPair를 위한 수동 타입 선언
// (@types/node에 포함되어 있지 않으며 런타임에서 제공됨)
// ─────────────────────────────────────────────

interface ServerWebSocket {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(event: "message", handler: (evt: { data: unknown }) => void): void;
  addEventListener(event: "close", handler: (evt: { code: number; reason: string }) => void): void;
  addEventListener(event: "error", handler: (evt: unknown) => void): void;
}

declare const WebSocketPair: new () => { 0: ServerWebSocket; 1: ServerWebSocket };

/** webSocket 필드를 허용하는 Vercel/CF Response 타입 */
type WsResponse = Response & never; // 할당 가능성 유지

// ─────────────────────────────────────────────
// 프로세스 내 연결 레지스트리
// ─────────────────────────────────────────────

const WS_REGISTRY = Symbol.for("app.ws.registry");

interface WsRegistry {
  /** roomId → 서버 측 소켓 세트 */
  roomSockets: Map<string, Set<ServerWebSocket>>;
  /** socket → { roomId, playerId } */
  socketMeta: Map<ServerWebSocket, { roomId: string; playerId: string }>;
}

function getRegistry(): WsRegistry {
  const g = globalThis as Record<symbol, WsRegistry | undefined>;
  if (!g[WS_REGISTRY]) {
    g[WS_REGISTRY] = {
      roomSockets: new Map(),
      socketMeta: new Map(),
    };
  }
  return g[WS_REGISTRY]!;
}

// ─────────────────────────────────────────────
// 헬퍼 함수
// ─────────────────────────────────────────────

function sendToSocket(socket: ServerWebSocket, msg: ServerToClientMessage): void {
  try {
    socket.send(JSON.stringify(msg));
  } catch {
    // 소켓이 이미 닫혔을 수 있음
  }
}

function sendError(socket: ServerWebSocket, message: string): void {
  sendToSocket(socket, { type: "error", message });
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function broadcast(roomId: string, messages: ServerToClientMessage[]): void {
  if (messages.length === 0) return;
  const { roomSockets } = getRegistry();
  const sockets = roomSockets.get(roomId);
  if (!sockets) return;
  const serialised = messages.map((m) => JSON.stringify(m));
  for (const sock of sockets) {
    for (const json of serialised) {
      try {
        sock.send(json);
      } catch {
        // 이미 닫힌 소켓은 무시
      }
    }
  }
}

// ─────────────────────────────────────────────
// 연결별 로직
// ─────────────────────────────────────────────

/** 소켓 업그레이드 직후 호출되며, 첫 번째 join_room 메시지를 기다립니다. */
function handleSocket(socket: ServerWebSocket, roomId: string): void {
  socket.accept();

  const registry = getRegistry();
  let joined = false;
  let playerId = "";

  // 해당 방에 소켓 등록
  if (!registry.roomSockets.has(roomId)) {
    registry.roomSockets.set(roomId, new Set());
  }
  registry.roomSockets.get(roomId)!.add(socket);

  // ── 메시지 핸들러 ──────────────────────────────────
  socket.addEventListener("message", (evt) => {
    let msg: ClientToServerMessage;

    try {
      msg = JSON.parse(String(evt.data)) as ClientToServerMessage;
    } catch {
      sendError(socket, "Invalid JSON");
      return;
    }

    // 첫 번째 메시지는 반드시 join_room이어야 함
    if (!joined) {
      if (msg.type !== "join_room") {
        sendError(socket, "Send join_room first");
        return;
      }

      playerId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      joined = true;

      registry.socketMeta.set(socket, { roomId, playerId });

      try {
        const { messages } = roomManager.joinRoom(roomId, playerId, msg.name);
        broadcast(roomId, messages);

        // 새로운 플레이어 입장을 다른 사람들에게 알림
        const sockets = registry.roomSockets.get(roomId)!;
        const joinedMsg: ServerToClientMessage = {
          type: "player_joined",
          player: { id: playerId, name: msg.name, isJudge: false, isAlive: true },
        };
        const json = JSON.stringify(joinedMsg);
        for (const sock of sockets) {
          if (sock !== socket) {
            try {
              sock.send(json);
            } catch {
              /* 닫힘 */
            }
          }
        }
      } catch (err: unknown) {
        sendError(socket, toErrorMessage(err));
      }

      return;
    }

    // 이후의 메시지 처리
    try {
      const result = dispatchMessage(roomId, playerId, msg);
      if (result) broadcast(roomId, result.messages);
    } catch (err: unknown) {
      sendError(socket, toErrorMessage(err));
    }
  });

  // ── 종료 핸들러 ─────────────────────────────────────
  socket.addEventListener("close", () => {
    const meta = registry.socketMeta.get(socket);
    registry.socketMeta.delete(socket);

    const sockets = registry.roomSockets.get(roomId);
    sockets?.delete(socket);
    if (sockets?.size === 0) registry.roomSockets.delete(roomId);

    if (!meta) return;
    try {
      const { messages } = roomManager.leaveRoom(meta.roomId, meta.playerId);
      broadcast(meta.roomId, messages);
    } catch {
      // 방이 이미 사라졌을 수 있음
    }
  });

  // ── 에러 핸들러 ─────────────────────────────────────
  socket.addEventListener("error", (evt) => {
    console.error("[ws] socket error", evt);
  });
}

// ─────────────────────────────────────────────
// 메시지 디스패처
// ─────────────────────────────────────────────

function dispatchMessage(
  roomId: string,
  playerId: string,
  msg: ClientToServerMessage,
): { messages: ServerToClientMessage[] } | null {
  switch (msg.type) {
    case "join_room":
      // 중복 입장 — 무시
      return null;

    case "set_topic_and_rule":
      return roomManager.setTopicAndRule(roomId, msg.topic, msg.endCondition);

    case "submit_word":
      return roomManager.submitWord(roomId, playerId, msg.forPlayerId, msg.word);

    case "ask_question":
      return roomManager.handleAskQuestion(roomId, playerId, msg.toPlayerId, msg.text);

    case "answer_question":
      return roomManager.handleAnswerQuestion(roomId, playerId, msg.questionId, msg.text);

    case "guess_word":
      return roomManager.handleGuessWord(roomId, playerId, msg.text);

    case "judge_action":
      return roomManager.handleJudgeAction(roomId, playerId, msg.targetPlayerId, msg.action);

    default: {
      const _exhaustive: never = msg;
      void _exhaustive;
      throw new Error("Unknown message type");
    }
  }
}

// ─────────────────────────────────────────────
// 라우트 핸들러
// ─────────────────────────────────────────────

export function GET(req: NextRequest): Response {
  const roomId = req.nextUrl.searchParams.get("roomId");

  if (!roomId) {
    return new Response("Missing roomId query parameter", { status: 400 });
  }

  // 업그레이드 여부 확인
  const upgradeHeader = req.headers.get("upgrade");
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return new Response(
      "WebSocket endpoint. Connect via ws://.../api/ws?roomId=...",
      { status: 426, headers: { Upgrade: "websocket" } },
    );
  }

  // WebSocket Pair 생성
  const pair = new WebSocketPair();
  const client = pair[0]; // 브라우저에 반환됨
  const server = pair[1]; // 서버에 남아 소통을 담당함

  handleSocket(server, roomId);

  // 101 Switching Protocols — 런타임이 응답에 소켓 쌍을 주입함
  return new Response(null, {
    status: 101,
    // @ts-expect-error — `webSocket`은 Vercel/CF 전용 확장이며 표준 Response에는 없음
    webSocket: client,
  }) as WsResponse;
}
