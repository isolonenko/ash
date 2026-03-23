// ── RTCClient state machine ─────────────────────────────
export type RTCClientState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

// ── Error types ─────────────────────────────────────────
export interface RTCClientError {
  type: 'room-full' | 'media-denied' | 'media-not-found' | 'signaling-failed' | 'unknown';
  message: string;
}

// ── Peer snapshot (read-only view for store/UI) ─────────
export interface PeerSnapshot {
  displayName: string;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

// ── RTCClient options ───────────────────────────────────
export interface RTCClientOptions {
  roomId: string;
  peerId: string;
  displayName: string;
}

// ── RTCClient event map ─────────────────────────────────
export interface RTCClientEvents {
  'connection-state': (state: RTCClientState) => void;
  'media-acquired': (stream: MediaStream) => void;
  'media-changed': (info: { isMicEnabled: boolean; isCamEnabled: boolean }) => void;
  'media-released': () => void;
  'peer-added': (peerId: string, displayName: string) => void;
  'peer-removed': (peerId: string) => void;
  'peer-stream': (peerId: string, stream: MediaStream) => void;
  'peer-stream-removed': (peerId: string) => void;
  'peer-connection-state': (peerId: string, state: RTCPeerConnectionState) => void;
  'peer-media-state': (peerId: string, state: { audioEnabled: boolean; videoEnabled: boolean }) => void;
  'message': (msg: ChatMessage) => void;
  'error': (error: RTCClientError) => void;
}

// ── Manager event maps ──────────────────────────────────
export interface MediaManagerEvents {
  'acquired': (stream: MediaStream) => void;
  'changed': (info: { isMicEnabled: boolean; isCamEnabled: boolean }) => void;
  'released': () => void;
  'error': (error: RTCClientError) => void;
}

export interface SignalingManagerEvents {
  'message': (msg: import('@/types').SignalingMessage) => void;
  'connection-change': (connected: boolean) => void;
  'error': (error: 'room-full' | 'unknown') => void;
  'reconnected': () => void;
}

export interface PeerManagerEvents {
  'peer-added': (peerId: string, displayName: string) => void;
  'peer-removed': (peerId: string) => void;
  'peer-stream': (peerId: string, stream: MediaStream) => void;
  'peer-stream-removed': (peerId: string) => void;
  'peer-connection-state': (peerId: string, state: RTCPeerConnectionState) => void;
  'peer-media-state': (peerId: string, state: { audioEnabled: boolean; videoEnabled: boolean }) => void;
  'message': (peerId: string, msg: DataChannelMessage) => void;
}

// ── DataChannel message types ───────────────────────────
// Re-export relevant types from main types file for convenience
import type { ChatMessage, DataChannelMessage } from '@/types';
export type { ChatMessage, DataChannelMessage };

// ── Internal peer state (used only inside PeerManager) ──
export interface InternalPeer {
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  remoteStream: MediaStream | null;
  displayName: string;
  iceRestartAttempts: number;
  iceCandidateQueue: RTCIceCandidate[];
  audioEnabled: boolean;
  videoEnabled: boolean;
}
