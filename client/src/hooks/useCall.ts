import { useState, useCallback, useRef, useEffect } from "react";
import type {
  CallState,
  CallType,
  CallErrorReason,
  DataChannelMessage,
  CallOfferPayload,
  CallAcceptPayload,
  CallMediaStatePayload,
} from "@/types";
import type { createWebRTCManager } from "@/lib/webrtc";
import { CALL_MEDIA_TIMEOUT_MS } from "@/lib/constants";

// ── Types ────────────────────────────────────────────────

export interface UseCallOptions {
  rtcManager: ReturnType<typeof createWebRTCManager> | null;
  getRtcManager?: () => ReturnType<typeof createWebRTCManager> | null;
  send: (msg: DataChannelMessage) => void;
  localPublicKey: string;
  peerPublicKey: string | null;
}

export interface UseCallResult {
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

// ── Hook ─────────────────────────────────────────────────

export const useCall = (options: UseCallOptions): UseCallResult => {
  const [callState, setCallState] = useState<CallState>("idle");
  const [callError, setCallError] = useState<CallErrorReason | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [incomingCallType, setIncomingCallType] = useState<CallType | null>(
    null,
  );
  const [currentCallType, setCurrentCallType] = useState<CallType | null>(null);

  const sendersRef = useRef<RTCRtpSender[]>([]);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const localStreamRef = useRef<MediaStream | null>(null);

  const getMediaConstraints = (
    type: CallType,
  ): MediaStreamConstraints => {
    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (type === "video") {
      return {
        audio,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      };
    }
    return { audio };
  };

  const stopAllTracks = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const removeSenders = useCallback(() => {
    const freshRtc =
      optionsRef.current.getRtcManager?.() ?? optionsRef.current.rtcManager;
    if (!freshRtc) return;
    sendersRef.current.forEach((sender) => {
      freshRtc.removeMediaTrack(sender);
    });
    sendersRef.current = [];
  }, []);

  const cleanupCall = useCallback(() => {
    stopAllTracks();
    removeSenders();
    setRemoteStream(null);
    setIsAudioEnabled(true);
    setIsVideoEnabled(false);
    setIncomingCallType(null);
    setCurrentCallType(null);
    setCallError(null);
  }, [stopAllTracks, removeSenders]);

  const startCall = useCallback(
    async (type: CallType) => {
      const { send } = optionsRef.current;
      const freshRtc =
        optionsRef.current.getRtcManager?.() ?? optionsRef.current.rtcManager;
      if (!freshRtc) return;

      setCallState("outgoing-ringing");
      setCallError(null);
      setCurrentCallType(type);

      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          getMediaConstraints(type),
        );
        localStreamRef.current = stream;
        setLocalStream(stream);

        const newSenders = stream
          .getTracks()
          .map((track) => freshRtc.addMediaTrack(track, stream))
          .filter((s): s is RTCRtpSender => s !== null);
        sendersRef.current = newSenders;

        send({ type: "call-offer", payload: { callType: type } });
        setIsAudioEnabled(true);
        setIsVideoEnabled(type === "video");
      } catch (err) {
        cleanupCall();
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setCallState("error");
          setCallError("permission-denied");
        } else {
          setCallState("error");
          setCallError("media-error");
        }
      }
    },
    [cleanupCall],
  );

  const acceptCall = useCallback(async () => {
    const { send } = optionsRef.current;
    const freshRtc =
      optionsRef.current.getRtcManager?.() ?? optionsRef.current.rtcManager;
    if (!freshRtc || !incomingCallType) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        getMediaConstraints(incomingCallType),
      );
      localStreamRef.current = stream;
      setLocalStream(stream);

      const newSenders = stream
        .getTracks()
        .map((track) => freshRtc.addMediaTrack(track, stream))
        .filter((s): s is RTCRtpSender => s !== null);
      sendersRef.current = newSenders;

      send({
        type: "call-accept",
        payload: { callType: incomingCallType },
      });
      setCallState("active");
      setCurrentCallType(incomingCallType);
      setIsAudioEnabled(true);
      setIsVideoEnabled(incomingCallType === "video");
    } catch (err) {
      cleanupCall();
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setCallState("error");
        setCallError("permission-denied");
      } else {
        setCallState("error");
        setCallError("media-error");
      }
    }
  }, [incomingCallType, cleanupCall]);

  const rejectCall = useCallback(() => {
    const { send } = optionsRef.current;
    send({ type: "call-reject", payload: {} });
    setCallState("idle");
    setIncomingCallType(null);
  }, []);

  const endCall = useCallback(() => {
    const { send } = optionsRef.current;
    send({ type: "call-end", payload: {} });
    cleanupCall();
    setCallState("idle");
  }, [cleanupCall]);

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const newEnabled = !audioTrack.enabled;
    audioTrack.enabled = newEnabled;
    setIsAudioEnabled(newEnabled);

    const { send } = optionsRef.current;
    send({
      type: "call-media-state",
      payload: {
        audioEnabled: newEnabled,
        videoEnabled: isVideoEnabled,
      } satisfies CallMediaStatePayload,
    });
  }, [isVideoEnabled]);

  const toggleVideo = useCallback(async () => {
    const { send } = optionsRef.current;
    const freshRtc =
      optionsRef.current.getRtcManager?.() ?? optionsRef.current.rtcManager;
    if (!freshRtc) return;

    const stream = localStreamRef.current;
    const existingVideoTrack = stream?.getVideoTracks()[0];

    if (existingVideoTrack && existingVideoTrack.enabled) {
      existingVideoTrack.enabled = false;
      setIsVideoEnabled(false);
      send({
        type: "call-media-state",
        payload: { audioEnabled: isAudioEnabled, videoEnabled: false },
      });
      return;
    }

    if (existingVideoTrack && !existingVideoTrack.enabled) {
      existingVideoTrack.enabled = true;
      setIsVideoEnabled(true);
      send({
        type: "call-media-state",
        payload: { audioEnabled: isAudioEnabled, videoEnabled: true },
      });
      return;
    }

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      });
      const videoTrack = videoStream.getVideoTracks()[0];
      if (!videoTrack) return;

      if (stream) {
        stream.addTrack(videoTrack);
      }
      setLocalStream(stream ? new MediaStream(stream.getTracks()) : videoStream);

      const sender = freshRtc.addMediaTrack(
        videoTrack,
        stream ?? videoStream,
      );
      if (sender) {
        sendersRef.current = [...sendersRef.current, sender];
      }

      setIsVideoEnabled(true);
      send({
        type: "call-media-state",
        payload: { audioEnabled: isAudioEnabled, videoEnabled: true },
      });
    } catch {
      setCallError("media-error");
    }
  }, [isAudioEnabled]);

  const handleCallMessage = useCallback(
    (msg: DataChannelMessage) => {
      switch (msg.type) {
        case "call-offer": {
          const payload = msg.payload as CallOfferPayload;
          setIncomingCallType(payload.callType);
          setCallState("incoming-ringing");
          break;
        }
        case "call-accept": {
          const payload = msg.payload as CallAcceptPayload;
          setCallState("active");
          setCurrentCallType(payload.callType);
          setIsVideoEnabled(payload.callType === "video");
          break;
        }
        case "call-reject": {
          cleanupCall();
          setCallState("idle");
          break;
        }
        case "call-end": {
          cleanupCall();
          setCallState("idle");
          break;
        }
        case "call-media-state": {
          // Store remote media state — future use for remote mute indicators
          msg.payload as CallMediaStatePayload;
          break;
        }
      }
    },
    [cleanupCall],
  );

  const handleRemoteTrack = useCallback((event: RTCTrackEvent) => {
    const stream = event.streams[0];
    if (stream) {
      setRemoteStream(stream);
    } else {
      setRemoteStream((prev) => {
        const newStream = prev ?? new MediaStream();
        newStream.addTrack(event.track);
        return new MediaStream(newStream.getTracks());
      });
    }
  }, []);

  useEffect(() => {
    if (!optionsRef.current.rtcManager && callState === "active") {
      cleanupCall();
      setCallState("idle");
    }
  }, [options.rtcManager, callState, cleanupCall]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (
        callState === "active" ||
        callState === "outgoing-ringing" ||
        callState === "incoming-ringing"
      ) {
        optionsRef.current.send({ type: "call-end", payload: {} });
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [callState]);

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (callState !== "active") return;

    const hasLiveRemoteTracks = (): boolean =>
      remoteStream !== null &&
      remoteStream.getTracks().some((t) => t.readyState === "live");

    if (hasLiveRemoteTracks()) return;

    const timerId = setTimeout(() => {
      if (!hasLiveRemoteTracks()) {
        console.warn(
          "[useCall] No remote media tracks after timeout — TURN relay may be misconfigured",
        );
        cleanupCall();
        setCallState("error");
        setCallError("call-failed");
      }
    }, CALL_MEDIA_TIMEOUT_MS);

    return () => clearTimeout(timerId);
  }, [callState, remoteStream, cleanupCall]);

  return {
    callState,
    callError,
    localStream,
    remoteStream,
    isAudioEnabled,
    isVideoEnabled,
    incomingCallType,
    currentCallType,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleAudio,
    toggleVideo,
    handleCallMessage,
    handleRemoteTrack,
  };
};
