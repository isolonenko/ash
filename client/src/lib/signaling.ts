import type { SignalingMessage } from "@shared/types";

// ── Config ───────────────────────────────────────────────

const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL || "ws://localhost:8080";

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

// ── Types ────────────────────────────────────────────────

type MessageHandler = (msg: SignalingMessage) => void;
type ConnectionHandler = (connected: boolean) => void;

interface SignalingClientOptions {
  onMessage: MessageHandler;
  onConnectionChange?: ConnectionHandler;
  publicKey?: string; // our public key, sent as query param for peer identification
}

// ── Signaling Client ─────────────────────────────────────

export const createSignalingClient = (options: SignalingClientOptions) => {
  let ws: WebSocket | null = null;
  let currentRoomId: string | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionallyClosed = false;

  const connect = (roomId: string): void => {
    cleanup();
    intentionallyClosed = false;
    currentRoomId = roomId;

    const keyParam = options.publicKey
      ? `?publicKey=${encodeURIComponent(options.publicKey)}`
      : "";
    const url = `${SIGNALING_URL}/signal/${roomId}${keyParam}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("[Signaling] WS connected to", url);
      reconnectAttempts = 0;
      options.onConnectionChange?.(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: SignalingMessage = JSON.parse(event.data as string);
        console.log("[Signaling] WS recv:", msg.type, "sender:", msg.senderPublicKey?.substring(0, 8));
        options.onMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      console.log("[Signaling] WS closed code:", event.code, "reason:", event.reason);
      options.onConnectionChange?.(false);
      if (!intentionallyClosed && currentRoomId) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  };

  const send = (msg: SignalingMessage): void => {
    const isOpen = ws?.readyState === WebSocket.OPEN;
    console.log("[Signaling] WS send:", msg.type, "wsOpen:", isOpen, "readyState:", ws?.readyState);
    if (isOpen) {
      ws!.send(JSON.stringify(msg));
    }
  };

  const disconnect = (): void => {
    intentionallyClosed = true;
    cleanup();
    currentRoomId = null;
  };

  const cleanup = (): void => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      ws = null;
    }
  };

  const scheduleReconnect = (): void => {
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts),
      RECONNECT_MAX_DELAY,
    );
    reconnectAttempts++;

    reconnectTimer = setTimeout(() => {
      if (currentRoomId && !intentionallyClosed) {
        connect(currentRoomId);
      }
    }, delay);
  };

  const isConnected = (): boolean => ws?.readyState === WebSocket.OPEN;

  return { connect, send, disconnect, isConnected };
};

// ── Presence API (HTTP) ──────────────────────────────────

const PRESENCE_URL =
  import.meta.env.VITE_SIGNALING_URL?.replace(/^ws/, "http") ||
  "http://localhost:8080";

export const publishPresence = async (
  publicKey: string,
  roomId: string,
): Promise<void> => {
  await fetch(`${PRESENCE_URL}/presence/${encodeURIComponent(publicKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId }),
  });
};

export const lookupPresence = async (
  publicKey: string,
): Promise<{ online: boolean; roomId?: string } | null> => {
  try {
    const res = await fetch(
      `${PRESENCE_URL}/presence/${encodeURIComponent(publicKey)}`,
    );
    if (!res.ok) return { online: false };
    return res.json();
  } catch {
    return null;
  }
};

export const removePresence = async (publicKey: string): Promise<void> => {
  await fetch(`${PRESENCE_URL}/presence/${encodeURIComponent(publicKey)}`, {
    method: "DELETE",
  });
};
