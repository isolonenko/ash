import type { SignalingMessage } from "@/types";
import {
  RECONNECT_BASE_DELAY,
  RECONNECT_MAX_DELAY,
} from "@/lib/constants";

// ── Config ───────────────────────────────────────────────

const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL || "ws://localhost:8000";

// ── Types ────────────────────────────────────────────────

type MessageHandler = (msg: SignalingMessage) => void;
type ConnectionHandler = (connected: boolean) => void;

interface SignalingClientOptions {
  onMessage: MessageHandler;
  onConnectionChange?: ConnectionHandler;
  onError?: (error: "room-full" | "unknown") => void;
  onReconnected?: () => void;
  peerId: string;
  displayName: string;
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

    const url = `${SIGNALING_URL}/signal/${roomId}?peerId=${encodeURIComponent(options.peerId)}&displayName=${encodeURIComponent(options.displayName)}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      const wasReconnecting = reconnectAttempts > 0;
      reconnectAttempts = 0;
      options.onConnectionChange?.(true);
      if (wasReconnecting) {
        options.onReconnected?.();
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: SignalingMessage = JSON.parse(event.data as string);
        options.onMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      options.onConnectionChange?.(false);

      if (event.code === 1013 || event.code === 4409) {
        options.onError?.("room-full");
        return;
      }

      if (!intentionallyClosed && currentRoomId) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  };

  const send = (msg: SignalingMessage, targetPeerId?: string): void => {
    if (ws?.readyState === WebSocket.OPEN) {
      const outgoing = targetPeerId ? { ...msg, targetPeerId } : msg;
      ws!.send(JSON.stringify(outgoing));
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
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
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
