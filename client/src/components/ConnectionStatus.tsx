import { useState, useEffect, useCallback } from 'react'
import type { RTCClientState, PeerSnapshot, ConnectSubState } from '@/lib/rtc'
import styles from './ConnectionStatus.module.sass'

// ── Types ────────────────────────────────────────────────

interface ConnectionStatusProps {
  connectionState: RTCClientState
  connectSubState: ConnectSubState
  signalingConnected: boolean
  peers: Map<string, PeerSnapshot>
  localPeerId: string
  onRetry?: () => void
  reconnectAttempt?: number
  reconnectMaxAttempts?: number
}

// ── Constants ────────────────────────────────────────────

const CONNECT_STEPS: Array<{ key: NonNullable<ConnectSubState>; label: string }> = [
  { key: 'fetching-turn', label: 'Connecting to relay' },
  { key: 'acquiring-media', label: 'Acquiring media' },
  { key: 'selecting-codec', label: 'Selecting codec' },
  { key: 'opening-signaling', label: 'Opening signaling' },
  { key: 'negotiating-peers', label: 'Negotiating peers' },
]

// ── State color mapping ──────────────────────────────────

type StatusColor = 'green' | 'yellow' | 'red' | 'muted'

function connectionColor(state: RTCPeerConnectionState): StatusColor {
  switch (state) {
    case 'connected':
      return 'green'
    case 'connecting':
    case 'new':
      return 'yellow'
    case 'disconnected':
    case 'failed':
    case 'closed':
      return 'red'
    default:
      return 'muted'
  }
}

// ── Dot indicator ────────────────────────────────────────

function Dot({ color, pulse }: { color: StatusColor; pulse?: boolean }) {
  const className = [styles.dot, styles[color], pulse ? styles.pulse : ''].filter(Boolean).join(' ')
  return <span className={className} />
}

// ── Progress Bar (connecting state) ──────────────────────

function ProgressBar({ connectSubState }: { connectSubState: ConnectSubState }) {
  const activeIndex = connectSubState
    ? CONNECT_STEPS.findIndex(s => s.key === connectSubState)
    : -1
  const activeStep = activeIndex >= 0 ? CONNECT_STEPS[activeIndex] : null

  return (
    <div className={styles.progressBar}>
      <div className={styles.segments}>
        {CONNECT_STEPS.map((step, i) => {
          let segmentClass = styles.segment
          if (i < activeIndex) segmentClass += ` ${styles.completed}`
          else if (i === activeIndex) segmentClass += ` ${styles.active}`
          else segmentClass += ` ${styles.pending}`
          return <div key={step.key} className={segmentClass} />
        })}
      </div>
      {activeStep && (
        <span className={styles.stepLabel}>
          {activeStep.label} &bull; {activeIndex + 1}/{CONNECT_STEPS.length}
        </span>
      )}
    </div>
  )
}

// ── Debug Panel ──────────────────────────────────────────

function DebugPanel({
  signalingConnected,
  peers,
  localPeerId,
}: {
  signalingConnected: boolean
  peers: Map<string, PeerSnapshot>
  localPeerId: string
}) {
  const [snapshots, setSnapshots] = useState<Map<string, PeerSnapshot>>(() => new Map())

  const captureSnapshots = useCallback(() => {
    setSnapshots(new Map(peers))
  }, [peers])

  useEffect(() => {
    const interval = setInterval(captureSnapshots, 500)
    return () => clearInterval(interval)
  }, [captureSnapshots])

  return (
    <div className={styles.debugPanel}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>Signaling WS</div>
        <div className={styles.row}>
          <Dot color={signalingConnected ? 'green' : 'red'} />
          <span>{signalingConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>Local</div>
        <div className={styles.row}>
          <span className={styles.label}>Peer ID</span>
          <span className={styles.mono}>{localPeerId.slice(0, 8)}...</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Peers</span>
          <span>{snapshots.size}</span>
        </div>
      </div>

      {Array.from(snapshots).map(([peerId, snap]) => (
        <div className={styles.section} key={peerId}>
          <div className={styles.sectionHeader}>
            <Dot color={connectionColor(snap.connectionState)} />
            {snap.displayName ?? peerId.slice(0, 8)}
          </div>

          <div className={styles.row}>
            <span className={styles.label}>Connection</span>
            <Dot color={connectionColor(snap.connectionState)} />
            <span>{snap.connectionState}</span>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>Audio</span>
            <span>{snap.audioEnabled ? 'On' : 'Off'}</span>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>Video</span>
            <span>{snap.videoEnabled ? 'On' : 'Off'}</span>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>Tracks</span>
            <span>
              {snap.stream
                ? `A:${snap.stream.getAudioTracks().length} V:${snap.stream.getVideoTracks().length}`
                : 'No stream'}
            </span>
          </div>
        </div>
      ))}

      {snapshots.size === 0 && <div className={styles.empty}>No peers connected</div>}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────

export const ConnectionStatus = ({
  connectionState,
  connectSubState,
  signalingConnected,
  peers,
  localPeerId,
  onRetry,
  reconnectAttempt,
  reconnectMaxAttempts,
}: ConnectionStatusProps) => {
  const [debugOpen, setDebugOpen] = useState(false)

  if (connectionState === 'idle') return null

  if (connectionState === 'connecting') {
    return (
      <div className={styles.strip}>
        <ProgressBar connectSubState={connectSubState} />
      </div>
    )
  }

  if (connectionState === 'failed') {
    return (
      <div className={`${styles.strip} ${styles.failedStrip}`}>
        <Dot color="red" />
        <span className={styles.statusText}>Connection failed</span>
        {onRetry && (
          <button className={styles.retryBtn} onClick={onRetry} type="button">
            Retry
          </button>
        )}
      </div>
    )
  }

  if (connectionState === 'reconnecting') {
    return (
      <div className={`${styles.strip} ${styles.reconnectingStrip}`}>
        <Dot color="yellow" pulse />
        <span className={styles.statusText}>
          Reconnecting...
          {reconnectAttempt != null && reconnectMaxAttempts != null && (
            <> attempt {reconnectAttempt}/{reconnectMaxAttempts}</>
          )}
        </span>
      </div>
    )
  }

  return (
    <div className={styles.connectedWrapper}>
      <button
        className={styles.pill}
        onClick={() => setDebugOpen(prev => !prev)}
        title="Connection debug info"
        type="button"
      >
        <Dot color="green" />
        <span>Connected</span>
        <span className={styles.peerCount}>&bull; {peers.size} {peers.size === 1 ? 'peer' : 'peers'}</span>
      </button>

      {debugOpen && (
        <DebugPanel
          signalingConnected={signalingConnected}
          peers={peers}
          localPeerId={localPeerId}
        />
      )}
    </div>
  )
}
