import { useState, useCallback, useRef, useEffect } from "react";
import type {
  PeerConnectionState,
  DataChannelMessage,
  SignalingMessage,
  ChatPayload,
  TypingPayload,
  SdpRenegotiatePayload,
  IceRenegotiatePayload,
} from "@shared/types";
import { createWebRTCManager } from "@/lib/webrtc";
import {
  createSignalingClient,
  publishPresence,
  lookupPresence,
} from "@/lib/signaling";

// ── Options ──────────────────────────────────────────────

interface UseConnectionOptions {
  publicKey: string;
  onChatMessage?: (payload: ChatPayload) => void;
  onTyping?: (isTyping: boolean) => void;
  onFileReceived?: (name: string, data: Uint8Array) => void;
  onPeerIdentified?: (peerPublicKey: string) => void;
  onCallSignal?: (msg: DataChannelMessage) => void;
  onRemoteTrack?: (event: RTCTrackEvent) => void;
}

interface UseConnectionResult {
  connectionState: PeerConnectionState;
  connectedPeerKey: string | null;
  presenceRoomId: string | null;
  isConnecting: boolean;
  rtcManager: ReturnType<typeof createWebRTCManager> | null;
  connectTo: (peerPublicKey: string) => Promise<void>;
  sendChat: (id: string, text: string) => void;
  sendTyping: (isTyping: boolean) => void;
  sendFile: (file: File) => Promise<string>;
  sendCallSignal: (msg: DataChannelMessage) => void;
  disconnect: () => void;
}

// ── File reassembly ──────────────────────────────────────

interface IncomingFile {
  name: string;
  size: number;
  totalChunks: number;
  chunks: Map<number, string>;
}

// ── Presence re-publish interval ─────────────────────────

const PRESENCE_INTERVAL = 120_000; // 2 minutes

