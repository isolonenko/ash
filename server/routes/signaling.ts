import { Hono } from "hono";

// ── Types ────────────────────────────────────────────────

interface SignalingMessage {
  type: string;
  roomId: string;
  payload?: unknown;
  senderPublicKey?: string;
}

interface RoomEntry {
  sockets: Map<WebSocket, string | undefined>; // socket -> publicKey
  createdAt: number;
  timeout: ReturnType<typeof setTimeout>;
}

// ── Room Management ──────────────────────────────────────

const ROOM_TTL_MS = 5 * 60 * 1000; // 5 minutes

const rooms = new Map<string, RoomEntry>();

const MAX_ROOM_SIZE = 2;

const getOrCreateRoom = (roomId: string): RoomEntry => {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const entry: RoomEntry = {
    sockets: new Map(),
    createdAt: Date.now(),
    timeout: setTimeout(() => destroyRoom(roomId), ROOM_TTL_MS),
  };

  rooms.set(roomId, entry);
  return entry;
};

const destroyRoom = (roomId: string): void => {
  const room = rooms.get(roomId);
  if (!room) return;

  clearTimeout(room.timeout);

  for (const [socket] of room.sockets) {
    try {
      socket.close(1000, "room expired");
    } catch {
      // socket may already be closed
    }
  }

  rooms.delete(roomId);
};

const removeFromRoom = (roomId: string, socket: WebSocket): void => {
  const room = rooms.get(roomId);
  if (!room) return;

  const publicKey = room.sockets.get(socket);
  room.sockets.delete(socket);

  // Notify remaining peers
  const leaveMsg = JSON.stringify({
    type: "peer-left",
    roomId,
    senderPublicKey: publicKey,
  });
  for (const [peer] of room.sockets) {
    try {
      peer.send(leaveMsg);
    } catch {
      // peer may be disconnected
    }
  }

  // Destroy empty rooms
  if (room.sockets.size === 0) {
    destroyRoom(roomId);
  }
};

const broadcast = (
  roomId: string,
  sender: WebSocket,
  message: string,
): void => {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const [peer] of room.sockets) {
    if (peer !== sender) {
      try {
        peer.send(message);
      } catch {
        // peer may be disconnected
      }
    }
  }
};

// ── Deno WebSocket Upgrade ───────────────────────────────

export const createSignalingRoutes = (): Hono => {
  const routes = new Hono();

  routes.get("/:roomId", (c) => {
    const roomId = c.req.param("roomId");
    const room = getOrCreateRoom(roomId);

    if (room.sockets.size >= MAX_ROOM_SIZE) {
      return c.json({ error: "room is full" }, 403);
    }

    // Extract public key from query param for join announcements
    const publicKey = c.req.query("publicKey") ?? undefined;

    const { response, socket } = Deno.upgradeWebSocket(c.req.raw);

    socket.onopen = () => {
      const ws = socket as unknown as WebSocket;
      room.sockets.set(ws, publicKey);

      // Notify existing peers that someone joined, include their public key
      const joinMsg = JSON.stringify({
        type: "peer-joined",
        roomId,
        senderPublicKey: publicKey,
      });
      broadcast(roomId, ws, joinMsg);

      // Notify the joiner about existing peers
      for (const [peer, peerKey] of room.sockets) {
        if (peer !== ws) {
          try {
            ws.send(
              JSON.stringify({
                type: "peer-joined",
                roomId,
                senderPublicKey: peerKey,
              }),
            );
          } catch {
            // ignore
          }
        }
      }
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        const msg: SignalingMessage = JSON.parse(event.data as string);

        const allowed = ["sdp-offer", "sdp-answer", "ice-candidate"];
        if (!allowed.includes(msg.type)) return;

        broadcast(
          roomId,
          socket as unknown as WebSocket,
          event.data as string,
        );
      } catch {
        // Ignore malformed messages
      }
    };

    socket.onclose = () => {
      removeFromRoom(roomId, socket as unknown as WebSocket);
    };

    socket.onerror = () => {
      removeFromRoom(roomId, socket as unknown as WebSocket);
    };

    return response;
  });

  return routes;
};
