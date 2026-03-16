import { createContext, useContext } from "react";
import type {
  CallState,
  CallType,
  CallErrorReason,
  DataChannelMessage,
} from "@/types";

export interface CallContextValue {
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

export const CallContext = createContext<CallContextValue | null>(null);

export const useCallContext = (): CallContextValue => {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCallContext must be used within CallProvider");
  }
  return ctx;
};
