import { useCallback } from "react";
import styles from "./ParticipantTile.module.sass";

interface ParticipantTileProps {
  stream: MediaStream | null;
  displayName: string;
  isSpeaking: boolean;
  isLocalUser: boolean;
  userId: string;
}

export const ParticipantTile = ({
  stream,
  displayName,
  isSpeaking,
  isLocalUser,
  userId,
}: ParticipantTileProps) => {
  const videoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      if (node && stream) {
        node.srcObject = stream;
        node.autoplay = true;
        node.playsInline = true;
      }
    },
    [stream],
  );

  const audioTrack = stream?.getAudioTracks()[0];
  const hasVideo = stream?.getVideoTracks().length ? stream.getVideoTracks()[0].enabled : false;
  const isMuted = audioTrack ? !audioTrack.enabled : true;

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

      {isMuted && (
        <div className={styles.mutedBadge}>[MIC OFF]</div>
      )}
    </div>
  );
};
