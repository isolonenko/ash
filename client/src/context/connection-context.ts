import { createContext, useContext } from "react";
import type {
  ChatPayload,
  DataChannelMessage,
  PeerConnectionState,
} from "@/types";
import type { createWebRTCManager } from "@/lib/webrtc";

export interface ConnectionContextValue {
  connectionState: PeerConnectionState;
  connectedPeerKey: string | null;
  presenceRoomId: string | null;
  isConnecting: boolean;
  connectionMessage: string | null;
  rtcManager: ReturnType<typeof createWebRTCManager> | null;
  getRtcManager: () => ReturnType<typeof createWebRTCManager> | null;
  incomingChat: ChatPayload | null;
  peerTyping: boolean;
  connectTo: (peerPublicKey: string) => Promise<void>;
  sendChat: (id: string, text: string) => void;
  sendTyping: (isTyping: boolean) => void;
  sendFile: (file: File) => Promise<string>;
  sendCallSignal: (msg: DataChannelMessage) => void;
  disconnect: () => void;
}

export const ConnectionContext = createContext<ConnectionContextValue | null>(
  null,
);

export const useConnectionContext = (): ConnectionContextValue => {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error(
      "useConnectionContext must be used within ConnectionProvider",
    );
  }
  return ctx;
};
