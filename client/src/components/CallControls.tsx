interface CallControlsProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
  showVideoToggle?: boolean;
}

import styles from "./CallControls.module.sass";

export const CallControls = ({
  isAudioEnabled,
  isVideoEnabled,
  onToggleAudio,
  onToggleVideo,
  onEndCall,
  showVideoToggle = false,
}: CallControlsProps) => {
  return (
    <div className={styles.controls}>
      <button
        className={isAudioEnabled ? styles.button : styles.buttonMuted}
        onClick={onToggleAudio}
      >
        {isAudioEnabled ? "[MIC]" : "[MIC OFF]"}
      </button>

      {showVideoToggle && (
        <button
          className={isVideoEnabled ? styles.button : styles.buttonMuted}
          onClick={onToggleVideo}
        >
          {isVideoEnabled ? "[CAM]" : "[CAM OFF]"}
        </button>
      )}

      <button className={styles.endButton} onClick={onEndCall}>
        [END]
      </button>
    </div>
  );
};
