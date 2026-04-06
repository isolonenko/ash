import { useState, useEffect, useCallback } from 'react'
import { Mic, MicOff, Camera, CameraOff } from 'lucide-react'
import { useRoomContext } from '@/context/room-context'
import { useLocalStream, useMediaState, useMediaActions, useDevices } from '@/hooks/useMediaManager'
import { navigateTo } from '@/lib/router'
import { ThemeToggle } from './ThemeToggle'
import { DeviceDropdown } from './DeviceDropdown'
import styles from './Preview.module.sass'

interface PreviewProps {
  roomId: string
}

export const Preview = ({ roomId }: PreviewProps) => {
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { checkRoom, joinRoom } = useRoomContext()
  const localStream = useLocalStream()
  const { isMicEnabled, isCamEnabled } = useMediaState()
  const { acquire, release, toggleMic, toggleCam } = useMediaActions()
  const devices = useDevices()
  const hasVideoDevices = devices.video.length > 0

  const videoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      if (node && localStream) {
        node.srcObject = localStream
        node.autoplay = true
        node.muted = true
        node.playsInline = true
      }
    },
    [localStream],
  )

  useEffect(() => {
    const init = async () => {
      try {
        await checkRoom(roomId)
      } catch {
        setError('Room not found or full')
        return
      }

      try {
        await acquire()
      } catch {
        // Silently fail — user sees "Camera off" placeholder
      }
    }

    init()
  }, [roomId, checkRoom, acquire])

  useEffect(() => {
    return () => {
      release()
    }
  }, [release])

  const handleJoin = async () => {
    if (!displayName.trim()) return

    try {
      await joinRoom(roomId, displayName.trim(), {
        audioEnabled: isMicEnabled,
        videoEnabled: isCamEnabled,
      })
    } catch {
      setError('Failed to join room')
    }
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <div className={styles.errorMessage}>{error}</div>
          <button className={styles.backButton} onClick={() => navigateTo({ page: 'landing' })}>
            ← Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.roomCode}>Room: {roomId}</div>
        <ThemeToggle className={styles.themeToggle} />
      </header>

      <div className={styles.previewSection}>
        <div className={styles.videoContainer}>
          {isCamEnabled && localStream ? (
            <video ref={videoRef} className={styles.video} />
          ) : (
            <div className={styles.videoPlaceholder}>
              <div className={styles.placeholderText}>Camera off</div>
            </div>
          )}
        </div>

        <input
          type="text"
          className={styles.nameInput}
          placeholder="Enter your name"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          maxLength={50}
          spellCheck={false}
          autoComplete="off"
        />

        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <button className={isMicEnabled ? styles.buttonActive : styles.buttonInactive} onClick={toggleMic}>
              {isMicEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <DeviceDropdown kind="audio" direction="down" />
          </div>

          {hasVideoDevices && (
            <div className={styles.controlGroup}>
              <button className={isCamEnabled ? styles.buttonActive : styles.buttonInactive} onClick={toggleCam}>
                {isCamEnabled ? <Camera size={18} /> : <CameraOff size={18} />}
              </button>
              <DeviceDropdown kind="video" direction="down" />
            </div>
          )}
        </div>

        <button className={styles.joinButton} onClick={handleJoin} disabled={!displayName.trim()}>
          Join
        </button>
      </div>
    </div>
  )
}
