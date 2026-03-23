// ── Imports ─────────────────────────────────────────────
import type { ChatMessage, DataChannelMessage, SignalingMessage } from '@/types'

// ── RTCClient state machine ─────────────────────────────
export type RTCClientState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

// ── Media state toggle ───────────────────────────────────
/**
 * Represents the enabled/disabled state of media devices.
 * Used across multiple event handlers for consistency.
 */
export interface MediaToggleState {
  isMicEnabled: boolean
  isCamEnabled: boolean
}

// ── Error types ─────────────────────────────────────────
/**
 * Error types emitted by RTCClient when operations fail.
 * - room-full: Room has reached maximum capacity
 * - media-denied: User denied camera/microphone permissions
 * - media-not-found: No camera/microphone devices found
 * - signaling-failed: WebSocket connection to signaling server failed
 * - unknown: Unexpected error occurred
 */
export interface RTCClientError {
  type: 'room-full' | 'media-denied' | 'media-not-found' | 'signaling-failed' | 'unknown'
  message: string
}

// ── Peer snapshot (read-only view for store/UI) ─────────
export interface PeerSnapshot {
  readonly displayName: string
  readonly stream: MediaStream | null
  readonly connectionState: RTCPeerConnectionState
  readonly audioEnabled: boolean
  readonly videoEnabled: boolean
}

// ── RTCClient options ───────────────────────────────────
export interface RTCClientOptions {
  roomId: string
  peerId: string
  displayName: string
}

// ── RTCClient event map ─────────────────────────────────
export interface RTCClientEvents {
  'connection-state': (state: RTCClientState) => void
  'media-acquired': (stream: MediaStream) => void
  'media-changed': (info: MediaToggleState) => void
  'media-released': () => void
  'peer-added': (peerId: string, displayName: string) => void
  'peer-removed': (peerId: string) => void
  'peer-stream': (peerId: string, stream: MediaStream) => void
  'peer-stream-removed': (peerId: string) => void
  'peer-connection-state': (peerId: string, state: RTCPeerConnectionState) => void
  'peer-media-state': (peerId: string, state: MediaToggleState) => void
  message: (msg: ChatMessage) => void
  error: (error: RTCClientError) => void
}

// ── Manager event maps ──────────────────────────────────
export interface MediaManagerEvents {
  acquired: (stream: MediaStream) => void
  changed: (info: MediaToggleState) => void
  released: () => void
  error: (error: RTCClientError) => void
}

export interface SignalingManagerEvents {
  message: (msg: SignalingMessage) => void
  'connection-change': (connected: boolean) => void
  error: (error: 'room-full' | 'unknown') => void
  reconnected: () => void
}

export interface PeerManagerEvents {
  'peer-added': (peerId: string, displayName: string) => void
  'peer-removed': (peerId: string) => void
  'peer-stream': (peerId: string, stream: MediaStream) => void
  'peer-stream-removed': (peerId: string) => void
  'peer-connection-state': (peerId: string, state: RTCPeerConnectionState) => void
  'peer-media-state': (peerId: string, state: MediaToggleState) => void
  message: (peerId: string, msg: DataChannelMessage) => void
}

// ── Internal peer state (used only inside PeerManager) ──
/**
 * Internal peer state managed by PeerManager.
 * NOT exposed to UI/store — use PeerSnapshot for read-only access.
 */
export interface InternalPeer {
  connection: RTCPeerConnection
  dataChannel: RTCDataChannel | null
  remoteStream: MediaStream | null
  displayName: string
  iceRestartAttempts: number
  iceCandidateQueue: RTCIceCandidate[]
  audioEnabled: boolean
  videoEnabled: boolean
}

// ── Re-export convenience types ──────────────────────────
export type { ChatMessage, DataChannelMessage }
