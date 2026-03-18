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
