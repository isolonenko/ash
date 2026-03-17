import { useCallback } from "react";
import type { CallState, CallType } from "@/types";
import { CallControls } from "./CallControls";
import styles from "./CallOverlay.module.scss";

interface CallOverlayProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callState: CallState;
  callType: CallType;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  callerName: string;
  onToggleAudio: () => void;
  onToggleVideo: () => Promise<void>;
  onEndCall: () => void;
}

export const CallOverlay = ({
  localStream,
  remoteStream,
  callState,
  callType,
  isAudioEnabled,
  isVideoEnabled,
  callerName,
  onToggleAudio,
  onToggleVideo,
  onEndCall,
}: CallOverlayProps) => {
  const localVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      if (node) {
        node.srcObject = localStream;
      }
    },
    [localStream],
  );

  const remoteVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      if (node) {
        node.srcObject = remoteStream;
      }
    },
    [remoteStream],
  );

  const remoteAudioRef = useCallback(
    (node: HTMLAudioElement | null) => {
      if (node) {
        node.srcObject = remoteStream;
      }
    },
    [remoteStream],
  );

  const hasVideo = callType === "video" || isVideoEnabled;

  // ── Outgoing ringing state ───────────────────────────────

  if (callState === "outgoing-ringing") {
    return (
      <div className={styles.overlay}>
        <div className={styles.ringing}>
          <div className={styles.ringingText}>CALLING...</div>
          <div className={styles.ringingName}>{callerName}</div>
        </div>
        <div className={styles.controls}>
          <button className={styles.endButton} onClick={onEndCall}>
            [END]
          </button>
        </div>
      </div>
    );
  }

  // ── Active call — video mode ─────────────────────────────

  if (callState === "active" && hasVideo) {
    return (
      <div className={styles.overlay}>
        <video
          ref={remoteVideoRef}
          className={styles.remoteVideo}
          autoPlay
          playsInline
        />
        <video
          ref={localVideoRef}
          className={styles.localVideo}
          autoPlay
          playsInline
          muted
        />
        <div className={styles.controls}>
          <CallControls
            isAudioEnabled={isAudioEnabled}
            isVideoEnabled={isVideoEnabled}
            onToggleAudio={onToggleAudio}
            onToggleVideo={onToggleVideo}
            onEndCall={onEndCall}
            showVideoToggle
          />
        </div>
      </div>
    );
  }

  // ── Active call — audio only ─────────────────────────────

  if (callState === "active") {
    return (
      <div className={styles.overlay}>
        <audio ref={remoteAudioRef} autoPlay />
        <div className={styles.audioPlaceholder}>
          <div className={styles.audioName}>{callerName}</div>
          <div className={styles.audioLabel}>AUDIO CALL</div>
        </div>
        <div className={styles.controls}>
          <CallControls
            isAudioEnabled={isAudioEnabled}
            isVideoEnabled={isVideoEnabled}
            onToggleAudio={onToggleAudio}
            onToggleVideo={onToggleVideo}
            onEndCall={onEndCall}
            showVideoToggle
          />
        </div>
      </div>
    );
  }

  return null;
};
