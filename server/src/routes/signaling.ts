import { Hono } from "hono";
import { RoomManager } from "../lib/room-manager.ts";
import {
  broadcastToOthers,
  buildPeerJoinedMessage,
  buildPeerLeftMessage,
  buildSocketTags,
  extractDisplayNameFromTags,
  extractPeerIdFromTags,
  extractRoomIdFromTags,
  isAllowedSignalType,
  parseSignalingMessage,
} from "../lib/signaling-logic.ts";

export const createSignalingRoutes = (roomManager: RoomManager): Hono => {
  const routes = new Hono();

  routes.get("/:roomId", (c) => {
    // Verify this is a WebSocket upgrade request
    const upgradeHeader = c.req.header("upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return c.text("WebSocket upgrade required", 426);
    }

    const roomId = c.req.param("roomId");
    const peerId = c.req.query("peerId") ?? undefined;
    const displayName = c.req.query("displayName") ?? undefined;

    // Use Deno's native WebSocket upgrade
    const { socket, response } = Deno.upgradeWebSocket(c.req.raw);

    socket.onopen = () => {
      const tags = buildSocketTags(roomId, peerId, displayName);

      try {
        const existingSockets = roomManager.getSockets(roomId);

        // Notify existing peers about the joiner
        broadcastToOthers(
          [...existingSockets.keys()],
          socket as unknown as WebSocket,
          buildPeerJoinedMessage(roomId, peerId, displayName),
        );

        // Notify joiner about existing peers
        for (const [_peer, peerTags] of existingSockets) {
          const peerPeerId = extractPeerIdFromTags(peerTags);
          const peerDisplayName = extractDisplayNameFromTags(peerTags);
          try {
            socket.send(buildPeerJoinedMessage(roomId, peerPeerId, peerDisplayName));
          } catch {
            // peer may be closing
          }
        }

        // Join the room (may throw if full)
        roomManager.join(roomId, socket as unknown as WebSocket, tags);
      } catch {
        // Room is full — close with 4409
        socket.close(4409, "Room is full");
      }
    };

    socket.onmessage = (event: MessageEvent) => {
      const data = typeof event.data === "string"
        ? event.data
        : new TextDecoder().decode(event.data as ArrayBuffer);

      const msg = parseSignalingMessage(data);
      if (!msg || !isAllowedSignalType(msg.type)) return;

      const sockets = roomManager.getSockets(roomId);

      // Targeted routing: if message specifies a targetPeerId, send only to that peer
      if (msg.targetPeerId) {
        for (const [peerSocket, peerTags] of sockets) {
          if (extractPeerIdFromTags(peerTags) === msg.targetPeerId) {
            try {
              peerSocket.send(data);
            } catch {
              // peer may be closing
            }
            break;
          }
        }
      } else {
        // No target — broadcast to all others
        broadcastToOthers(
          [...sockets.keys()],
          socket as unknown as WebSocket,
          data,
        );
      }
    };

    socket.onclose = () => {
      const tags = roomManager.getTags(socket as unknown as WebSocket);
      const rid = extractRoomIdFromTags(tags);
      const pid = extractPeerIdFromTags(tags);

      const sockets = roomManager.getSockets(rid);
      broadcastToOthers(
        [...sockets.keys()],
        socket as unknown as WebSocket,
        buildPeerLeftMessage(rid, pid),
      );

      roomManager.leave(rid, socket as unknown as WebSocket);
    };

    socket.onerror = () => {
      // onclose will fire after this
    };

    return response;
  });

  return routes;
};
