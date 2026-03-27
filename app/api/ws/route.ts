/**
 * app/api/ws/route.ts
 *
 * WebSocket endpoint using the WebSocketPair pattern.
 *
 * ⚠️  ENVIRONMENT NOTE:
 *   `WebSocketPair` is a Web API native to Cloudflare Workers and the
 *   Vercel Edge Runtime. It is NOT available in the standard Node.js runtime.
 *
 *   - Vercel deployment → works ONLY with `runtime = "edge"` or on Vercel's
 *     managed infrastructure that polyfills WebSocketPair for Node functions.
 *   - Local `next dev` (Node.js)  → WebSocketPair is undefined at runtime.
 *
 *   If you need local WebSocket support, see the `server.ts` custom-server
 *   approach using the `ws` npm package.
 *
 *   The type declarations below (`WebSocketPair`, `ExtendedResponse`) are
 *   hand-written because they are not included in @types/node or the TS DOM lib.
 */

export const runtime = "edge";

import { NextRequest } from "next/server";
import * as roomManager from "@/lib/game/roomManager";
import type { ClientToServerMessage, ServerToClientMessage } from "@/lib/game/types";

// ─────────────────────────────────────────────
// Manual type declarations for WebSocketPair
// (not in @types/node – runtime provides them)
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

/** The Vercel/CF Response that accepts a `webSocket` field. */
type WsResponse = Response & never; // keeps assignability

// ─────────────────────────────────────────────
// In-process connection registry
// ─────────────────────────────────────────────

const WS_REGISTRY = Symbol.for("app.ws.registry");

interface WsRegistry {
  /** roomId → set of server-side sockets */
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
// Helpers
// ─────────────────────────────────────────────

function sendToSocket(socket: ServerWebSocket, msg: ServerToClientMessage): void {
  try {
    socket.send(JSON.stringify(msg));
  } catch {
    // socket may already be closed
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
        // ignore closed sockets
      }
    }
  }
}

// ─────────────────────────────────────────────
// Per-connection logic
// ─────────────────────────────────────────────

/** Called immediately after upgrade; waits for the first join_room message. */
function handleSocket(socket: ServerWebSocket, roomId: string): void {
  socket.accept();

  const registry = getRegistry();
  let joined = false;
  let playerId = "";

  // Register socket in room
  if (!registry.roomSockets.has(roomId)) {
    registry.roomSockets.set(roomId, new Set());
  }
  registry.roomSockets.get(roomId)!.add(socket);

  // ── message handler ──────────────────────────────────
  socket.addEventListener("message", (evt) => {
    let msg: ClientToServerMessage;

    try {
      msg = JSON.parse(String(evt.data)) as ClientToServerMessage;
    } catch {
      sendError(socket, "Invalid JSON");
      return;
    }

    // First message must be join_room
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

        // Notify other players about the newcomer
        const sockets = registry.roomSockets.get(roomId)!;
        const joinedMsg: ServerToClientMessage = {
          type: "player_joined",
          player: { id: playerId, name: msg.name, isJudge: false, isAlive: true },
        };
        const json = JSON.stringify(joinedMsg);
        for (const sock of sockets) {
          if (sock !== socket) {
            try { sock.send(json); } catch { /* closed */ }
          }
        }
      } catch (err: unknown) {
        sendError(socket, toErrorMessage(err));
      }

      return;
    }

    // Subsequent messages
    try {
      const result = dispatchMessage(roomId, playerId, msg);
      if (result) broadcast(roomId, result.messages);
    } catch (err: unknown) {
      sendError(socket, toErrorMessage(err));
    }
  });

  // ── close handler ─────────────────────────────────────
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
      // room may already be gone
    }
  });

  // ── error handler ─────────────────────────────────────
  socket.addEventListener("error", (evt) => {
    console.error("[ws] socket error", evt);
  });
}

// ─────────────────────────────────────────────
// Message dispatcher
// ─────────────────────────────────────────────

function dispatchMessage(
  roomId: string,
  playerId: string,
  msg: ClientToServerMessage,
): { messages: ServerToClientMessage[] } | null {
  switch (msg.type) {
    case "join_room":
      // Duplicate join — ignore
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
// Route Handler
// ─────────────────────────────────────────────

export function GET(req: NextRequest): Response {
  const roomId = req.nextUrl.searchParams.get("roomId");

  if (!roomId) {
    return new Response("Missing roomId query parameter", { status: 400 });
  }

  // Upgrade check
  const upgradeHeader = req.headers.get("upgrade");
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return new Response(
      "WebSocket endpoint. Connect via ws://.../api/ws?roomId=...",
      { status: 426, headers: { Upgrade: "websocket" } },
    );
  }

  // Create the WebSocket pair
  const pair = new WebSocketPair();
  const client = pair[0]; // returned to the browser
  const server = pair[1]; // stays on the server

  handleSocket(server, roomId);

  // 101 Switching Protocols — runtime injects the pair into the response
  return new Response(null, {
    status: 101,
    // @ts-expect-error — `webSocket` is a Vercel/CF extension, not in standard Response
    webSocket: client,
  }) as WsResponse;
}
