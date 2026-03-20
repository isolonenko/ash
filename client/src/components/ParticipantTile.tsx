import { useEffect, useRef } from "react";
import styles from "./ParticipantTile.module.sass";

interface ParticipantTileProps {
  stream: MediaStream | null;
  displayName: string;
  isSpeaking: boolean;
  isLocalUser: boolean;
  userId: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  provideMediaRef?: (peerId: string, node: HTMLVideoElement | null) => void;
}

export const ParticipantTile = ({
  stream,
  displayName,
  isSpeaking,
  isLocalUser,
  userId,
  audioEnabled,
  videoEnabled,
  provideMediaRef,
}: ParticipantTileProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isLocalUser) return;
    const node = videoRef.current;
    if (!node) return;

    if (stream) {
      if (node.srcObject !== stream) {
        node.srcObject = stream;
      }
      // autoplay policy — some browsers require explicit play() call
      node.play().catch(() => {});
    } else {
      node.srcObject = null;
    }
  }, [stream, isLocalUser]);

  const hasLiveVideoTrack =
    stream
      ?.getVideoTracks()
      .some((t) => t.readyState === "live" && t.enabled) ?? false;
  const showVideo = videoEnabled && hasLiveVideoTrack;

  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div
      className={`${styles.tile} ${isSpeaking ? styles.speaking : ""}`}
      data-local={isLocalUser}
      data-userid={userId}
      data-video-off={!videoEnabled}
    >
      <video
        ref={(node) => {
          videoRef.current = node;
          if (!isLocalUser && provideMediaRef) {
            provideMediaRef(userId, node);
          }
        }}
        className={styles.video}
        style={showVideo ? undefined : { display: "none" }}
        autoPlay
        playsInline
        muted={isLocalUser}
      />

      {!showVideo && (
        <div className={styles.placeholder}>
          <div className={styles.initial}>{initial}</div>
        </div>
      )}

      <div className={styles.overlay}>
        <div className={styles.label}>{displayName}</div>
      </div>

      {!audioEnabled && <div className={styles.mutedBadge}>[MIC OFF]</div>}
    </div>
  );
};
