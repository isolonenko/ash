// ── Types ────────────────────────────────────────────────

export interface SignalingMessage {
  type: string;
  roomId: string;
  payload?: unknown;
  senderPublicKey?: string;
}

export const ALLOWED_SIGNAL_TYPES = [
  "sdp-offer",
  "sdp-answer",
  "ice-candidate",
] as const;

export const MAX_ROOM_SIZE = 2;

// ── Pure Functions ───────────────────────────────────────

export const extractPublicKeyFromTags = (tags: readonly string[]): string | undefined =>
  tags.find((t) => t.startsWith("pk:"))?.slice(3);

export const extractRoomIdFromTags = (tags: readonly string[]): string =>
  tags.find((t) => t.startsWith("room:"))?.slice(5) ?? "unknown";

export const buildPeerJoinedMessage = (roomId: string, publicKey?: string): string =>
  JSON.stringify({
    type: "peer-joined",
    roomId,
    senderPublicKey: publicKey,
  });

export const buildPeerLeftMessage = (roomId: string, publicKey?: string): string =>
  JSON.stringify({
    type: "peer-left",
    roomId,
    senderPublicKey: publicKey,
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
  publicKey?: string,
): string[] => {
  const tags = [`room:${roomId}`];
  if (publicKey) {
    tags.push(`pk:${publicKey}`);
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