export const useConnection = (
  options: UseConnectionOptions,
): UseConnectionResult => {
  const [connectionState, setConnectionState] =
    useState<PeerConnectionState>("new");
  const [connectedPeerKey, setConnectedPeerKey] = useState<string | null>(null);
  const [presenceRoomId, setPresenceRoomId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const rtcRef = useRef<ReturnType<typeof createWebRTCManager> | null>(null);
  const signalingRef = useRef<ReturnType<typeof createSignalingClient> | null>(
    null,
  );
  const incomingFiles = useRef<Map<string, IncomingFile>>(new Map());
  const presenceRoomRef = useRef<string | null>(null);
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const relistenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Monotonically increasing connection ID to ignore stale callbacks from old connections
  const connectionIdRef = useRef(0);
  // Mutex: true while connectTo is in-flight (prevents duplicate calls)
  const connectingRef = useRef(false);

  // Use ref for callbacks to avoid stale closures
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // ── DataChannel message handler ────────────────────────

  const handleDataChannelMessage = useCallback(
    (msg: DataChannelMessage) => {
      switch (msg.type) {
        case "chat": {
          const payload = msg.payload as ChatPayload;
          optionsRef.current.onChatMessage?.(payload);
          break;
        }
        case "typing": {
          const payload = msg.payload as TypingPayload;
          optionsRef.current.onTyping?.(payload.isTyping);
          break;
        }
        case "file-meta": {
          const meta = msg.payload as {
            id: string;
            name: string;
            size: number;
            totalChunks: number;
          };
          incomingFiles.current.set(meta.id, {
            name: meta.name,
            size: meta.size,
            totalChunks: meta.totalChunks,
            chunks: new Map(),
          });
          break;
        }
        case "file-chunk": {
          const chunk = msg.payload as {
            fileId: string;
            chunkIndex: number;
            data: string;
          };
          const file = incomingFiles.current.get(chunk.fileId);
          if (!file) break;

          file.chunks.set(chunk.chunkIndex, chunk.data);

          if (file.chunks.size === file.totalChunks) {
            const parts: Uint8Array[] = [];
            for (let i = 0; i < file.totalChunks; i++) {
              const b64 = file.chunks.get(i)!;
              const bytes = Uint8Array.from(atob(b64), (c) =>
                c.charCodeAt(0),
              );
              parts.push(bytes);
            }
            const totalLen = parts.reduce((acc, p) => acc + p.length, 0);
            const combined = new Uint8Array(totalLen);
            let offset = 0;
            parts.forEach((p) => {
              combined.set(p, offset);
              offset += p.length;
            });

            incomingFiles.current.delete(chunk.fileId);
            optionsRef.current.onFileReceived?.(file.name, combined);
          }
          break;
        }
        case "call-offer":
        case "call-accept":
        case "call-reject":
        case "call-end":
        case "call-media-state": {
          optionsRef.current.onCallSignal?.(msg);
          break;
        }
        case "sdp-renegotiate-offer": {
          const payload = msg.payload as SdpRenegotiatePayload;
          rtcRef.current?.handleRenegotiationOffer(payload.sdp);
          break;
        }
        case "sdp-renegotiate-answer": {
          const payload = msg.payload as SdpRenegotiatePayload;
          rtcRef.current?.handleRenegotiationAnswer(payload.sdp);
          break;
        }
        case "ice-renegotiate": {
          const payload = msg.payload as IceRenegotiatePayload;
          rtcRef.current?.handleRenegotiationIceCandidate(payload.candidate);
          break;
        }
      }
    },
    [],
  );

  // ── Core: open signaling + WebRTC to a room ────────────

  const openConnection = useCallback(
    (roomId: string, asInitiator: boolean, peerPublicKey?: string) => {
      rtcRef.current?.close();
      signalingRef.current?.disconnect();

      // Bump connection ID so stale callbacks from the old RTC/signaling are ignored
      const connId = ++connectionIdRef.current;

      const rtc = createWebRTCManager({
        roomId,
        publicKey: options.publicKey,
        peerPublicKey,
        onStateChange: (state) => {
          // Ignore callbacks from a superseded connection
          if (connId !== connectionIdRef.current) return;
          setConnectionState(state);
          if (state === "closed" || state === "failed") {
            setConnectedPeerKey(null);
          }
        },
        onMessage: handleDataChannelMessage,
        onSignalingNeeded: (msg: SignalingMessage) => {
          if (connId !== connectionIdRef.current) return;
          signalingRef.current?.send(msg);
        },
        onTrack: (event: RTCTrackEvent) => {
          if (connId !== connectionIdRef.current) return;
          optionsRef.current.onRemoteTrack?.(event);
        },
      });

      const signaling = createSignalingClient({
        publicKey: options.publicKey,
        onMessage: (msg: SignalingMessage) => {
          if (connId !== connectionIdRef.current) return;
          if (msg.type === "peer-joined") {
            if (
              msg.senderPublicKey &&
              msg.senderPublicKey !== options.publicKey
            ) {
              setConnectedPeerKey(msg.senderPublicKey);
              optionsRef.current.onPeerIdentified?.(msg.senderPublicKey);
            }

            if (asInitiator) {
              rtc.createOffer();
            }
          } else if (msg.type === "peer-left") {
            // Peer left — WebRTC may still be alive via ICE
          } else {
            rtc.handleSignalingMessage(msg);
          }
        },
        onConnectionChange: (_connected: boolean) => {},
      });

      rtcRef.current = rtc;
      signalingRef.current = signaling;
      signaling.connect(roomId);
    },
    [options.publicKey, handleDataChannelMessage],
  );

  // ── Start listening: publish presence + open signaling ──

  useEffect(() => {
    if (!options.publicKey) return;

    const roomId = crypto.randomUUID();
    presenceRoomRef.current = roomId;
    setPresenceRoomId(roomId);

    // Publish presence so others can find us
    publishPresence(options.publicKey, roomId);

    // Re-publish periodically
    presenceIntervalRef.current = setInterval(() => {
      publishPresence(options.publicKey, roomId);
    }, PRESENCE_INTERVAL);

    // Open a signaling WebSocket on this room, waiting for incoming peers
    // We are NOT the initiator — we wait for someone to join and send an offer
    // Actually: whoever joins our room is the one who looked us up, so they
    // expect us to be the answerer. They are the initiator (they found us).
    // But wait — the joiner calls connectTo which does lookupPresence -> joins
    // our room as answerer (asInitiator=false). So WE need to be the initiator.
    //
    // Flow: User A listens on room X (initiator). User B looks up A, joins room X.
    // Server sends peer-joined to A. A creates offer. B gets offer, sends answer.
    openConnection(roomId, true);

    return () => {
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
      }
      if (relistenTimeoutRef.current) {
        clearTimeout(relistenTimeoutRef.current);
      }
      rtcRef.current?.close();
      signalingRef.current?.disconnect();
    };
  }, [options.publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connect to a specific peer ─────────────────────────

  const connectTo = useCallback(
    async (peerPublicKey: string) => {
      if (connectingRef.current) return;
      connectingRef.current = true;
      setIsConnecting(true);

      try {
        // Cancel any pending re-listen from a previous disconnect
        if (relistenTimeoutRef.current) {
          clearTimeout(relistenTimeoutRef.current);
          relistenTimeoutRef.current = null;
        }

        const presence = await lookupPresence(peerPublicKey);

        if (presence?.online && presence.roomId) {
          // Stop re-publishing presence for our own room — we're leaving it
          if (presenceIntervalRef.current) {
            clearInterval(presenceIntervalRef.current);
            presenceIntervalRef.current = null;
          }

          // Peer is listening on their presence room — join it as answerer
          setConnectedPeerKey(peerPublicKey);
          openConnection(presence.roomId, false, peerPublicKey);
        } else {
          // Peer is offline — we're already listening on our own presence room.
          // When they come online and look us up, the connection will happen.
          setConnectionState("new");
        }
      } finally {
        connectingRef.current = false;
        setIsConnecting(false);
      }
    },
    [openConnection],
  );

  // ── Send helpers ───────────────────────────────────────

  const sendChat = useCallback((id: string, text: string) => {
    rtcRef.current?.sendChat(id, text);
  }, []);

  const sendTyping = useCallback((isTyping: boolean) => {
    rtcRef.current?.sendTyping(isTyping);
  }, []);

  const sendFile = useCallback(async (file: File): Promise<string> => {
    if (!rtcRef.current) throw new Error("Not connected");
    return rtcRef.current.sendFile(file);
  }, []);

  const sendCallSignal = useCallback((msg: DataChannelMessage) => {
    rtcRef.current?.send(msg);
  }, []);

  const disconnect = useCallback(() => {
    rtcRef.current?.close();
    signalingRef.current?.disconnect();
    setConnectionState("closed");
    setConnectedPeerKey(null);

    // Re-establish the listener on our presence room
    if (presenceRoomRef.current && options.publicKey) {
      const roomId = presenceRoomRef.current;
      // Cancel any pending re-listen from a previous disconnect
      if (relistenTimeoutRef.current) {
        clearTimeout(relistenTimeoutRef.current);
      }
      // Small delay to let cleanup finish
      relistenTimeoutRef.current = setTimeout(() => {
        relistenTimeoutRef.current = null;
        openConnection(roomId, true);
        publishPresence(options.publicKey, roomId);

        // Restart periodic presence re-publishing
        if (presenceIntervalRef.current) {
          clearInterval(presenceIntervalRef.current);
        }
        presenceIntervalRef.current = setInterval(() => {
          publishPresence(options.publicKey, roomId);
        }, PRESENCE_INTERVAL);
      }, 100);
    }
  }, [options.publicKey, openConnection]);

  return {
    connectionState,
    connectedPeerKey,
    presenceRoomId,
    isConnecting,
    rtcManager: rtcRef.current,
    connectTo,
    sendChat,
    sendTyping,
    sendFile,
    sendCallSignal,
    disconnect,
  };
};
