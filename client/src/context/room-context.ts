import { createContext, useContext } from "react";
import type { RoomInfo } from "@/types";

// ── Room State Machine ──────────────────────────────────

export type RoomStatus =
  | "idle"
  | "checking"
  | "preview"
  | "joining"
  | "joined"
  | "error";

export interface RoomState {
  status: RoomStatus;
  roomId: string | null;
  roomInfo: RoomInfo | null;
  displayName: string | null;
  peerId: string | null;
  error: string | null;
}

// ── Context Value ───────────────────────────────────────

export interface RoomContextValue {
  state: RoomState;
  createRoom: () => Promise<void>;
  checkRoom: (id: string) => Promise<void>;
  joinRoom: (id: string, displayName: string) => Promise<void>;
  leaveRoom: () => void;
}

export const RoomContext = createContext<RoomContextValue | null>(null);

export const useRoomContext = (): RoomContextValue => {
  const ctx = useContext(RoomContext);
  if (!ctx) {
    throw new Error("useRoomContext must be used within RoomProvider");
  }
  return ctx;
};
