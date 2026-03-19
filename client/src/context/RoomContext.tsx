import { useMemo } from "react";
import type { ReactNode } from "react";
import { useRoom } from "@/hooks/useRoom";
import { RoomContext, type RoomContextValue } from "@/context/room-context";

// ── Types ────────────────────────────────────────────────

interface RoomProviderProps {
  children: ReactNode;
}

// ── Provider ─────────────────────────────────────────────

export const RoomProvider = ({ children }: RoomProviderProps) => {
  const { state, createRoom, checkRoom, joinRoom, leaveRoom } = useRoom();

  const value = useMemo<RoomContextValue>(
    () => ({
      state,
      createRoom,
      checkRoom,
      joinRoom,
      leaveRoom,
    }),
    [state, createRoom, checkRoom, joinRoom, leaveRoom],
  );

  return (
    <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
  );
};
