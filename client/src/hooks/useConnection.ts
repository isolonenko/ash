import { useState, useCallback, useRef, useEffect } from "react";
import type {
  PeerConnectionState,
  DataChannelMessage,
  SignalingMessage,
  ChatPayload,
  TypingPayload,
  SdpRenegotiatePayload,
  IceRenegotiatePayload,
} from "@/types";
import type { IncomingFile } from "@/lib/fileTransfer";
import { handleFileMeta, handleFileChunk } from "@/lib/fileTransfer";
import { createWebRTCManager } from "@/lib/webrtc";
import {
  createSignalingClient,
  publishPresence,
  lookupPresence,
} from "@/lib/signaling";
import { fetchTurnCredentials } from "@/lib/turn";
import {
  PRESENCE_PUBLISH_INTERVAL,
  RELISTEN_DELAY,
  CONNECT_RETRY_ATTEMPTS,
  CONNECT_RETRY_DELAY,
} from "@/lib/constants";

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
  connectionMessage: string | null;
  rtcManager: ReturnType<typeof createWebRTCManager> | null;
  getRtcManager: () => ReturnType<typeof createWebRTCManager> | null;
  connectTo: (peerPublicKey: string) => Promise<void>;
  sendChat: (id: string, text: string) => void;
  sendTyping: (isTyping: boolean) => void;
  sendFile: (file: File) => Promise<string>;
  sendCallSignal: (msg: DataChannelMessage) => void;
  disconnect: () => void;
}

export const useConnection = (
  options: UseConnectionOptions,
): UseConnectionResult => {
  const [connectionState, setConnectionState] =
    useState<PeerConnectionState>("new");
  const [connectedPeerKey, setConnectedPeerKey] = useState<string | null>(null);
  const [presenceRoomId, setPresenceRoomId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(
    null,
  );

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
          handleFileMeta(incomingFiles.current, meta);
          break;
        }
        case "file-chunk": {
          const chunk = msg.payload as {
            fileId: string;
            chunkIndex: number;
            data: string;
          };
          const result = handleFileChunk(incomingFiles.current, chunk);
          if (result) {
            optionsRef.current.onFileReceived?.(result.name, result.data);
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
    async (roomId: string, asInitiator: boolean, peerPublicKey?: string) => {
      rtcRef.current?.close();
      signalingRef.current?.disconnect();

      // Bump connection ID so stale callbacks from the old RTC/signaling are ignored
      const connId = ++connectionIdRef.current;

      // Fetch TURN credentials before creating WebRTC connection
      const turnConfig = await fetchTurnCredentials();

      const rtc = createWebRTCManager({
        roomId,
        publicKey: options.publicKey,
        peerPublicKey,
        iceServers: turnConfig.iceServers,
        iceTransportPolicy: turnConfig.iceTransportPolicy,
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
        onReconnected: () => {
          if (presenceRoomRef.current) {
            publishPresence(options.publicKey, presenceRoomRef.current);
          }
        },
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

    presenceIntervalRef.current = setInterval(() => {
      publishPresence(options.publicKey, roomId);
    }, PRESENCE_PUBLISH_INTERVAL);

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
        if (relistenTimeoutRef.current) {
          clearTimeout(relistenTimeoutRef.current);
          relistenTimeoutRef.current = null;
        }

        const tryLookup = async (attempt: number): Promise<void> => {
          setConnectionMessage(
            attempt === 0
              ? "Looking up peer…"
              : `Retrying lookup (${attempt}/${CONNECT_RETRY_ATTEMPTS})…`,
          );

          const presence = await lookupPresence(peerPublicKey);

          if (presence?.online && presence.roomId) {
            if (presenceIntervalRef.current) {
              clearInterval(presenceIntervalRef.current);
              presenceIntervalRef.current = null;
            }

            setConnectionMessage("Connecting…");
            setConnectedPeerKey(peerPublicKey);
            openConnection(presence.roomId, false, peerPublicKey);
            return;
          }

          if (attempt < CONNECT_RETRY_ATTEMPTS) {
            await new Promise<void>((r) => setTimeout(r, CONNECT_RETRY_DELAY));
            return tryLookup(attempt + 1);
          }

          setConnectionMessage("Peer offline — waiting for them to come online");
          setConnectionState("new");
        };

        await tryLookup(0);
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
    setConnectionMessage(null);

    if (presenceRoomRef.current && options.publicKey) {
      const roomId = presenceRoomRef.current;
      if (relistenTimeoutRef.current) {
        clearTimeout(relistenTimeoutRef.current);
      }
      relistenTimeoutRef.current = setTimeout(() => {
        relistenTimeoutRef.current = null;
        openConnection(roomId, true);
        publishPresence(options.publicKey, roomId);

        if (presenceIntervalRef.current) {
          clearInterval(presenceIntervalRef.current);
        }
        presenceIntervalRef.current = setInterval(() => {
          publishPresence(options.publicKey, roomId);
        }, PRESENCE_PUBLISH_INTERVAL);
      }, RELISTEN_DELAY);
    }
  }, [options.publicKey, openConnection]);

  return {
    connectionState,
    connectedPeerKey,
    presenceRoomId,
    isConnecting,
    connectionMessage,
    rtcManager: rtcRef.current,
    getRtcManager: () => rtcRef.current,
    connectTo,
    sendChat,
    sendTyping,
    sendFile,
    sendCallSignal,
    disconnect,
  };
};
