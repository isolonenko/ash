import { useState, useCallback, useRef, useMemo, type ReactNode } from "react";
import type { SignalingMessage, SignalingContextValue } from "@/types";
import { createSignalingClient } from "@/lib/signaling";
import { SignalingContext } from "@/context/signaling-context";

interface SignalingProviderProps {
  children: ReactNode;
}

export const SignalingProvider = ({ children }: SignalingProviderProps) => {
  const [connected, setConnected] = useState(false);

  const clientRef = useRef<ReturnType<typeof createSignalingClient> | null>(null);
  const messageHandlersRef = useRef<Set<(msg: SignalingMessage) => void>>(new Set());
  const errorHandlersRef = useRef<Set<(error: "room-full" | "unknown") => void>>(new Set());

  const connect = useCallback(
    (roomId: string, peerId: string, displayName: string) => {
      clientRef.current?.disconnect();

      const client = createSignalingClient({
        peerId,
        displayName,
        onMessage: (msg: SignalingMessage) => {
          for (const handler of messageHandlersRef.current) {
            handler(msg);
          }
        },
        onConnectionChange: (isConnected: boolean) => {
          setConnected(isConnected);
        },
        onError: (error: "room-full" | "unknown") => {
          for (const handler of errorHandlersRef.current) {
            handler(error);
          }
        },
        onReconnected: () => {
          // Could emit a reconnect event if needed later
        },
      });

      clientRef.current = client;
      client.connect(roomId);
    },
    [],
  );

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setConnected(false);
  }, []);

  const send = useCallback(
    (msg: SignalingMessage, targetPeerId: string) => {
      clientRef.current?.send(msg, targetPeerId);
    },
    [],
  );

  const onMessage = useCallback(
    (handler: (msg: SignalingMessage) => void): (() => void) => {
      messageHandlersRef.current.add(handler);
      return () => {
        messageHandlersRef.current.delete(handler);
      };
    },
    [],
  );

  const onError = useCallback(
    (handler: (error: "room-full" | "unknown") => void): (() => void) => {
      errorHandlersRef.current.add(handler);
      return () => {
        errorHandlersRef.current.delete(handler);
      };
    },
    [],
  );

  const value = useMemo<SignalingContextValue>(
    () => ({ connected, connect, disconnect, send, onMessage, onError }),
    [connected, connect, disconnect, send, onMessage, onError],
  );

  return (
    <SignalingContext.Provider value={value}>
      {children}
    </SignalingContext.Provider>
  );
};
