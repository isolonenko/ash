import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import type {
  ChatPayload,
  DataChannelMessage,
  PeerConnectionState,
} from "@/types";
import type { createWebRTCManager } from "@/lib/webrtc";
import { useConnection } from "@/hooks/useConnection";

// ── Types ────────────────────────────────────────────────

interface ConnectionContextValue {
  connectionState: PeerConnectionState;
  connectedPeerKey: string | null;
  presenceRoomId: string | null;
  isConnecting: boolean;
  connectionMessage: string | null;
  rtcManager: ReturnType<typeof createWebRTCManager> | null;
  incomingChat: ChatPayload | null;
  peerTyping: boolean;
  connectTo: (peerPublicKey: string) => Promise<void>;
  sendChat: (id: string, text: string) => void;
  sendTyping: (isTyping: boolean) => void;
  sendFile: (file: File) => Promise<string>;
  sendCallSignal: (msg: DataChannelMessage) => void;
  disconnect: () => void;
}

interface ConnectionProviderProps {
  publicKey: string;
  onPeerIdentified: (peerPublicKey: string) => void;
  callSignalRef: React.RefObject<(msg: DataChannelMessage) => void>;
  remoteTrackRef: React.RefObject<(event: RTCTrackEvent) => void>;
  children: ReactNode;
}

// ── Context ──────────────────────────────────────────────

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export const useConnectionContext = (): ConnectionContextValue => {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error("useConnectionContext must be used within ConnectionProvider");
  }
  return ctx;
};

// ── Provider ─────────────────────────────────────────────

export const ConnectionProvider = ({
  publicKey,
  onPeerIdentified,
  callSignalRef,
  remoteTrackRef,
  children,
}: ConnectionProviderProps) => {
  const [incomingChat, setIncomingChat] = useState<ChatPayload | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);

  const onPeerIdentifiedRef = useRef(onPeerIdentified);
  onPeerIdentifiedRef.current = onPeerIdentified;

  const handleChatMessage = useCallback((payload: ChatPayload) => {
    setIncomingChat(payload);
  }, []);

  const handleTyping = useCallback((isTyping: boolean) => {
    setPeerTyping(isTyping);
  }, []);

  const handlePeerIdentified = useCallback((peerPublicKey: string) => {
    onPeerIdentifiedRef.current(peerPublicKey);
  }, []);

  const handleCallSignal = useCallback((msg: DataChannelMessage) => {
    callSignalRef.current(msg);
  }, [callSignalRef]);

  const handleRemoteTrack = useCallback((event: RTCTrackEvent) => {
    remoteTrackRef.current(event);
  }, [remoteTrackRef]);

  const {
    connectionState,
    connectedPeerKey,
    presenceRoomId,
    isConnecting,
    connectionMessage,
    rtcManager,
    connectTo,
    sendChat,
    sendTyping,
    sendFile,
    sendCallSignal,
    disconnect,
  } = useConnection({
    publicKey,
    onChatMessage: handleChatMessage,
    onTyping: handleTyping,
    onPeerIdentified: handlePeerIdentified,
    onCallSignal: handleCallSignal,
    onRemoteTrack: handleRemoteTrack,
  });

  const value = useMemo<ConnectionContextValue>(
    () => ({
      connectionState,
      connectedPeerKey,
      presenceRoomId,
      isConnecting,
      connectionMessage,
      rtcManager,
      incomingChat,
      peerTyping,
      connectTo,
      sendChat,
      sendTyping,
      sendFile,
      sendCallSignal,
      disconnect,
    }),
    [
      connectionState,
      connectedPeerKey,
      presenceRoomId,
      isConnecting,
      connectionMessage,
      rtcManager,
      incomingChat,
      peerTyping,
      connectTo,
      sendChat,
      sendTyping,
      sendFile,
      sendCallSignal,
      disconnect,
    ],
  );

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
};
