import { useRef, useMemo, useEffect } from "react";
import type { ReactNode } from "react";
import type { DataChannelMessage } from "@/types";
import { useCall } from "@/hooks/useCall";
import { useConnectionContext } from "@/context/connection-context";
import { CallContext, type CallContextValue } from "@/context/call-context";

// ── Types ────────────────────────────────────────────────

interface CallProviderProps {
  localPublicKey: string;
  callSignalRef: React.RefObject<(msg: DataChannelMessage) => void>;
  remoteTrackRef: React.RefObject<(event: RTCTrackEvent) => void>;
  children: ReactNode;
}

// ── Provider ─────────────────────────────────────────────

export const CallProvider = ({
  localPublicKey,
  callSignalRef,
  remoteTrackRef,
  children,
}: CallProviderProps) => {
  const { rtcManager, getRtcManager, sendCallSignal, connectedPeerKey } =
    useConnectionContext();

  const call = useCall({
    rtcManager,
    getRtcManager,
    send: sendCallSignal,
    localPublicKey,
    peerPublicKey: connectedPeerKey,
  });

  const callRef = useRef(call);
  useEffect(() => {
    callRef.current = call;
  });

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

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};
