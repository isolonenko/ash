import { useState, useRef, useCallback, useEffect } from "react";
import type {
  SignalingMessage,
  PeerState,
  SdpPayload,
  IceCandidatePayload,
  DataChannelMessage,
} from "@/types";
import {
  DATA_CHANNEL_LABEL,
  ICE_RESTART_MAX_ATTEMPTS,
  VIDEO_MAX_BITRATE,
  AUDIO_MAX_BITRATE,
} from "@/lib/constants";
import { createSignalingClient } from "@/lib/signaling";
import { fetchTurnCredentials } from "@/lib/turn";

// ── Types ────────────────────────────────────────────────

interface UseMeshOptions {
  /** Our peer ID (unique per session) */
  peerId: string;
  /** Display name for signaling */
  displayName: string;
  /** Room to join */
  roomId: string;
  /** Called when any peer sends a DataChannel message */
  onMessage?: (peerId: string, msg: DataChannelMessage) => void;
  /** Called when a remote track is received from a peer */
  onRemoteTrack?: (peerId: string, event: RTCTrackEvent) => void;
  /** Called when a peer's remote stream is removed */
  onRemoteStreamRemoved?: (peerId: string) => void;
  /** Called when the peer map changes (for re-renders) */
  onPeersChanged?: (peers: Map<string, PeerState>) => void;
}

interface UseMeshResult {
  peers: Map<string, PeerState>;
  sendToAll: (msg: DataChannelMessage) => void;
  addTrackToAll: (track: MediaStreamTrack, stream: MediaStream) => void;
  removeTrackFromAll: (sender: RTCRtpSender) => void;
}

// ── Connection state mapping ─────────────────────────────

const CONNECTION_STATE_MAP: Record<string, string> = {
  new: "new",
  connecting: "connecting",
  connected: "connected",
  disconnected: "disconnected",
  failed: "failed",
  closed: "closed",
};

// ── VP9 Codec Preference ────────────────────────────────

function setVp9Preference(
  pc: RTCPeerConnection,
  sender: RTCRtpSender,
): void {
  const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
  if (
    transceiver &&
    typeof transceiver.setCodecPreferences === "function"
  ) {
    const capabilities = RTCRtpReceiver.getCapabilities("video");
    if (capabilities) {
      const vp9 = capabilities.codecs.filter(
        (c) => c.mimeType.toLowerCase() === "video/vp9",
      );
      const rest = capabilities.codecs.filter(
        (c) => c.mimeType.toLowerCase() !== "video/vp9",
      );
      if (vp9.length > 0) {
        transceiver.setCodecPreferences([...vp9, ...rest]);
      }
    }
  }
}

// ── Bitrate Management ──────────────────────────────────

function applyBitrateParams(sender: RTCRtpSender, kind: string): void {
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }

  if (kind === "video") {
    params.encodings[0].maxBitrate = VIDEO_MAX_BITRATE;
    params.degradationPreference = "maintain-resolution";
  } else if (kind === "audio") {
    params.encodings[0].maxBitrate = AUDIO_MAX_BITRATE;
  }

  sender.setParameters(params).catch((err) => {
    console.warn(`[Mesh] Failed to set ${kind} encoding params:`, err);
  });
}

// ── Per-peer state (non-React, mutable) ─────────────────

interface InternalPeerState {
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  remoteStream: MediaStream | null;
  messageQueue: Promise<void>;
  iceRestartAttempts: number;
}

// ── Hook ─────────────────────────────────────────────────

