import { RoomState, Player, ServerToClientMessage } from "./types";
import { getRoomFromRedis, saveRoom, deleteRoom, saveChatMessages } from "./store";
import { getRoom, publicRoom } from "./utils";
import { addSystemMessage } from "./chatService";

export async function createRoom(roomId: string, hostId: string): Promise<RoomState> {
  const room: RoomState = {
    id: roomId,
    hostId,
    players: [],
    topic: null,
    endCondition: null,
    round: 0,
    turnIndex: 0,
    status: "waiting",
    createdAt: Date.now(),
  };
  await saveRoom(roomId, room);
  await saveChatMessages(roomId, []);
  return room;
}

export async function joinRoom(
  roomId: string,
  playerId: string,
  name: string
): Promise<{ room: RoomState; messages: ServerToClientMessage[] }> {
  let room = (await getRoomFromRedis(roomId)) ?? (await createRoom(roomId, playerId));

  if (!room.players.find((p) => p.id === playerId)) {
    const isFirstPlayer = room.players.length === 0;

    const newPlayer: Player = {
      id: playerId,
      name,
      isJudge: isFirstPlayer,
      isAlive: true,
      secretWord: null,
      wordSubmitted: false,
    };

    room = { ...room, players: [...room.players, newPlayer] };
    await saveRoom(roomId, room);
    await addSystemMessage(roomId, `${name}님이 입장하셨습니다.`);
  }

  const messages: ServerToClientMessage[] = [
    { type: "room_state", room: publicRoom(room) },
  ];

  return { room, messages };
}

export async function leaveRoom(
  roomId: string,
  playerId: string
): Promise<{ room: RoomState | null; messages: ServerToClientMessage[] }> {
  const room = await getRoomFromRedis(roomId);
  if (!room) return { room: null, messages: [] };

  const leavingPlayer = room.players.find(p => p.id === playerId);
  const updated: RoomState = {
    ...room,
    players: room.players.filter((p) => p.id !== playerId),
    hostId: room.hostId === playerId
      ? (room.players.find((p) => p.id !== playerId)?.id ?? room.hostId)
      : room.hostId,
  };

  if (updated.players.length === 0) {
    await deleteRoom(roomId);
    return { room: null, messages: [] };
  }

  await saveRoom(roomId, updated);
  if (leavingPlayer) {
    await addSystemMessage(roomId, `${leavingPlayer.name}님이 퇴장하셨습니다.`);
  }

  const messages: ServerToClientMessage[] = [
    { type: "player_left", playerId },
    { type: "room_state", room: publicRoom(updated) },
  ];
  return { room: updated, messages };
}

export async function getPublicRoom(roomId: string): Promise<RoomState> {
  return publicRoom(await getRoom(roomId));
}

export async function getVisibleWords(
  roomId: string,
  viewerPlayerId: string
): Promise<{ playerId: string; word: string | null }[]> {
  const room = await getRoom(roomId);
  return room.players.map(p => ({
    playerId: p.id,
    word: p.id === viewerPlayerId ? null : p.secretWord,
  }));
}
