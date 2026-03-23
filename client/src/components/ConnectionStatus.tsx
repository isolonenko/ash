import { useState, useEffect, useCallback } from 'react'
import type { PeerSnapshot } from '@/lib/rtc'
import styles from './ConnectionStatus.module.sass'

// ── Types ────────────────────────────────────────────────

interface ConnectionStatusProps {
  signalingConnected: boolean
  peers: Map<string, PeerSnapshot>
  localPeerId: string
}

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

function Dot({ color }: { color: StatusColor }) {
  return <span className={`${styles.dot} ${styles[color]}`} />
}

// ── Component ────────────────────────────────────────────

export const ConnectionStatus = ({ signalingConnected, peers, localPeerId }: ConnectionStatusProps) => {
  const [collapsed, setCollapsed] = useState(true)
  const [snapshots, setSnapshots] = useState<Map<string, PeerSnapshot>>(() => new Map())

  // Poll peer snapshots every 500ms for consistent rendering
  const captureSnapshots = useCallback(() => {
    setSnapshots(new Map(peers))
  }, [peers])

  useEffect(() => {
    const interval = setInterval(captureSnapshots, 500)
    return () => clearInterval(interval)
  }, [captureSnapshots])

  // ── Overall health indicator ────────────────────────
  const overallColor: StatusColor = (() => {
    if (!signalingConnected) return 'red'
    if (snapshots.size === 0) return 'muted'

    let hasYellow = false
    for (const [, snap] of snapshots) {
      if (snap.connectionState === 'failed') return 'red'
      if (snap.connectionState !== 'connected') hasYellow = true
    }
    return hasYellow ? 'yellow' : 'green'
  })()

  return (
    <div className={styles.overlay}>
      <button
        className={styles.toggle}
        onClick={() => setCollapsed(prev => !prev)}
        title="Connection debug info"
        type="button"
      >
        <Dot color={overallColor} />
        <span className={styles.toggleLabel}>{collapsed ? 'DBG' : 'Debug'}</span>
      </button>

      {!collapsed && (
        <div className={styles.panel}>
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
      )}
    </div>
  )
}
