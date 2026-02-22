import type { SignalingMessage } from "@/types";
import {
  RECONNECT_BASE_DELAY,
  RECONNECT_MAX_DELAY,
  PRESENCE_RETRY_ATTEMPTS,
  PRESENCE_RETRY_BASE_DELAY,
} from "@/lib/constants";
import { retryWithBackoff } from "@/lib/retry";

// ── Config ───────────────────────────────────────────────

const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL || "ws://localhost:8080";

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
      reconnectAttempts = 0;
      options.onConnectionChange?.(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: SignalingMessage = JSON.parse(event.data as string);
        options.onMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
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
    if (ws?.readyState === WebSocket.OPEN) {
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
  await retryWithBackoff(
    () =>
      fetch(`${PRESENCE_URL}/presence/${encodeURIComponent(publicKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }),
    {
      attempts: PRESENCE_RETRY_ATTEMPTS,
      baseDelay: PRESENCE_RETRY_BASE_DELAY,
      label: "publishPresence",
    },
  ).catch(() => {
    // Swallow after all retries — presence is best-effort
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
