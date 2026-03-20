import { useState, useEffect, useCallback } from "react";
import type { PeerState } from "@/types";
import styles from "./ConnectionStatus.module.sass";

// ── Types ────────────────────────────────────────────────

interface ConnectionStatusProps {
  signalingConnected: boolean;
  peers: Map<string, PeerState>;
  localPeerId: string;
}

interface PeerDebugSnapshot {
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
  dataChannelState: RTCDataChannelState | "none";
  audioTracks: number;
  videoTracks: number;
  displayName: string | null;
}

// ── State color mapping ──────────────────────────────────

type StatusColor = "green" | "yellow" | "red" | "muted";

function connectionColor(state: RTCPeerConnectionState): StatusColor {
  switch (state) {
    case "connected":
      return "green";
    case "connecting":
    case "new":
      return "yellow";
    case "disconnected":
    case "failed":
    case "closed":
      return "red";
    default:
      return "muted";
  }
}

function iceColor(state: RTCIceConnectionState): StatusColor {
  switch (state) {
    case "connected":
    case "completed":
      return "green";
    case "checking":
    case "new":
      return "yellow";
    case "disconnected":
    case "failed":
    case "closed":
      return "red";
    default:
      return "muted";
  }
}

function gatheringColor(state: RTCIceGatheringState): StatusColor {
  switch (state) {
    case "complete":
      return "green";
    case "gathering":
      return "yellow";
    case "new":
      return "muted";
    default:
      return "muted";
  }
}

function dataChannelColor(state: RTCDataChannelState | "none"): StatusColor {
  switch (state) {
    case "open":
      return "green";
    case "connecting":
      return "yellow";
    case "closing":
    case "closed":
      return "red";
    case "none":
      return "muted";
    default:
      return "muted";
  }
}

// ── Dot indicator ────────────────────────────────────────

function Dot({ color }: { color: StatusColor }) {
  return <span className={`${styles.dot} ${styles[color]}`} />;
}

// ── Component ────────────────────────────────────────────

export const ConnectionStatus = ({
  signalingConnected,
  peers,
  localPeerId,
}: ConnectionStatusProps) => {
  const [collapsed, setCollapsed] = useState(true);
  const [snapshots, setSnapshots] = useState<Map<string, PeerDebugSnapshot>>(
    () => new Map(),
  );

  // Poll peer connection states every 500ms (RTCPeerConnection state
  // changes don't trigger React re-renders, so we poll)
  const captureSnapshots = useCallback(() => {
    const next = new Map<string, PeerDebugSnapshot>();
    for (const [peerId, peer] of peers) {
      const pc = peer.connection;
      const dc = peer.dataChannel;
      const rs = peer.remoteStream;

      next.set(peerId, {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        signalingState: pc.signalingState,
        dataChannelState: dc ? dc.readyState : "none",
        audioTracks: rs?.getAudioTracks().length ?? 0,
        videoTracks: rs?.getVideoTracks().length ?? 0,
        displayName: peer.displayName,
      });
    }
    setSnapshots(next);
  }, [peers]);

  useEffect(() => {
    captureSnapshots();
    const interval = setInterval(captureSnapshots, 500);
    return () => clearInterval(interval);
  }, [captureSnapshots]);

  // ── Overall health indicator ────────────────────────
  const overallColor: StatusColor = (() => {
    if (!signalingConnected) return "red";
    if (snapshots.size === 0) return "muted";

    let hasYellow = false;
    for (const [, snap] of snapshots) {
      if (
        snap.connectionState === "failed" ||
        snap.iceConnectionState === "failed"
      )
        return "red";
      if (
        snap.connectionState !== "connected" ||
        snap.iceConnectionState !== "connected"
      )
        hasYellow = true;
    }
    return hasYellow ? "yellow" : "green";
  })();

  return (
    <div className={styles.overlay}>
      <button
        className={styles.toggle}
        onClick={() => setCollapsed((prev) => !prev)}
        title="Connection debug info"
        type="button"
      >
        <Dot color={overallColor} />
        <span className={styles.toggleLabel}>
          {collapsed ? "DBG" : "Debug"}
        </span>
      </button>

      {!collapsed && (
        <div className={styles.panel}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>Signaling WS</div>
            <div className={styles.row}>
              <Dot color={signalingConnected ? "green" : "red"} />
              <span>{signalingConnected ? "Connected" : "Disconnected"}</span>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>Local</div>
            <div className={styles.row}>
              <span className={styles.label}>Peer ID</span>
              <span className={styles.mono}>{localPeerId.slice(0, 8)}…</span>
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
                <span className={styles.label}>ICE</span>
                <Dot color={iceColor(snap.iceConnectionState)} />
                <span>{snap.iceConnectionState}</span>
              </div>

              <div className={styles.row}>
                <span className={styles.label}>ICE Gather</span>
                <Dot color={gatheringColor(snap.iceGatheringState)} />
                <span>{snap.iceGatheringState}</span>
              </div>

              <div className={styles.row}>
                <span className={styles.label}>Signaling</span>
                <span>{snap.signalingState}</span>
              </div>

              <div className={styles.row}>
                <span className={styles.label}>DataChannel</span>
                <Dot color={dataChannelColor(snap.dataChannelState)} />
                <span>{snap.dataChannelState}</span>
              </div>

              <div className={styles.row}>
                <span className={styles.label}>Tracks</span>
                <span>
                  🎤{snap.audioTracks} 📹{snap.videoTracks}
                </span>
              </div>
            </div>
          ))}

          {snapshots.size === 0 && (
            <div className={styles.empty}>No peers connected</div>
          )}
        </div>
      )}
    </div>
  );
};
