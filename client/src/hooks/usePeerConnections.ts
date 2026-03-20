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
import { fetchTurnCredentials } from "@/lib/turn";
import { useSignaling } from "@/context/signaling-context";
import { useMedia } from "@/context/media-context";

// ── VP9 Codec Preference ────────────────────────────────

function setVp9Preference(pc: RTCPeerConnection, sender: RTCRtpSender): void {
  const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
  if (transceiver && typeof transceiver.setCodecPreferences === "function") {
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

// ── Per-peer internal state (mutable, not React state) ──

interface InternalPeer {
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  remoteStream: MediaStream | null;
  displayName: string | null;
  messageQueue: Promise<void>;
  iceRestartAttempts: number;
  iceCandidateQueue: RTCIceCandidate[];
}

// ── Options ─────────────────────────────────────────────

interface UsePeerConnectionsOptions {
  peerId: string;
  displayName: string;
  roomId: string;
  onMessage?: (peerId: string, msg: DataChannelMessage) => void;
  onRemoteTrack?: (peerId: string, event: RTCTrackEvent) => void;
  onRemoteStreamRemoved?: (peerId: string) => void;
  onPeersChanged?: (peers: Map<string, PeerState>) => void;
}

// ── Result ──────────────────────────────────────────────

interface UsePeerConnectionsResult {
  peers: Map<string, PeerState>;
  sendToAll: (msg: DataChannelMessage) => void;
  addTrackToAll: (
    track: MediaStreamTrack,
    stream: MediaStream,
  ) => RTCRtpSender[];
  removeTrackFromAll: (sender: RTCRtpSender) => void;
  provideMediaRef: (id: string, node: HTMLVideoElement | null) => void;
}

// ── Hook ────────────────────────────────────────────────

export function usePeerConnections(
  options: UsePeerConnectionsOptions,
): UsePeerConnectionsResult {
  const signaling = useSignaling();
  const media = useMedia();

  // Keep stable refs for signaling/media so callbacks don't depend on context objects
  const signalingRef = useRef(signaling);
  useEffect(() => {
    signalingRef.current = signaling;
  });
  const mediaRef = useRef(media);
  useEffect(() => {
    mediaRef.current = media;
  });

  const [peers, setPeers] = useState<Map<string, PeerState>>(() => new Map());

  const peersRef = useRef<Map<string, InternalPeer>>(new Map());
  const sendersRef = useRef<Map<string, RTCRtpSender[]>>(new Map());
  const peerMediaElements = useRef<Record<string, HTMLVideoElement | null>>({});
  const iceConfigRef = useRef<{
    iceServers: RTCIceServer[];
    iceTransportPolicy: RTCIceTransportPolicy;
  } | null>(null);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // ── Sync peers to React state ─────────────────────────

  const syncPeers = useCallback(() => {
    const next = new Map<string, PeerState>();
    for (const [id, internal] of peersRef.current) {
      next.set(id, {
        connection: internal.connection,
        dataChannel: internal.dataChannel,
        remoteStream: internal.remoteStream,
        displayName: internal.displayName,
      });
    }
    setPeers(next);
    optionsRef.current.onPeersChanged?.(next);
  }, []);

  const provideMediaRef = useCallback(
    (id: string, node: HTMLVideoElement | null) => {
      peerMediaElements.current[id] = node;
      // Immediately attach stream if the element just appeared and a stream exists
      if (node) {
        const internal = peersRef.current.get(id);
        if (internal?.remoteStream) {
          if (node.srcObject !== internal.remoteStream) {
            node.srcObject = internal.remoteStream;
          }
          node.play().catch(() => {});
        }
      }
    },
    [],
  );

  // ── Setup DataChannel handlers ────────────────────────

  const setupDataChannel = useCallback(
    (peerId: string, channel: RTCDataChannel) => {
      channel.binaryType = "arraybuffer";

      channel.onmessage = (event: MessageEvent) => {
        try {
          const msg: DataChannelMessage = JSON.parse(event.data as string);
          optionsRef.current.onMessage?.(peerId, msg);
        } catch (err) {
          console.warn("[Mesh] Failed to parse DataChannel message:", err);
        }
      };

      channel.onerror = () => {
        console.warn(`[Mesh] DataChannel error for peer ${peerId}`);
      };
    },
    [],
  );

  // ── Create RTCPeerConnection ──────────────────────────

  const createPeerConnection = useCallback(
    (remotePeerId: string): RTCPeerConnection => {
      const config = iceConfigRef.current!;
      const pc = new RTCPeerConnection({
        iceServers: config.iceServers,
        iceTransportPolicy: config.iceTransportPolicy,
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          signalingRef.current.send(
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

      pc.onconnectionstatechange = () => {
        const internal = peersRef.current.get(remotePeerId);

        if (
          pc.connectionState === "failed" &&
          internal &&
          internal.iceRestartAttempts < ICE_RESTART_MAX_ATTEMPTS
        ) {
          internal.iceRestartAttempts++;
          console.warn(
            `[Mesh] Peer ${remotePeerId} failed — ICE restart (${internal.iceRestartAttempts}/${ICE_RESTART_MAX_ATTEMPTS})`,
          );
          pc.restartIce();
          pc.createOffer({ iceRestart: true })
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              signalingRef.current.send(
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

        if (pc.connectionState === "connected" && internal) {
          internal.iceRestartAttempts = 0;
        }
      };

      pc.ondatachannel = (event) => {
        const internal = peersRef.current.get(remotePeerId);
        if (internal) {
          setupDataChannel(remotePeerId, event.channel);
          internal.dataChannel = event.channel;
          syncPeers();
        }
      };

      pc.ontrack = (event) => {
        const internal = peersRef.current.get(remotePeerId);
        if (internal) {
          if (!internal.remoteStream) {
            internal.remoteStream = new MediaStream();
          }
          internal.remoteStream.addTrack(event.track);

          const el = peerMediaElements.current[remotePeerId];
          if (el && internal.remoteStream) {
            if (el.srcObject !== internal.remoteStream) {
              el.srcObject = internal.remoteStream;
            }
            el.play().catch(() => {});
          }

          syncPeers();
          optionsRef.current.onRemoteTrack?.(remotePeerId, event);

          event.track.onmute = () => {
            syncPeers();
          };
          event.track.onunmute = () => {
            syncPeers();
          };
          event.track.onended = () => {
            if (internal.remoteStream) {
              internal.remoteStream.removeTrack(event.track);
              syncPeers();
            }
          };
        } else {
          console.warn(`[Mesh] No internal peer found for ${remotePeerId}`);
        }
      };

      return pc;
    },
    [setupDataChannel, syncPeers],
  );

  // ── Add local tracks to a peer connection ─────────────

  const addLocalTracks = useCallback(
    (pc: RTCPeerConnection): RTCRtpSender[] => {
      const localMedia = mediaRef.current.getLocalTracks();
      const peerSenders: RTCRtpSender[] = [];

      if (localMedia) {
        for (const track of localMedia.tracks) {
          const sender = pc.addTrack(track, localMedia.stream);
          if (track.kind === "video") {
            setVp9Preference(pc, sender);
          }
          applyBitrateParams(sender, track.kind);
          peerSenders.push(sender);
        }
      }

      return peerSenders;
    },
    [],
  );

  // ── Handle: peer joined ───────────────────────────────

  const handlePeerJoined = useCallback(
    async (remotePeerId: string, displayName: string | undefined) => {
      if (peersRef.current.has(remotePeerId)) return;

      const pc = createPeerConnection(remotePeerId);
      const peerSenders = addLocalTracks(pc);

      const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, {
        ordered: true,
      });
      setupDataChannel(remotePeerId, channel);

      peersRef.current.set(remotePeerId, {
        connection: pc,
        dataChannel: channel,
        remoteStream: null,
        displayName: displayName ?? null,
        messageQueue: Promise.resolve(),
        iceRestartAttempts: 0,
        iceCandidateQueue: [],
      });
      sendersRef.current.set(remotePeerId, peerSenders);
      syncPeers();

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        signalingRef.current.send(
          {
            type: "sdp-offer",
            roomId: optionsRef.current.roomId,
            peerId: optionsRef.current.peerId,
            payload: { sdp: pc.localDescription },
          },
          remotePeerId,
        );
      } catch (err) {
        console.error(
          `[Mesh] Failed to create offer for ${remotePeerId}:`,
          err,
        );
      }
    },
    [createPeerConnection, addLocalTracks, setupDataChannel, syncPeers],
  );

  // ── Handle: peer left ─────────────────────────────────

  const handlePeerLeft = useCallback(
    (remotePeerId: string) => {
      const internal = peersRef.current.get(remotePeerId);
      if (internal) {
        internal.dataChannel?.close();
        internal.connection.close();
        peersRef.current.delete(remotePeerId);
        sendersRef.current.delete(remotePeerId);
        delete peerMediaElements.current[remotePeerId];
        syncPeers();
        optionsRef.current.onRemoteStreamRemoved?.(remotePeerId);
      }
    },
    [syncPeers],
  );

  // ── Handle: SDP offer ─────────────────────────────────

  const handleSdpOffer = useCallback(
    async (remotePeerId: string, sdp: RTCSessionDescriptionInit) => {
      let internal = peersRef.current.get(remotePeerId);
      if (!internal) {
        const pc = createPeerConnection(remotePeerId);
        const peerSenders = addLocalTracks(pc);

        internal = {
          connection: pc,
          dataChannel: null,
          remoteStream: null,
          displayName: null,
          messageQueue: Promise.resolve(),
          iceRestartAttempts: 0,
          iceCandidateQueue: [],
        };
        peersRef.current.set(remotePeerId, internal);
        sendersRef.current.set(remotePeerId, peerSenders);
      }

      const pc = internal.connection;
      const localPeerId = optionsRef.current.peerId;

      try {
        if (pc.signalingState === "have-local-offer") {
          const isPolite = localPeerId < remotePeerId;
          if (!isPolite) return;
          await pc.setLocalDescription({ type: "rollback" });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        if (internal.iceCandidateQueue.length > 0) {
          for (const candidate of internal.iceCandidateQueue) {
            await pc
              .addIceCandidate(candidate)
              .catch((e) =>
                console.error("[Mesh] Error adding queued ICE candidate:", e),
              );
          }
          internal.iceCandidateQueue = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        signalingRef.current.send(
          {
            type: "sdp-answer",
            roomId: optionsRef.current.roomId,
            peerId: localPeerId,
            payload: { sdp: pc.localDescription },
          },
          remotePeerId,
        );

        syncPeers();
      } catch (err) {
        console.error(
          `[Mesh] Failed to handle SDP offer from ${remotePeerId}:`,
          err,
        );
      }
    },
    [createPeerConnection, addLocalTracks, syncPeers],
  );

  // ── Handle: SDP answer ────────────────────────────────

  const handleSdpAnswer = useCallback(
    async (remotePeerId: string, sdp: RTCSessionDescriptionInit) => {
      const internal = peersRef.current.get(remotePeerId);
      if (!internal) return;

      try {
        await internal.connection.setRemoteDescription(
          new RTCSessionDescription(sdp),
        );

        if (internal.iceCandidateQueue.length > 0) {
          for (const candidate of internal.iceCandidateQueue) {
            await internal.connection
              .addIceCandidate(candidate)
              .catch((e) =>
                console.error("[Mesh] Error adding queued ICE candidate:", e),
              );
          }
          internal.iceCandidateQueue = [];
        }
      } catch (err) {
        console.error(
          `[Mesh] Failed to handle SDP answer from ${remotePeerId}:`,
          err,
        );
      }
    },
    [],
  );

  // ── Handle: ICE candidate (with queueing) ─────────────

  const handleIceCandidate = useCallback(
    (remotePeerId: string, candidate: RTCIceCandidateInit) => {
      const internal = peersRef.current.get(remotePeerId);
      if (!internal) return;

      const pc = internal.connection;
      const iceCandidate = new RTCIceCandidate(candidate);

      if (pc.remoteDescription) {
        pc.addIceCandidate(iceCandidate).catch((e) => {
          if (e.name === "InvalidStateError") {
            console.warn(
              `[Mesh] Skipping ICE candidate (invalid state) for ${remotePeerId}`,
            );
          } else {
            console.error("[Mesh] Error adding ICE candidate:", e);
          }
        });
      } else {
        internal.iceCandidateQueue.push(iceCandidate);
      }
    },
    [],
  );

  // ── Main effect: subscribe to signaling messages ──────

  useEffect(() => {
    if (!media.ready) return;

    let cancelled = false;

    const init = async () => {
      if (!iceConfigRef.current) {
        iceConfigRef.current = await fetchTurnCredentials();
      }
      if (cancelled) return;

      signalingRef.current.connect(
        options.roomId,
        options.peerId,
        options.displayName,
      );
    };

    const unsubscribe = signalingRef.current.onMessage(
      (msg: SignalingMessage) => {
        if (cancelled) return;
        const senderPeerId = msg.peerId;
        if (!senderPeerId || senderPeerId === options.peerId) return;

        switch (msg.type) {
          case "peer-joined": {
            handlePeerJoined(senderPeerId, msg.displayName);
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
              internal.messageQueue = internal.messageQueue.then(() =>
                handleSdpOffer(senderPeerId, payload.sdp),
              );
            } else {
              handleSdpOffer(senderPeerId, payload.sdp);
            }
            break;
          }
          case "sdp-answer": {
            const internal = peersRef.current.get(senderPeerId);
            const payload = msg.payload as SdpPayload;
            if (internal) {
              internal.messageQueue = internal.messageQueue.then(() =>
                handleSdpAnswer(senderPeerId, payload.sdp),
              );
            }
            break;
          }
          case "ice-candidate": {
            const internal = peersRef.current.get(senderPeerId);
            const payload = msg.payload as IceCandidatePayload;
            if (internal) {
              internal.messageQueue = internal.messageQueue.then(() => {
                handleIceCandidate(senderPeerId, payload.candidate);
              });
            }
            break;
          }
        }
      },
    );

    init();

    const currentPeers = peersRef.current;
    const currentSenders = sendersRef.current;

    return () => {
      cancelled = true;
      unsubscribe();

      for (const [, internal] of currentPeers) {
        internal.dataChannel?.close();
        internal.connection.close();
      }
      currentPeers.clear();
      currentSenders.clear();
      peerMediaElements.current = {};
      setPeers(new Map());

      signalingRef.current.disconnect();
    };
  }, [
    options.roomId,
    options.peerId,
    options.displayName,
    media.ready,
    handlePeerJoined,
    handlePeerLeft,
    handleSdpOffer,
    handleSdpAnswer,
    handleIceCandidate,
  ]);

  // ── Public API ────────────────────────────────────────

  const sendToAll = useCallback((msg: DataChannelMessage) => {
    for (const [, internal] of peersRef.current) {
      if (internal.dataChannel?.readyState === "open") {
        internal.dataChannel.send(JSON.stringify(msg));
      }
    }
  }, []);

  const addTrackToAll = useCallback(
    (track: MediaStreamTrack, stream: MediaStream): RTCRtpSender[] => {
      const senders: RTCRtpSender[] = [];
      for (const [peerId, internal] of peersRef.current) {
        const sender = internal.connection.addTrack(track, stream);
        if (track.kind === "video") {
          setVp9Preference(internal.connection, sender);
        }
        applyBitrateParams(sender, track.kind);

        const existing = sendersRef.current.get(peerId) ?? [];
        existing.push(sender);
        sendersRef.current.set(peerId, existing);
        senders.push(sender);
      }
      return senders;
    },
    [],
  );

  const removeTrackFromAll = useCallback((sender: RTCRtpSender) => {
    for (const [peerId, internal] of peersRef.current) {
      const peerSenders = sendersRef.current.get(peerId) ?? [];
      const matchIdx = peerSenders.indexOf(sender);
      if (matchIdx !== -1) {
        internal.connection.removeTrack(sender);
        peerSenders.splice(matchIdx, 1);
      } else {
        try {
          internal.connection.removeTrack(sender);
        } catch {
          // Sender doesn't belong to this connection
        }
      }
    }
  }, []);

  return {
    peers,
    sendToAll,
    addTrackToAll,
    removeTrackFromAll,
    provideMediaRef,
  };
}
