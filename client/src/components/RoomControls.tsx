import { useState } from "react";
import { Mic, MicOff, Camera, CameraOff, Monitor, MonitorOff, MessageSquare, PictureInPicture2, PhoneOff, Link, Check } from "lucide-react";
import { DeviceDropdown } from "./DeviceDropdown";
import styles from "./RoomControls.module.sass";

interface RoomControlsProps {
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleChat: () => void;
  onLeaveRoom: () => void;
  onCopyLink: () => void;
  onTogglePip: () => void;
  onToggleScreenShare: () => void;
  micEnabled: boolean;
  camEnabled: boolean;
  chatOpen: boolean;
  pipActive: boolean;
  pipSupported: boolean;
  screenSharing: boolean;
  screenShareSupported: boolean;
  roomCode: string;
  callDuration: string | null;
}

export const RoomControls = ({
  onToggleMic,
  onToggleCam,
  onToggleChat,
  onLeaveRoom,
  onCopyLink,
  onTogglePip,
  onToggleScreenShare,
  micEnabled,
  camEnabled,
  chatOpen,
  pipActive,
  pipSupported,
  screenSharing,
  screenShareSupported,
  roomCode,
  callDuration,
}: RoomControlsProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.controlBar}>
      <div className={styles.roomInfo}>
        <span className={styles.roomCode}>{roomCode}</span>
        {callDuration && <span className={styles.duration}>{callDuration}</span>}
        <button
          className={styles.copyButton}
          onClick={handleCopyLink}
          disabled={copied}
          aria-label={copied ? "Link copied" : "Copy room link"}
        >
          {copied ? (
            <>
              <Check size={14} /> Copied
            </>
          ) : (
            <>
              <Link size={14} /> Copy
            </>
          )}
        </button>
      </div>

      <div className={styles.controls}>
        <div className={styles.mediaGroup}>
          <div className={styles.controlGroup}>
            <button
              className={micEnabled ? styles.buttonActive : styles.buttonInactive}
              onClick={onToggleMic}
              aria-label={micEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <DeviceDropdown kind="audio" direction="up" />
          </div>

          <div className={styles.controlGroup}>
            <button
              className={camEnabled ? styles.buttonActive : styles.buttonInactive}
              onClick={onToggleCam}
              aria-label={camEnabled ? "Turn off camera" : "Turn on camera"}
            >
              {camEnabled ? <Camera size={18} /> : <CameraOff size={18} />}
            </button>
            <DeviceDropdown kind="video" direction="up" />
          </div>

          {screenShareSupported && (
            <button
              className={screenSharing ? styles.buttonScreenActive : styles.buttonScreen}
              onClick={onToggleScreenShare}
              aria-label={screenSharing ? "Stop screen sharing" : "Share screen"}
            >
              {screenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
            </button>
          )}
        </div>

        <div className={styles.separator} />

        <div className={styles.featuresGroup}>
          <button
            className={chatOpen ? styles.buttonChat : styles.buttonChatInactive}
            onClick={onToggleChat}
            aria-label={chatOpen ? "Close chat" : "Open chat"}
          >
            <MessageSquare size={18} />
          </button>

          {pipSupported && (
            <button
              className={pipActive ? styles.buttonActive : styles.buttonInactive}
              onClick={onTogglePip}
              aria-label={pipActive ? "Exit picture-in-picture" : "Enter picture-in-picture"}
            >
              <PictureInPicture2 size={18} />
            </button>
          )}
        </div>

        <div className={styles.separator} />

        <div className={styles.callGroup}>
          <button className={styles.buttonLeave} onClick={onLeaveRoom} aria-label="Leave room">
            <PhoneOff size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
