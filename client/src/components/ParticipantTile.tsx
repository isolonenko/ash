import { useEffect, useRef } from 'react'
import { MicOff, Loader2, AlertTriangle } from 'lucide-react'
import styles from './ParticipantTile.module.sass'

interface ParticipantTileProps {
  stream: MediaStream | null
  displayName: string
  isSpeaking: boolean
  isLocalUser: boolean
  isScreenSharing?: boolean
  userId: string
  audioEnabled: boolean
  videoEnabled: boolean
  connectionState: RTCPeerConnectionState | 'local'
  provideMediaRef?: (peerId: string, node: HTMLVideoElement | null) => void
}

export const ParticipantTile = ({
  stream,
  displayName,
  isSpeaking,
  isLocalUser,
  isScreenSharing,
  userId,
  audioEnabled,
  videoEnabled,
  connectionState,
  provideMediaRef,
}: ParticipantTileProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const node = videoRef.current
    if (!node) return

    if (stream) {
      if (node.srcObject !== stream) {
        node.srcObject = stream
      }
      // autoplay policy — some browsers require explicit play() call
      node.play().catch(() => {})
    } else {
      node.srcObject = null
    }
  }, [stream])

  const hasLiveVideoTrack = stream?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled) ?? false
  const showVideo = videoEnabled && hasLiveVideoTrack

  const isConnecting = !isLocalUser && (connectionState === 'new' || connectionState === 'connecting')
  const isFailed = !isLocalUser && (connectionState === 'failed' || connectionState === 'closed')
  const isDisconnected = !isLocalUser && connectionState === 'disconnected'

  const initial = displayName.charAt(0).toUpperCase()

  return (
    <div
      className={`${styles.tile} ${isSpeaking ? styles.speaking : ''}`}
      data-local={isLocalUser}
      data-screenshare={isScreenSharing}
      data-userid={userId}
      data-video-off={!videoEnabled}
      data-connection={connectionState}
    >
      <video
        ref={node => {
          videoRef.current = node
          if (!isLocalUser && provideMediaRef) {
            provideMediaRef(userId, node)
          }
        }}
        className={styles.video}
        style={showVideo ? undefined : { display: 'none' }}
        autoPlay
        playsInline
        muted={isLocalUser}
      />

      {!showVideo && (
        <div className={styles.placeholder}>
          <div className={styles.initial}>{initial}</div>
        </div>
      )}

      {isConnecting && (
        <div className={styles.connectionOverlay}>
          <Loader2 size={20} className={styles.spinner} />
          <span>Connecting...</span>
        </div>
      )}

      {isFailed && (
        <div className={`${styles.connectionOverlay} ${styles.failed}`}>
          <AlertTriangle size={20} />
          <span>Connection failed</span>
        </div>
      )}

      {isDisconnected && (
        <div className={`${styles.connectionOverlay} ${styles.disconnected}`}>
          <Loader2 size={20} className={styles.spinner} />
          <span>Reconnecting...</span>
        </div>
      )}

      <div className={styles.overlay}>
        <div className={styles.label}>{displayName}</div>
      </div>

      {!audioEnabled && (
        <div className={styles.mutedBadge}>
          <MicOff size={14} />
        </div>
      )}
    </div>
  )
}