export function useMesh(options: UseMeshOptions): UseMeshResult {
  const [peers, setPeers] = useState<Map<string, PeerState>>(
    () => new Map(),
  );

  // Stable ref to track internal peer state (mutable, not triggering renders)
  const peersRef = useRef<Map<string, InternalPeerState>>(new Map());

  // Monotonic connection ID to ignore stale callbacks (pattern from useConnection.ts)
  const connectionIdRef = useRef(0);

  // Stable refs for options so callbacks don't go stale
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // ICE config cached after first fetch
  const iceConfigRef = useRef<{
    iceServers: RTCIceServer[];
    iceTransportPolicy: RTCIceTransportPolicy;
  } | null>(null);

  // Signaling client ref
  const signalingRef = useRef<ReturnType<typeof createSignalingClient> | null>(
    null,
  );

  // Track senders per peer for removeTrackFromAll
  const sendersRef = useRef<Map<string, RTCRtpSender[]>>(new Map());

  // ── Sync external peers state ─────────────────────────

  const syncPeersState = useCallback(() => {
    const next = new Map<string, PeerState>();
    for (const [id, internal] of peersRef.current) {
      next.set(id, {
        connection: internal.connection,
        dataChannel: internal.dataChannel,
        remoteStream: internal.remoteStream,
      });
    }
    setPeers(next);
    optionsRef.current.onPeersChanged?.(next);
  }, []);

  // ── Send signaling message targeted to a specific peer ─

  const sendSignaling = useCallback(
    (msg: SignalingMessage, targetPeerId: string) => {
      signalingRef.current?.send(msg, targetPeerId);
    },
    [],
  );

  // ── Setup Data Channel ────────────────────────────────

  const setupDataChannel = useCallback(
    (peerId: string, channel: RTCDataChannel, connId: number) => {
      channel.binaryType = "arraybuffer";

      channel.onmessage = (event: MessageEvent) => {
        if (connId !== connectionIdRef.current) return;
        try {
          const msg: DataChannelMessage = JSON.parse(event.data as string);
          optionsRef.current.onMessage?.(peerId, msg);
        } catch (err) {
          console.warn("[Mesh] Failed to parse DataChannel message:", err);
        }
      };

      channel.onclose = () => {
        // Data channel closed — peer may have left
      };

      channel.onerror = () => {
        console.warn(`[Mesh] DataChannel error for peer ${peerId}`);
      };
    },
    [],
  );

  // ── Create RTCPeerConnection for a peer ───────────────

  const createPeerConnection = useCallback(
    (
      remotePeerId: string,
      connId: number,
    ): RTCPeerConnection => {
      const config = iceConfigRef.current!;
      const pc = new RTCPeerConnection({
        iceServers: config.iceServers,
        iceTransportPolicy: config.iceTransportPolicy,
      });

      const getPeerInternal = () => peersRef.current.get(remotePeerId);

      // ── ICE Candidate ────────────────────────────────
      pc.onicecandidate = (event) => {
        if (connId !== connectionIdRef.current) return;
        if (event.candidate) {
          sendSignaling(
            {
              type: "ice-candidate",
              roomId: optionsRef.current.roomId,
              peerId: optionsRef.current.peerId,
              payload: { candidate: event.candidate.toJSON() },
            },
            remotePeerId,
          );
        }
      };

      // ── Connection State Change (with ICE restart) ───
      pc.onconnectionstatechange = () => {
        if (connId !== connectionIdRef.current) return;
        const mapped = CONNECTION_STATE_MAP[pc.connectionState] ?? "new";
        const internal = getPeerInternal();

        if (
          pc.connectionState === "failed" &&
          internal &&
          internal.iceRestartAttempts < ICE_RESTART_MAX_ATTEMPTS
        ) {
          internal.iceRestartAttempts++;
          console.warn(
            `[Mesh] Peer ${remotePeerId} connection failed — attempting ICE restart (${internal.iceRestartAttempts}/${ICE_RESTART_MAX_ATTEMPTS})`,
          );
          pc.restartIce();

          pc.createOffer({ iceRestart: true })
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              sendSignaling(
                {
                  type: "sdp-offer",
                  roomId: optionsRef.current.roomId,
                  peerId: optionsRef.current.peerId,
                  payload: { sdp: pc.localDescription },
                },
                remotePeerId,
              );
            })
            .catch((err) => {
              console.error("[Mesh] ICE restart failed:", err);
            });

          return;
        }

        if (mapped === "failed") {
          console.warn(
            `[Mesh] Peer ${remotePeerId} — connection failed, TURN relay may be misconfigured`,
          );
        }

        if (mapped === "connected" && internal) {
          internal.iceRestartAttempts = 0;
        }
      };

      // ── Remote Data Channel ──────────────────────────
      pc.ondatachannel = (event) => {
        if (connId !== connectionIdRef.current) return;
        const internal = getPeerInternal();
        if (internal) {
          setupDataChannel(remotePeerId, event.channel, connId);
          internal.dataChannel = event.channel;
          syncPeersState();
        }
      };

      // ── Remote Track ─────────────────────────────────
      pc.ontrack = (event) => {
        if (connId !== connectionIdRef.current) return;
        const internal = getPeerInternal();
        if (internal) {
          if (!internal.remoteStream) {
            internal.remoteStream = new MediaStream();
          }
          internal.remoteStream.addTrack(event.track);
          syncPeersState();
          optionsRef.current.onRemoteTrack?.(remotePeerId, event);

          // Handle track ended — remove from remote stream
          event.track.onended = () => {
            if (internal.remoteStream) {
              internal.remoteStream.removeTrack(event.track);
              syncPeersState();
            }
          };
        }
      };

      return pc;
    },
    [sendSignaling, syncPeersState, setupDataChannel],
  );

  // ── Handle peer joined: create connection and offer ───

  const handlePeerJoined = useCallback(
    async (remotePeerId: string, connId: number) => {
      if (connId !== connectionIdRef.current) return;
      if (peersRef.current.has(remotePeerId)) return; // already connected

      const pc = createPeerConnection(remotePeerId, connId);

      // Create data channel (initiator side)
      const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, {
        ordered: true,
      });
      setupDataChannel(remotePeerId, channel, connId);

      // Store internal state
      peersRef.current.set(remotePeerId, {
        connection: pc,
        dataChannel: channel,
        remoteStream: null,
        messageQueue: Promise.resolve(),
        iceRestartAttempts: 0,
      });
      sendersRef.current.set(remotePeerId, []);
      syncPeersState();

      // Create and send offer
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        sendSignaling(
          {
            type: "sdp-offer",
            roomId: optionsRef.current.roomId,
            peerId: optionsRef.current.peerId,
            payload: { sdp: pc.localDescription },
          },
          remotePeerId,
        );
      } catch (err) {
        console.error(`[Mesh] Failed to create offer for ${remotePeerId}:`, err);
      }
    },
    [createPeerConnection, setupDataChannel, sendSignaling, syncPeersState],
  );

  // ── Handle peer left: close and remove ────────────────

  const handlePeerLeft = useCallback(
    (remotePeerId: string) => {
      const internal = peersRef.current.get(remotePeerId);
      if (internal) {
        internal.dataChannel?.close();
        internal.connection.close();
        peersRef.current.delete(remotePeerId);
        sendersRef.current.delete(remotePeerId);
        syncPeersState();
        optionsRef.current.onRemoteStreamRemoved?.(remotePeerId);
      }
    },
    [syncPeersState],
  );

  // ── Handle SDP Offer (from remote peer) ───────────────

  const handleSdpOffer = useCallback(
    async (
      remotePeerId: string,
      sdp: RTCSessionDescriptionInit,
      connId: number,
    ) => {
      if (connId !== connectionIdRef.current) return;

      let internal = peersRef.current.get(remotePeerId);

      if (!internal) {
        // We received an offer from a peer we haven't seen yet — create connection
        const pc = createPeerConnection(remotePeerId, connId);
        internal = {
          connection: pc,
          dataChannel: null,
          remoteStream: null,
          messageQueue: Promise.resolve(),
          iceRestartAttempts: 0,
        };
        peersRef.current.set(remotePeerId, internal);
        sendersRef.current.set(remotePeerId, []);
      }

      const pc = internal.connection;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        sendSignaling(
          {
            type: "sdp-answer",
            roomId: optionsRef.current.roomId,
            peerId: optionsRef.current.peerId,
            payload: { sdp: pc.localDescription },
          },
          remotePeerId,
        );

        syncPeersState();
      } catch (err) {
        console.error(
          `[Mesh] Failed to handle SDP offer from ${remotePeerId}:`,
          err,
        );
      }
    },
    [createPeerConnection, sendSignaling, syncPeersState],
  );

  // ── Handle SDP Answer (from remote peer) ──────────────

  const handleSdpAnswer = useCallback(
    async (remotePeerId: string, sdp: RTCSessionDescriptionInit) => {
      const internal = peersRef.current.get(remotePeerId);
      if (!internal) return;

      try {
        await internal.connection.setRemoteDescription(
          new RTCSessionDescription(sdp),
        );
      } catch (err) {
        console.error(
          `[Mesh] Failed to handle SDP answer from ${remotePeerId}:`,
          err,
        );
      }
    },
    [],
  );

  // ── Handle ICE Candidate (from remote peer) ───────────

  const handleIceCandidate = useCallback(
    async (remotePeerId: string, candidate: RTCIceCandidateInit) => {
      const internal = peersRef.current.get(remotePeerId);
      if (!internal) return;

      try {
        await internal.connection.addIceCandidate(
          new RTCIceCandidate(candidate),
        );
      } catch (err) {
        console.error(
          `[Mesh] Failed to add ICE candidate from ${remotePeerId}:`,
          err,
        );
      }
    },
    [],
  );

  // ── Signaling Message Router (sequential queue per peer) ─

  const handleSignalingMessage = useCallback(
    (msg: SignalingMessage, connId: number) => {
      if (connId !== connectionIdRef.current) return;
      const senderPeerId = msg.peerId;
      if (!senderPeerId) return;

      // Ignore messages from ourselves
      if (senderPeerId === optionsRef.current.peerId) return;

      switch (msg.type) {
        case "peer-joined": {
          handlePeerJoined(senderPeerId, connId);
          break;
        }
        case "peer-left": {
          handlePeerLeft(senderPeerId);
          break;
        }
        case "sdp-offer": {
          const internal = peersRef.current.get(senderPeerId);
          const payload = msg.payload as SdpPayload;

          if (internal) {
            // Sequential message queue to prevent race conditions
            internal.messageQueue = internal.messageQueue.then(async () => {
              await handleSdpOffer(senderPeerId, payload.sdp, connId);
            });
          } else {
            // No existing peer — handle directly (will create connection)
            handleSdpOffer(senderPeerId, payload.sdp, connId);
          }
          break;
        }
        case "sdp-answer": {
          const internal = peersRef.current.get(senderPeerId);
          const payload = msg.payload as SdpPayload;

          if (internal) {
            // Sequential message queue to prevent race conditions
            internal.messageQueue = internal.messageQueue.then(async () => {
              await handleSdpAnswer(senderPeerId, payload.sdp);
            });
          }
          break;
        }
        case "ice-candidate": {
          const internal = peersRef.current.get(senderPeerId);
          const payload = msg.payload as IceCandidatePayload;

          if (internal) {
            // Sequential message queue — ICE must wait for setRemoteDescription
            internal.messageQueue = internal.messageQueue.then(async () => {
              await handleIceCandidate(senderPeerId, payload.candidate);
            });
          }
          break;
        }
      }
    },
    [handlePeerJoined, handlePeerLeft, handleSdpOffer, handleSdpAnswer, handleIceCandidate],
  );

  // ── Connect to room on mount ──────────────────────────

  useEffect(() => {
    let cancelled = false;
    const connId = ++connectionIdRef.current;

    const init = async () => {
      // Fetch TURN credentials
      if (!iceConfigRef.current) {
        iceConfigRef.current = await fetchTurnCredentials();
      }

      if (cancelled) return;

      // Create signaling client
      const signaling = createSignalingClient({
        peerId: optionsRef.current.peerId,
        displayName: optionsRef.current.displayName,
        onMessage: (msg: SignalingMessage) => {
          handleSignalingMessage(msg, connId);
        },
        onConnectionChange: () => {},
        onReconnected: () => {
          // Re-join room on reconnect
        },
      });

      signalingRef.current = signaling;
      signaling.connect(optionsRef.current.roomId);
    };

    init();

    // ── Cleanup on unmount ───────────────────────────
    const currentPeers = peersRef.current;
    const currentSenders = sendersRef.current;
    const currentSignaling = signalingRef.current;

    return () => {
      cancelled = true;
      // Invalidate stale callbacks by incrementing connection ID
      const connIdRef = connectionIdRef;
      connIdRef.current++;

      // Close all peer connections
      for (const [, internal] of currentPeers) {
        internal.dataChannel?.close();
        internal.connection.close();
      }
      currentPeers.clear();
      currentSenders.clear();

      // Disconnect signaling
      currentSignaling?.disconnect();
      signalingRef.current = null;
    };
  }, [options.roomId, options.peerId, options.displayName, handleSignalingMessage]);

  // ── Public API: sendToAll ─────────────────────────────

  const sendToAll = useCallback((msg: DataChannelMessage) => {
    for (const [, internal] of peersRef.current) {
      if (internal.dataChannel?.readyState === "open") {
        internal.dataChannel.send(JSON.stringify(msg));
      }
    }
  }, []);

  // ── Public API: addTrackToAll ─────────────────────────

  const addTrackToAll = useCallback(
    (track: MediaStreamTrack, stream: MediaStream) => {
      for (const [peerId, internal] of peersRef.current) {
        const sender = internal.connection.addTrack(track, stream);

        // VP9 codec preference for video
        if (track.kind === "video") {
          setVp9Preference(internal.connection, sender);
        }

        // Bitrate management
        applyBitrateParams(sender, track.kind);

        // Track the sender for later removal
        const existing = sendersRef.current.get(peerId) ?? [];
        existing.push(sender);
        sendersRef.current.set(peerId, existing);
      }
    },
    [],
  );

  // ── Public API: removeTrackFromAll ────────────────────

  const removeTrackFromAll = useCallback((sender: RTCRtpSender) => {
    for (const [peerId, internal] of peersRef.current) {
      // Find matching sender in this peer's connection
      const peerSenders = sendersRef.current.get(peerId) ?? [];
      const matchIdx = peerSenders.indexOf(sender);

      if (matchIdx !== -1) {
        internal.connection.removeTrack(sender);
        peerSenders.splice(matchIdx, 1);
      } else {
        // The sender might have been created directly — try removing anyway
        try {
          internal.connection.removeTrack(sender);
        } catch {
          // Sender doesn't belong to this connection — skip
        }
      }
    }
  }, []);

  return {
    peers,
    sendToAll,
    addTrackToAll,
    removeTrackFromAll,
  };
}
