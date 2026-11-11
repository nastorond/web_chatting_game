/**
 * gameService.ts
 *
 * 게임 진행 로직 (주제 설정, 단어 제출, 질문 / 정답 시도, 차례 진행, 심판 조치, 재시작)
 * 모든 함수는 라우터에서 withRoomLock 안에서 호출되어야 합니다.
 */

import { RoomState, ServerToClientMessage } from "@/lib/game/types";
import { saveRoom, clearChat } from "./store";
import { getRoom, getPlayer, publicRoom } from "./utils";
import { resetToWaiting, startPlayingIfReady, checkLastLoseEnd, nextTurn } from "./rules";
import { addSystemMessage, addPlayerMessage, assertNotMuted } from "./chatService";
import { forbidden, invalidState, badRequest } from "./errors";
import { LIMITS } from "@/lib/game/limits";
import * as v from "./validate";

type ServiceResult = { room: RoomState; messages: ServerToClientMessage[] };

function assertJudge(room: RoomState, playerId: string, what: string) {
  if (!getPlayer(room, playerId).isJudge) throw forbidden(`심판만 ${what} 수 있습니다.`);
}

function assertStatus(room: RoomState, status: RoomState["status"], msg: string) {
  if (room.status !== status) throw invalidState(msg);
}

/** 현재 차례인 플레이어 본인이 호출했는지 확인합니다. */
function assertMyTurn(room: RoomState, playerId: string) {
  assertStatus(room, "playing", "게임이 진행 중이 아닙니다.");
  if (room.players[room.turnIndex]?.id !== playerId) throw invalidState("현재 차례가 아닙니다.");
}

export async function restartGame(roomId: string, judgeId: string): Promise<ServiceResult> {
  const room = await getRoom(roomId);
  assertJudge(room, judgeId, "게임을 재시작할");
  assertStatus(room, "finished", "게임이 종료된 상태에서만 재시작할 수 있습니다.");

  const resetRoom = resetToWaiting(room);
  await saveRoom(roomId, resetRoom);
  await clearChat(roomId);
  await addSystemMessage(roomId, "게임이 재시작되었습니다. 심판이 새 주제를 설정해주세요.");

  return {
    room: resetRoom,
    messages: [{ type: "game_restarted" }, { type: "room_state", room: publicRoom(resetRoom) }],
  };
}

export async function setTopicAndRule(
  roomId: string,
  playerId: string,
  rawTopic: unknown,
  rawEndCondition: unknown
): Promise<ServiceResult> {
  const topic = v.text(rawTopic, "주제", LIMITS.TOPIC_MAX);
  const endCondition = v.endCondition(rawEndCondition);

  const room = await getRoom(roomId);
  assertJudge(room, playerId, "주제를 정할");
  assertStatus(room, "waiting", "대기 중일 때만 게임을 시작할 수 있습니다.");

  const nonJudgeCount = room.players.filter((p) => !p.isJudge).length;
  if (nonJudgeCount < LIMITS.MIN_PLAYERS) {
    throw invalidState(`심판을 제외한 플레이어가 최소 ${LIMITS.MIN_PLAYERS}명 필요합니다. (현재 ${nonJudgeCount}명)`);
  }

  const updated: RoomState = {
    ...resetToWaiting(room),
    topic,
    endCondition,
    status: "word_submission",
  };
  await saveRoom(roomId, updated);

  const modeLabel = endCondition === "firstWin" ? "먼저 맞히면 승리" : "마지막까지 못 맞히면 패배";
  await addSystemMessage(roomId, `게임이 시작되었습니다! 주제: [${topic}] / 모드: ${modeLabel}`);
  await addSystemMessage(roomId, "각 플레이어는 다음 순서 플레이어에게 줄 단어를 입력해주세요.");

  return {
    room: updated,
    messages: [
      { type: "topic_set", topic, endCondition },
      { type: "room_state", room: publicRoom(updated) },
    ],
  };
}

export async function submitWord(
  roomId: string,
  fromPlayerId: string,
  rawForPlayerId: unknown,
  rawWord: unknown
): Promise<ServiceResult> {
  const forPlayerId = v.playerId(rawForPlayerId);
  const word = v.text(rawWord, "단어", LIMITS.WORD_MAX);

  const room = await getRoom(roomId);
  assertStatus(room, "word_submission", "단어 제출 단계가 아닙니다.");
  const fromPlayer = getPlayer(room, fromPlayerId);
  if (fromPlayer.isJudge) throw forbidden("진행자(심판)는 단어를 제출할 수 없습니다.");
  if (fromPlayer.wordSubmitted) throw invalidState("이미 단어를 제출하였습니다.");

  const nonJudge = room.players.filter((p) => !p.isJudge);
  const fromIdx = nonJudge.findIndex((p) => p.id === fromPlayerId);
  const expectedTarget = nonJudge[(fromIdx + 1) % nonJudge.length];
  if (!expectedTarget || expectedTarget.id !== forPlayerId) {
    throw badRequest("단어 배정 규칙 위반 (본인의 다음 플레이어에게만 줄 수 있습니다).");
  }

  let updated: RoomState = {
    ...room,
    players: room.players.map((p) => {
      if (p.id === forPlayerId) return { ...p, secretWord: word };
      if (p.id === fromPlayerId) return { ...p, wordSubmitted: true };
      return p;
    }),
  };

  const messages: ServerToClientMessage[] = [];
  const res = startPlayingIfReady(updated);
  updated = res.room;
  await saveRoom(roomId, updated);

  if (res.started) {
    await addSystemMessage(roomId, "모든 단어 배정이 완료되었습니다. 게임을 시작합니다!");
    await addSystemMessage(roomId, `현재 차례: ${updated.players[updated.turnIndex].name}`);
    messages.push({ type: "words_assigned" });
  }
  messages.push({ type: "room_state", room: publicRoom(updated) });
  return { room: updated, messages };
}

