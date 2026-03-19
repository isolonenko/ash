import { extractPeerIdFromTags, MAX_ROOM_SIZE } from "./signaling-logic.ts";

interface Room {
  sockets: Map<WebSocket, string[]>;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  get roomCount(): number {
    return this.rooms.size;
  }

  join(
    roomId: string,
    ws: WebSocket,
    tags: string[],
  ): Map<WebSocket, string[]> {
    let room = this.rooms.get(roomId);

    if (!room) {
      room = { sockets: new Map() };
      this.rooms.set(roomId, room);
    }

    if (room.sockets.size >= MAX_ROOM_SIZE) {
      // Before rejecting, check for stale socket with same peerId.
      // This happens when a client reconnects before the old socket's
      // onclose has fired (e.g., brief network interruption).
      const joinerPeerId = extractPeerIdFromTags(tags);
      if (joinerPeerId) {
        for (const [existingWs, existingTags] of room.sockets) {
          if (extractPeerIdFromTags(existingTags) === joinerPeerId) {
            try {
              existingWs.close(1000, "Superseded by new connection");
            } catch { /* already closing */ }
            room.sockets.delete(existingWs);
            break;
          }
        }
      }

      // Re-check after eviction
      if (room.sockets.size >= MAX_ROOM_SIZE) {
        throw new Error("Room is full");
      }
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

  createRoom(roomId: string): boolean {
    if (this.rooms.has(roomId)) {
      return false; // Room already exists
    }
    this.rooms.set(roomId, { sockets: new Map() });
    return true;
  }

  getRoomInfo(roomId: string): { exists: boolean; participantCount: number; maxSize: number } {
    const room = this.rooms.get(roomId);
    return {
      exists: !!room,
      participantCount: room?.sockets.size ?? 0,
      maxSize: MAX_ROOM_SIZE,
    };
  }
}
