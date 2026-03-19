import { useCallback } from "react";
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
  const videoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      if (node) {
        if (stream) {
          node.srcObject = stream;
          node.autoplay = true;
          node.playsInline = true;
        } else {
          node.srcObject = null;
        }
      }
    },
    [stream],
  );

  const hasVideo = videoEnabled && (stream?.getVideoTracks().length ?? 0) > 0;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div
      className={`${styles.tile} ${isSpeaking ? styles.speaking : ""}`}
      data-local={isLocalUser}
      data-userid={userId}
    >
      {hasVideo && stream ? (
        <video ref={videoRef} className={styles.video} muted={isLocalUser} />
      ) : (
        <div className={styles.placeholder}>
          <div className={styles.initial}>{initial}</div>
        </div>
      )}

      <div className={styles.overlay}>
        <div className={styles.label}>{displayName}</div>
      </div>

      {!audioEnabled && (
        <div className={styles.mutedBadge}>[MIC OFF]</div>
      )}
    </div>
  );
};
