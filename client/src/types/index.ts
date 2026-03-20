// ── Room ──────────────────────────────────────────────────

export interface RoomInfo {
  id: string;
  participantCount: number;
  maxSize: number;
}

// ── Participant (local and remote) ────────────────────────

export interface Participant {
  peerId: string;
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  stream: MediaStream | null;
  isSpeaking: boolean;
}

// ── Messages (ephemeral chat) ────────────────────────────

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  fromMe: boolean;
}

// ── Signaling ─────────────────────────────────────────────

export type SignalingMessageType =
  | "join"
  | "leave"
  | "sdp-offer"
  | "sdp-answer"
  | "ice-candidate"
  | "peer-joined"
  | "peer-left"
  | "error";

export interface SignalingMessage {
  type: SignalingMessageType;
  roomId: string;
  peerId?: string;
  targetPeerId?: string;
  displayName?: string;
  payload?: unknown;
}

export interface SdpPayload {
  sdp: RTCSessionDescriptionInit;
}

export interface IceCandidatePayload {
  candidate: RTCIceCandidateInit;
}

// ── DataChannel (chat-only, no file transfer) ────────────

export type DataChannelMessageType = "chat" | "media-state";

export interface DataChannelMessage {
  type: DataChannelMessageType;
  payload: unknown;
}

export interface ChatPayload {
  id: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface MediaStatePayload {
  audioEnabled: boolean;
  videoEnabled: boolean;
}

// ── Connection ────────────────────────────────────────────

export type PeerConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

// ── Room state (for useRoom hook) ─────────────────────────

export type RoomPhase = "landing" | "preview" | "joined" | "error";

// ── Mesh (multi-peer WebRTC) ─────────────────────────────

export interface PeerState {
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  remoteStream: MediaStream | null;
  displayName: string | null;
}

// ── Signaling Context ────────────────────────────────────

export interface SignalingContextValue {
  /** Whether the WebSocket is currently connected */
  connected: boolean;
  /** Connect to a room's signaling channel */
  connect: (roomId: string, peerId: string, displayName: string) => void;
  /** Disconnect from signaling */
  disconnect: () => void;
  /** Send a signaling message to a specific peer */
  send: (msg: SignalingMessage, targetPeerId: string) => void;
  /** Register a handler for incoming signaling messages. Returns unsubscribe function. */
  onMessage: (handler: (msg: SignalingMessage) => void) => () => void;
  /** Register a handler for signaling errors. Returns unsubscribe function. */
  onError: (handler: (error: "room-full" | "unknown") => void) => () => void;
}

// ── Audio Processing ─────────────────────────────────────

export interface AudioProcessingState {
  /** Whether the audio processing pipeline is active */
  isEnabled: boolean;
  /** Whether the pipeline is currently loading (WASM, worklets) */
  isLoading: boolean;
  /** Error message if pipeline failed to initialize */
  error: string | null;
}

// ── Media Context ────────────────────────────────────────

export interface MediaContextValue {
  /** The local MediaStream (null until acquired) */
  localStream: MediaStream | null;
  /** Whether audio track is enabled */
  audioEnabled: boolean;
  /** Whether video track is enabled */
  videoEnabled: boolean;
  /** Whether media has been acquired (even if getUserMedia failed) */
  ready: boolean;
  /** Acquire camera + mic. Resolves with the stream or throws. */
  acquire: () => Promise<MediaStream>;
  /** Toggle audio track on/off */
  toggleAudio: () => void;
  /** Toggle video track on/off */
  toggleVideo: () => void;
  /** Get current local tracks + stream for adding to peer connections */
  getLocalTracks: () => {
    tracks: MediaStreamTrack[];
    stream: MediaStream;
  } | null;
  /** Stop all tracks and release media */
  release: () => void;
  /** Current state of the audio processing pipeline */
  audioProcessing: AudioProcessingState;
  /** Toggle noise suppression on/off — swaps audio track in all peer connections */
  toggleNoiseSuppression: () => void;
  /** Register a callback for replacing audio tracks in peer connections */
  setReplaceTrackCallback: (cb: (track: MediaStreamTrack) => void) => void;
}

// ── Network quality ──────────────────────────────────────
export type NetworkTier = "high" | "medium" | "low";
