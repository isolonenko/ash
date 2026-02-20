import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import type { WSContext } from "hono/ws";

// ── Types ────────────────────────────────────────────────

interface SignalingMessage {
  type: string;
  roomId: string;
  payload?: unknown;
  senderPublicKey?: string;
}

interface RoomEntry {
  sockets: Map<WSContext, string | undefined>; // ws context -> publicKey
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

  for (const [ws] of room.sockets) {
    try {
      ws.close(1000, "room expired");
    } catch {
      // socket may already be closed
    }
  }

  rooms.delete(roomId);
};

const removeFromRoom = (roomId: string, ws: WSContext): void => {
  const room = rooms.get(roomId);
  if (!room) return;

  const publicKey = room.sockets.get(ws);
  room.sockets.delete(ws);

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
  sender: WSContext,
  message: string,
): void => {
  const room = rooms.get(roomId);
  if (!room) {
    console.log(`[Signal] broadcast: room ${roomId} not found`);
    return;
  }

  let sent = 0;
  for (const [peer] of room.sockets) {
    if (peer !== sender) {
      try {
        peer.send(message);
        sent++;
      } catch (err) {
        console.log(`[Signal] broadcast send error:`, err);
      }
    }
  }
  console.log(`[Signal] broadcast room=${roomId} recipients=${sent} totalPeers=${room.sockets.size}`);
};

// ── Hono WebSocket Routes ────────────────────────────────

export const createSignalingRoutes = (): Hono => {
  const routes = new Hono();

  routes.get(
    "/:roomId",
    upgradeWebSocket((c) => {
      const roomId = c.req.param("roomId");
      const publicKey = c.req.query("publicKey") ?? undefined;
      const room = getOrCreateRoom(roomId);

      // If room is full, return empty handlers (connection will be rejected)
      if (room.sockets.size >= MAX_ROOM_SIZE) {
        return {
          onOpen: (_event, ws) => {
            ws.close(1013, "room is full");
          },
        };
      }

      return {
        onOpen: (_event, ws) => {
          room.sockets.set(ws, publicKey);
          console.log(`[Signal] peer joined room=${roomId} key=${publicKey?.substring(0, 8)} roomSize=${room.sockets.size}`);

          // Notify existing peers that someone joined
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
        },

        onMessage: (event, ws) => {
          try {
            const data =
              typeof event.data === "string"
                ? event.data
                : new TextDecoder().decode(event.data as ArrayBuffer);
            const msg: SignalingMessage = JSON.parse(data);

            console.log(`[Signal] onMessage room=${roomId} type=${msg.type} from=${msg.senderPublicKey?.substring(0, 8)}`);

            const allowed = ["sdp-offer", "sdp-answer", "ice-candidate"];
            if (!allowed.includes(msg.type)) {
              console.log(`[Signal] dropping disallowed type=${msg.type}`);
              return;
            }

            broadcast(roomId, ws, data);
          } catch (err) {
            console.log(`[Signal] onMessage parse error:`, err);
          }
        },

        onClose: (_event, ws) => {
          removeFromRoom(roomId, ws);
        },

        onError: (_event, ws) => {
          removeFromRoom(roomId, ws);
        },
      };
    }),
  );

  return routes;
};
