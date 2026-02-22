import { createContext, useContext, useRef, useMemo, useEffect } from "react";
import type { ReactNode } from "react";
import type {
  CallState,
  CallType,
  CallErrorReason,
  DataChannelMessage,
} from "@/types";
import { useCall } from "@/hooks/useCall";
import { useConnectionContext } from "@/context/ConnectionContext";

// ── Types ────────────────────────────────────────────────

interface CallContextValue {
  callState: CallState;
  callError: CallErrorReason | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  incomingCallType: CallType | null;
  currentCallType: CallType | null;
  startCall: (type: CallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleAudio: () => void;
  toggleVideo: () => Promise<void>;
  handleCallMessage: (msg: DataChannelMessage) => void;
  handleRemoteTrack: (event: RTCTrackEvent) => void;
}

interface CallProviderProps {
  localPublicKey: string;
  callSignalRef: React.RefObject<(msg: DataChannelMessage) => void>;
  remoteTrackRef: React.RefObject<(event: RTCTrackEvent) => void>;
  children: ReactNode;
}

// ── Context ──────────────────────────────────────────────

const CallContext = createContext<CallContextValue | null>(null);

export const useCallContext = (): CallContextValue => {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCallContext must be used within CallProvider");
  }
  return ctx;
};

// ── Provider ─────────────────────────────────────────────

export const CallProvider = ({
  localPublicKey,
  callSignalRef,
  remoteTrackRef,
  children,
}: CallProviderProps) => {
  const { rtcManager, sendCallSignal, connectedPeerKey } =
    useConnectionContext();

  const call = useCall({
    rtcManager,
    send: sendCallSignal,
    localPublicKey,
    peerPublicKey: connectedPeerKey,
  });

  const callRef = useRef(call);
  callRef.current = call;

  useEffect(() => {
    callSignalRef.current = (msg: DataChannelMessage) => {
      callRef.current.handleCallMessage(msg);
    };
    remoteTrackRef.current = (event: RTCTrackEvent) => {
      callRef.current.handleRemoteTrack(event);
    };
  }, [callSignalRef, remoteTrackRef]);

  const value = useMemo<CallContextValue>(
    () => ({
      callState: call.callState,
      callError: call.callError,
      localStream: call.localStream,
      remoteStream: call.remoteStream,
      isAudioEnabled: call.isAudioEnabled,
      isVideoEnabled: call.isVideoEnabled,
      incomingCallType: call.incomingCallType,
      currentCallType: call.currentCallType,
      startCall: call.startCall,
      acceptCall: call.acceptCall,
      rejectCall: call.rejectCall,
      endCall: call.endCall,
      toggleAudio: call.toggleAudio,
      toggleVideo: call.toggleVideo,
      handleCallMessage: call.handleCallMessage,
      handleRemoteTrack: call.handleRemoteTrack,
    }),
    [
      call.callState,
      call.callError,
      call.localStream,
      call.remoteStream,
      call.isAudioEnabled,
      call.isVideoEnabled,
      call.incomingCallType,
      call.currentCallType,
      call.startCall,
      call.acceptCall,
      call.rejectCall,
      call.endCall,
      call.toggleAudio,
      call.toggleVideo,
      call.handleCallMessage,
      call.handleRemoteTrack,
    ],
  );

  return (
    <CallContext.Provider value={value}>{children}</CallContext.Provider>
  );
};