export async function postQuestion(roomId: string, playerId: string, rawText: unknown): Promise<ServiceResult> {
  const text = v.text(rawText, "질문 내용", LIMITS.CHAT_MAX);
  const room = await getRoom(roomId);
  const player = getPlayer(room, playerId);
  assertNotMuted(player, "질문할 수 없습니다.");
  assertMyTurn(room, playerId);
  if (room.turnActionUsed) {
    throw invalidState("이번 턴에 이미 액션을 수행했습니다. (질문 또는 정답 시도는 턴당 1회만 가능)");
  }

  const msg = await addPlayerMessage(roomId, playerId, player.name, "question", text);
  const updatedRoom: RoomState = { ...room, turnActionUsed: { playerId, actionType: "question" } };
  await saveRoom(roomId, updatedRoom);

  return { room: updatedRoom, messages: [{ type: "chat_posted", message: msg }] };
}

export async function postAnswer(roomId: string, playerId: string, rawText: unknown): Promise<ServiceResult> {
  const text = v.text(rawText, "정답", LIMITS.WORD_MAX);
  let room = await getRoom(roomId);
  const player = getPlayer(room, playerId);
  assertNotMuted(player, "정답 시도를 할 수 없습니다.");
  assertMyTurn(room, playerId);
  if (room.turnActionUsed) {
    throw invalidState("이번 턴에 이미 액션을 수행했습니다. (질문 또는 정답 시도는 턴당 1회만 가능)");
  }

  const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const correct = !!player.secretWord && normalize(player.secretWord) === normalize(text);

  await addPlayerMessage(roomId, playerId, player.name, "answer", text);
  await addPlayerMessage(
    roomId,
    playerId,
    player.name,
    "guess",
    `[정답 시도] ${player.name}: ${text} -> ${correct ? "성공! 🎉" : "실패 ❌"}`
  );

  room = { ...room, turnActionUsed: { playerId, actionType: "answer" } };
  const notes: string[] = [];

  if (correct) {
    room = {
      ...room,
      players: room.players.map((p) => (p.id === playerId ? { ...p, isAlive: false } : p)),
    };

    if (room.endCondition === "firstWin") {
      room = { ...room, status: "finished", winnerPlayerId: playerId, turnActionUsed: null };
      notes.push(`🏆 게임 종료! 승자: ${player.name}`);
    } else {
      notes.push(`${player.name}님이 자신의 단어 [${player.secretWord}]를 맞혀 탈출했습니다!`);
      const ended = checkLastLoseEnd(room);
      if (ended) {
        room = ended.room;
        notes.push(ended.note);
      }
    }
  }

  await saveRoom(roomId, room);
  for (const note of notes) await addSystemMessage(roomId, note);

  return {
    room,
    messages: [
      { type: "guess_result", playerId, correct },
      { type: "room_state", room: publicRoom(room) },
    ],
  };
}

async function advanceTurn(roomId: string, room: RoomState, announce: (nextName: string) => string): Promise<ServiceResult> {
  const updated = nextTurn(room);
  await saveRoom(roomId, updated);
  await addSystemMessage(roomId, announce(updated.players[updated.turnIndex].name));
  return { room: updated, messages: [{ type: "room_state", room: publicRoom(updated) }] };
}

export async function endTurn(roomId: string, playerId: string): Promise<ServiceResult> {
  const room = await getRoom(roomId);
  const player = getPlayer(room, playerId);
  assertMyTurn(room, playerId);
  return advanceTurn(roomId, room, (next) => `${player.name}님이 차례를 넘겼습니다. 다음 차례: ${next}`);
}

export async function forceNextTurn(roomId: string, judgeId: string): Promise<ServiceResult> {
  const room = await getRoom(roomId);
  assertJudge(room, judgeId, "차례를 강제로 넘길");
  assertStatus(room, "playing", "게임이 진행 중이 아닙니다.");
  return advanceTurn(roomId, room, (next) => `진행자에 의해 차례가 강제로 넘어갔습니다. 다음 차례: ${next}`);
}

export async function handleJudgeAction(
  roomId: string,
  judgeId: string,
  rawTargetPlayerId: unknown,
  rawAction: unknown
): Promise<ServiceResult> {
  const targetPlayerId = v.playerId(rawTargetPlayerId);
  const action = v.judgeAction(rawAction);

  let room = await getRoom(roomId);
  assertJudge(room, judgeId, "제재를 내릴");
  const target = getPlayer(room, targetPlayerId);
  if (target.isJudge) throw badRequest("심판 본인에게는 조치할 수 없습니다.");

  if (action === "mute_30s") {
    const penaltyUntil = Date.now() + 30_000;
    room = {
      ...room,
      players: room.players.map((p) => (p.id === targetPlayerId ? { ...p, penaltyUntil } : p)),
    };
    await saveRoom(roomId, room);
  }

  await addSystemMessage(
    roomId,
    `[심판 조치] ${target.name}님에게 ${action === "warn" ? "경고" : "30초 침묵"} 조치가 내려졌습니다.`
  );

  return { room, messages: [{ type: "room_state", room: publicRoom(room) }] };
}
