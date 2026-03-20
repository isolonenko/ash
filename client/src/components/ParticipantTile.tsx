import { useEffect, useRef, useState } from "react";
import styles from "./ParticipantTile.module.sass";

interface ParticipantTileProps {
  stream: MediaStream | null;
  displayName: string;
  isSpeaking: boolean;
  isLocalUser: boolean;
  userId: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export const ParticipantTile = ({
  stream,
  displayName,
  isSpeaking,
  isLocalUser,
  userId,
  audioEnabled,
  videoEnabled,
}: ParticipantTileProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [trackRevision, setTrackRevision] = useState(0);

  useEffect(() => {
    if (!stream) return;

    const bump = () => setTrackRevision((r) => r + 1);
    stream.addEventListener("addtrack", bump);
    stream.addEventListener("removetrack", bump);

    return () => {
      stream.removeEventListener("addtrack", bump);
      stream.removeEventListener("removetrack", bump);
    };
  }, [stream]);

  useEffect(() => {
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
  }, [stream, trackRevision]);

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
    >
      {stream && (
        <video
          ref={videoRef}
          className={styles.video}
          style={showVideo ? undefined : { display: "none" }}
          autoPlay
          playsInline
          muted={isLocalUser}
        />
      )}

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
