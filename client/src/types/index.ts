// ── Identity ──────────────────────────────────────────────

export interface UserIdentity {
  publicKey: string; // base64-encoded Ed25519 public key
  privateKey: string; // base64-encoded Ed25519 private key
  createdAt: number;
  humanityCredential?: HumanityCredential;
}

export interface HumanityCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  userId: string; // app-scoped user ID from HP
  isHuman: boolean;
  verifiedAt?: number;
}

// ── Contacts ─────────────────────────────────────────────

export interface Contact {
  publicKey: string; // base64-encoded Ed25519 public key (unique ID)
  name: string; // user-set display name
  addedAt: number;
  lastSeen?: number;
}

// ── Messages ─────────────────────────────────────────────

export type MessageType = "text" | "file";

export interface ChatMessage {
  id: string;
  contactPublicKey: string;
  type: MessageType;
  text: string;
  fileName?: string;
  fileSize?: number;
  timestamp: number;
  fromMe: boolean;
  read: boolean;
}

// ── Signaling ────────────────────────────────────────────

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
  payload?: unknown;
  senderPublicKey?: string;
}

export interface SdpPayload {
  sdp: RTCSessionDescriptionInit;
}

export interface IceCandidatePayload {
  candidate: RTCIceCandidateInit;
}

// ── Presence ─────────────────────────────────────────────

export interface PresenceEntry {
  publicKey: string;
  roomId: string;
  timestamp: number;
}

// ── Connection QR / Link ─────────────────────────────────

export interface ConnectionInvite {
  publicKey: string; // inviter's public key
  signalingUrl: string; // signaling server URL
}

// ── WebRTC ───────────────────────────────────────────────

export type PeerConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

export interface DataChannelMessage {
  type:
    | "chat"
    | "typing"
    | "read-receipt"
    | "file-meta"
    | "file-chunk"
    | "call-offer"
    | "call-accept"
    | "call-reject"
    | "call-end"
    | "call-media-state"
    | "sdp-renegotiate-offer"
    | "sdp-renegotiate-answer"
    | "ice-renegotiate";
  payload: unknown;
}

export interface ChatPayload {
  id: string;
  text: string;
  timestamp: number;
}

export interface TypingPayload {
  isTyping: boolean;
}

export interface ReadReceiptPayload {
  messageId: string;
}

export interface FileMetaPayload {
  id: string;
  name: string;
  size: number;
  totalChunks: number;
}

export interface FileChunkPayload {
  fileId: string;
  chunkIndex: number;
  data: string; // base64-encoded chunk
}

// ── Call ────────────────────────────────────────────────

export type CallType = "audio" | "video";

export type CallState =
  | "idle"
  | "outgoing-ringing"
  | "incoming-ringing"
  | "active"
  | "ended"
  | "error";

export type CallErrorReason =
  | "permission-denied"
  | "call-failed"
  | "media-error";

export interface CallOfferPayload {
  callType: CallType;
}

export interface CallAcceptPayload {
  callType: CallType;
}

export interface CallRejectPayload {
  reason?: string;
}

export type CallEndPayload = Record<string, never>;

export interface CallMediaStatePayload {
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export interface SdpRenegotiatePayload {
  sdp: RTCSessionDescriptionInit;
}

export interface IceRenegotiatePayload {
  candidate: RTCIceCandidateInit;
}
