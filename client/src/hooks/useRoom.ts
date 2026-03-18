import { useState, useCallback, useRef } from "react";
import type { RoomInfo } from "@/types";
import type { RoomState, RoomStatus } from "@/context/room-context";
import { navigateTo } from "@/lib/router";

// ── Config ──────────────────────────────────────────────

const API_URL =
  import.meta.env.VITE_SIGNALING_URL?.replace(/^ws/, "http") ||
  "http://localhost:8000";

const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL || "ws://localhost:8000";

// ── Initial State ───────────────────────────────────────

const initialState: RoomState = {
  status: "idle",
  roomId: null,
  roomInfo: null,
  displayName: null,
  peerId: null,
  error: null,
};

// ── Hook ────────────────────────────────────────────────

export const useRoom = () => {
  const [state, setState] = useState<RoomState>(initialState);

  const wsRef = useRef<WebSocket | null>(null);

  const setStatus = useCallback((status: RoomStatus) => {
    setState((prev) => ({ ...prev, status }));
  }, []);

  const setError = useCallback((error: string) => {
    setState((prev) => ({ ...prev, status: "error" as const, error }));
  }, []);

  // ── createRoom ──────────────────────────────────────

  const createRoom = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms`, { method: "POST" });

      if (!res.ok) {
        setError(`Failed to create room: HTTP ${res.status}`);
        return;
      }

      const data: { id: string } = await res.json();

      setState((prev) => ({
        ...prev,
        status: "preview",
        roomId: data.id,
        error: null,
      }));

      navigateTo({ page: "preview", roomId: data.id });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create room",
      );
    }
  }, [setError]);

  // ── checkRoom ───────────────────────────────────────

  const checkRoom = useCallback(
    async (id: string) => {
      setStatus("checking");

      try {
        const res = await fetch(`${API_URL}/rooms/${id}/check`);

        if (!res.ok) {
          setError(`Failed to check room: HTTP ${res.status}`);
          return;
        }

        const data: {
          exists: boolean;
          participantCount: number;
          maxSize: number;
        } = await res.json();

        if (!data.exists) {
          setError("Room not found");
          return;
        }

        if (data.participantCount >= data.maxSize) {
          setError("Room is full");
          return;
        }

        const roomInfo: RoomInfo = {
          id,
          participantCount: data.participantCount,
          maxSize: data.maxSize,
        };

        setState((prev) => ({
          ...prev,
          status: "preview",
          roomId: id,
          roomInfo,
          error: null,
        }));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to check room",
        );
      }
    },
    [setStatus, setError],
  );

  // ── joinRoom ────────────────────────────────────────

  const joinRoom = useCallback(
    async (id: string, displayName: string) => {
      setState((prev) => ({
        ...prev,
        status: "joining",
        displayName,
        error: null,
      }));

      try {
        const peerId = crypto.randomUUID();

        // Disconnect existing WebSocket if any
        if (wsRef.current) {
          wsRef.current.onclose = null;
          wsRef.current.close();
          wsRef.current = null;
        }

        const params = new URLSearchParams({
          peerId,
          displayName,
        });
        const url = `${SIGNALING_URL}/signal/${id}?${params.toString()}`;
        const ws = new WebSocket(url);

        ws.onopen = () => {
          setState((prev) => ({
            ...prev,
            status: "joined",
            roomId: id,
            peerId,
            displayName,
            error: null,
          }));

          navigateTo({ page: "room", roomId: id });
        };

        ws.onclose = (event) => {
          if (event.code === 1013 || event.code === 4409) {
            setError("Room is full");
          }
          // No reconnection by design — ephemeral rooms
        };

        ws.onerror = () => {
          setError("Connection error");
        };

        wsRef.current = ws;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to join room",
        );
      }
    },
    [setError],
  );

  // ── leaveRoom ───────────────────────────────────────

  const leaveRoom = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setState(initialState);
    navigateTo({ page: "landing" });
  }, []);

  return {
    state,
    createRoom,
    checkRoom,
    joinRoom,
    leaveRoom,
  };
};
