import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import {
  MAX_ROOM_SIZE,
  broadcastToOthers,
  buildPeerJoinedMessage,
  buildPeerLeftMessage,
  buildSocketTags,
  extractPublicKeyFromTags,
  extractRoomIdFromTags,
  isAllowedSignalType,
  parseSignalingMessage,
} from "../lib/signaling-logic";

// Thin class shell — CF runtime requires `extends DurableObject`.
// All logic lives in pure functions from signaling-logic.ts.
export class SignalingRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId") ?? "unknown";
    const publicKey = url.searchParams.get("publicKey") ?? undefined;

    const existingSockets = this.ctx.getWebSockets();

    if (existingSockets.length >= MAX_ROOM_SIZE) {
      return new Response("Room is full", { status: 409 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const tags = buildSocketTags(roomId, publicKey);
    this.ctx.acceptWebSocket(server, tags);

    // Notify existing peers about the joiner
    broadcastToOthers(
      existingSockets,
      server,
      buildPeerJoinedMessage(roomId, publicKey),
    );

    // Notify joiner about existing peers
    for (const peer of existingSockets) {
      const peerTags = this.ctx.getTags(peer);
      const peerKey = extractPublicKeyFromTags(peerTags);
      try {
        server.send(buildPeerJoinedMessage(roomId, peerKey));
      } catch {
        // peer may be closing
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const data =
      typeof message === "string"
        ? message
        : new TextDecoder().decode(message);

    const msg = parseSignalingMessage(data);
    if (!msg || !isAllowedSignalType(msg.type)) return;

    broadcastToOthers(this.ctx.getWebSockets(), ws, data);
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const tags = this.ctx.getTags(ws);
    const roomId = extractRoomIdFromTags(tags);
    const publicKey = extractPublicKeyFromTags(tags);

    broadcastToOthers(
      this.ctx.getWebSockets(),
      ws,
      buildPeerLeftMessage(roomId, publicKey),
    );

    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    ws.close(1011, "WebSocket error");
  }
}
