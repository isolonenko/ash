import { MAX_ROOM_SIZE } from "./signaling-logic.ts";

interface Room {
  sockets: Map<WebSocket, string[]>;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  get roomCount(): number {
    return this.rooms.size;
  }

  join(roomId: string, ws: WebSocket, tags: string[]): Map<WebSocket, string[]> {
    let room = this.rooms.get(roomId);

    if (!room) {
      room = { sockets: new Map() };
      this.rooms.set(roomId, room);
    }

    if (room.sockets.size >= MAX_ROOM_SIZE) {
      throw new Error("Room is full");
    }

    room.sockets.set(ws, tags);
    return room.sockets;
  }

  leave(roomId: string, ws: WebSocket): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.sockets.delete(ws);

    if (room.sockets.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  getSockets(roomId: string): Map<WebSocket, string[]> {
    return this.rooms.get(roomId)?.sockets ?? new Map();
  }

  getTags(ws: WebSocket): string[] {
    for (const room of this.rooms.values()) {
      const tags = room.sockets.get(ws);
      if (tags) return tags;
    }
    return [];
  }
}
