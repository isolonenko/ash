// ── Types ────────────────────────────────────────────────

export interface SignalingMessage {
  type: string;
  roomId: string;
  payload?: unknown;
  peerId?: string;
  targetPeerId?: string;
  displayName?: string;
}

export const ALLOWED_SIGNAL_TYPES = [
  "sdp-offer",
  "sdp-answer",
  "ice-candidate",
] as const;

export const MAX_ROOM_SIZE = 6;

// ── Pure Functions ───────────────────────────────────────

export const extractPeerIdFromTags = (
  tags: readonly string[],
): string | undefined => tags.find((t) => t.startsWith("peer:"))?.slice(5);

export const extractDisplayNameFromTags = (
  tags: readonly string[],
): string | undefined => tags.find((t) => t.startsWith("name:"))?.slice(5);

export const extractRoomIdFromTags = (tags: readonly string[]): string =>
  tags.find((t) => t.startsWith("room:"))?.slice(5) ?? "unknown";

export const buildPeerJoinedMessage = (
  roomId: string,
  peerId?: string,
  displayName?: string,
): string =>
  JSON.stringify({
    type: "peer-joined",
    roomId,
    peerId,
    displayName,
  });

/**
 * Sent to the joiner for each peer already in the room.
 * The joiner should prepare a PeerConnection but NOT create an offer —
 * the existing peer will initiate the offer via `peer-joined`.
 * This eliminates SDP glare when both sides try to offer simultaneously.
 */
export const buildPeerExistingMessage = (
  roomId: string,
  peerId?: string,
  displayName?: string,
): string =>
  JSON.stringify({
    type: "peer-existing",
    roomId,
    peerId,
    displayName,
  });

export const buildPeerLeftMessage = (
  roomId: string,
  peerId?: string,
): string =>
  JSON.stringify({
    type: "peer-left",
    roomId,
    peerId,
  });

export const buildTargetedMessage = (
  roomId: string,
  senderPeerId: string,
  targetPeerId: string,
  message: SignalingMessage,
): string =>
  JSON.stringify({
    ...message,
    roomId,
    peerId: senderPeerId,
    targetPeerId,
  });

export const isAllowedSignalType = (type: string): boolean =>
  (ALLOWED_SIGNAL_TYPES as readonly string[]).includes(type);

export const broadcastToOthers = (
  allSockets: WebSocket[],
  sender: WebSocket,
  message: string,
): void => {
  for (const peer of allSockets) {
    if (peer !== sender) {
      try {
        peer.send(message);
      } catch {
        // peer may be closing — safe to ignore
      }
    }
  }
};

export const buildSocketTags = (
  roomId: string,
  peerId?: string,
  displayName?: string,
): string[] => {
  const tags = [`room:${roomId}`];
  if (peerId) {
    tags.push(`peer:${peerId}`);
  }
  if (displayName) {
    tags.push(`name:${displayName}`);
  }
  return tags;
};

export const parseSignalingMessage = (
  data: string,
): SignalingMessage | null => {
  try {
    return JSON.parse(data) as SignalingMessage;
  } catch {
    return null;
  }
};
