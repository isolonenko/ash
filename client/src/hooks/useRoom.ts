import { useState, useCallback } from "react";
import type { RoomInfo } from "@/types";
import type { RoomState, RoomStatus } from "@/context/room-context";
import { navigateTo } from "@/lib/router";
import { API_URL } from "@/lib/config";

// ── Initial State ───────────────────────────────────────

const initialState: RoomState = {
  status: "idle",
  roomId: null,
  roomInfo: null,
  displayName: null,
  peerId: null,
  error: null,
  initialAudioEnabled: true,
  initialVideoEnabled: true,
};

// ── Hook ────────────────────────────────────────────────

export const useRoom = () => {
  const [state, setState] = useState<RoomState>(initialState);

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
      setError(err instanceof Error ? err.message : "Failed to create room");
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
        setError(err instanceof Error ? err.message : "Failed to check room");
      }
    },
    [setStatus, setError],
  );

  // ── joinRoom ────────────────────────────────────────

  // ── joinRoom ────────────────────────────────────────

  const joinRoom = useCallback(
    async (id: string, displayName: string, mediaState: { audioEnabled: boolean; videoEnabled: boolean }) => {
      const peerId = crypto.randomUUID();

      setState((prev) => ({
        ...prev,
        status: "joined",
        roomId: id,
        peerId,
        displayName,
        error: null,
        initialAudioEnabled: mediaState.audioEnabled,
        initialVideoEnabled: mediaState.videoEnabled,
      }));

      navigateTo({ page: "room", roomId: id });
    },
    [],
  );

  // ── leaveRoom ───────────────────────────────────────

  const leaveRoom = useCallback(() => {
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
