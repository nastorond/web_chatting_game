import { RoomState, Player } from "./types";
import { getRoomFromRedis } from "./store";

export async function getRoom(roomId: string): Promise<RoomState> {
  const room = await getRoomFromRedis(roomId);
  if (!room) throw new Error(`Room not found: ${roomId}`);
  return room;
}

export function getPlayer(room: RoomState, playerId: string): Player {
  const player = room.players.find((pl) => pl.id === playerId);
  if (!player) throw new Error(`Player not found: ${playerId}`);
  return player;
}

export function publicRoom(room: RoomState): RoomState {
  return {
    ...room,
    players: room.players.map(({ secretWord: _w, ...rest }) => rest as Player),
  };
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function nextTurn(room: RoomState): RoomState {
  const players = room.players;
  let newIndex = room.turnIndex;
  let round = room.round;

  for (let i = 0; i < players.length; i++) {
    newIndex = (newIndex + 1) % players.length;
    if (newIndex === 0) round++;

    const p = players[newIndex];
    if (!p.isJudge && p.isAlive) {
      return { ...room, turnIndex: newIndex, round, turnActionUsed: null };
    }
  }

  return { ...room, turnIndex: newIndex, round, turnActionUsed: null };
}
