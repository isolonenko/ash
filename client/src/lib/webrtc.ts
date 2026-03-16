import type {
  SignalingMessage,
  PeerConnectionState,
  DataChannelMessage,
} from "@/types";
import {
  DATA_CHANNEL_LABEL,
  FILE_CHUNK_SIZE,
  FILE_CHUNK_BATCH_SIZE,
  FILE_CHUNK_BATCH_DELAY,
  ICE_RESTART_MAX_ATTEMPTS,
} from "@/lib/constants";

// ── Connection state mapping ─────────────────────────────

const CONNECTION_STATE_MAP: Record<string, PeerConnectionState> = {
  new: "new",
  connecting: "connecting",
  connected: "connected",
  disconnected: "disconnected",
  failed: "failed",
  closed: "closed",
};

// ── Types ────────────────────────────────────────────────

interface WebRTCManagerOptions {
  onStateChange: (state: PeerConnectionState) => void;
  onMessage: (msg: DataChannelMessage) => void;
  onSignalingNeeded: (msg: SignalingMessage) => void;
  onTrack: (event: RTCTrackEvent) => void;
  roomId: string;
  publicKey: string; // our public key
  peerPublicKey?: string;
  iceServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
}

// ── WebRTC Manager ───────────────────────────────────────

export const createWebRTCManager = (options: WebRTCManagerOptions) => {
  let pc: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let state: PeerConnectionState = "new";
  let iceRestartAttempts = 0;

  // Sequential message queue to prevent race conditions
  // (e.g. ice-candidate arriving before setRemoteDescription completes)
  let messageQueue: Promise<void> = Promise.resolve();

  // Renegotiation state (for adding media tracks after DataChannel is established)
  let isRenegotiating = false;
  let hasEstablishedConnection = false;
  let makingOffer = false;

  const setState = (newState: PeerConnectionState): void => {
    state = newState;
    options.onStateChange(newState);
  };

  const createPeerConnection = (): RTCPeerConnection => {
    const connection = new RTCPeerConnection({
      iceServers: options.iceServers,
      iceTransportPolicy: options.iceTransportPolicy,
    });

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        if (isRenegotiating) {
          send({
            type: "ice-renegotiate",
            payload: { candidate: event.candidate.toJSON() },
          });
        } else {
          options.onSignalingNeeded({
            type: "ice-candidate",
            roomId: options.roomId,
            senderPublicKey: options.publicKey,
            payload: { candidate: event.candidate.toJSON() },
          });
        }
      }
    };

    connection.onconnectionstatechange = () => {
      const mapped = CONNECTION_STATE_MAP[connection.connectionState] ?? "new";

      if (
        connection.connectionState === "failed" &&
        iceRestartAttempts < ICE_RESTART_MAX_ATTEMPTS
      ) {
        iceRestartAttempts++;
        console.warn(
          `[WebRTC] connection failed — attempting ICE restart (${iceRestartAttempts}/${ICE_RESTART_MAX_ATTEMPTS})`,
        );
        connection.restartIce();

        connection
          .createOffer({ iceRestart: true })
          .then((offer) => connection.setLocalDescription(offer))
          .then(() => {
            options.onSignalingNeeded({
              type: "sdp-offer",
              roomId: options.roomId,
              senderPublicKey: options.publicKey,
              payload: { sdp: connection.localDescription },
            });
          })
          .catch((err) => {
            console.error("[WebRTC] ICE restart failed:", err);
            setState("failed");
          });

        setState("connecting");
        return;
      }

      if (mapped === "failed") {
        console.warn("[WebRTC] ICE connection failed — TURN relay may be misconfigured");
      }

      if (mapped === "connected") {
        iceRestartAttempts = 0;
      }

      setState(mapped);
    };

    connection.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    connection.ontrack = (event) => {
      options.onTrack(event);
    };

    connection.onnegotiationneeded = async () => {
      if (!hasEstablishedConnection) return;
      try {
        makingOffer = true;
        await connection.setLocalDescription();
        send({
          type: "sdp-renegotiate-offer",
          payload: { sdp: connection.localDescription },
        });
        isRenegotiating = true;
      } catch (err) {
        console.error("[WebRTC] renegotiation offer error:", err);
      } finally {
        makingOffer = false;
      }
    };

    return connection;
  };

  const setupDataChannel = (channel: RTCDataChannel): void => {
    dataChannel = channel;
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      hasEstablishedConnection = true;
      setState("connected");
    };

    channel.onmessage = (event: MessageEvent) => {
      try {
        const msg: DataChannelMessage = JSON.parse(event.data as string);
        options.onMessage(msg);
      } catch (err) {
        console.warn("[WebRTC] Failed to parse DataChannel message:", err);
      }
    };

    channel.onclose = () => {
      setState("disconnected");
    };

    channel.onerror = () => {
      setState("failed");
    };
  };

  // ── Offer/Answer Flow ──────────────────────────────────

  const createOffer = async (): Promise<void> => {
    pc = createPeerConnection();
    setState("connecting");

    const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, {
      ordered: true,
    });
    setupDataChannel(channel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    options.onSignalingNeeded({
      type: "sdp-offer",
      roomId: options.roomId,
      senderPublicKey: options.publicKey,
      payload: { sdp: pc.localDescription },
    });
  };

  const handleOffer = async (
    sdp: RTCSessionDescriptionInit,
  ): Promise<void> => {
    pc = createPeerConnection();
    setState("connecting");

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    options.onSignalingNeeded({
      type: "sdp-answer",
      roomId: options.roomId,
      senderPublicKey: options.publicKey,
      payload: { sdp: pc.localDescription },
    });
  };

  const handleAnswer = async (
    sdp: RTCSessionDescriptionInit,
  ): Promise<void> => {
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  };

  const handleIceCandidate = async (
    candidate: RTCIceCandidateInit,
  ): Promise<void> => {
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  // ── Signaling Message Handler ──────────────────────────
  // Queued to ensure messages are processed sequentially.
  // Without this, an ice-candidate can arrive and call addIceCandidate
  // before handleOffer's setRemoteDescription has completed.

  const handleSignalingMessage = (msg: SignalingMessage): void => {
    const payload = msg.payload as Record<string, unknown>;

    messageQueue = messageQueue.then(async () => {
      try {
        switch (msg.type) {
          case "sdp-offer":
            await handleOffer(payload.sdp as RTCSessionDescriptionInit);
            break;
          case "sdp-answer":
            await handleAnswer(payload.sdp as RTCSessionDescriptionInit);
            break;
          case "ice-candidate":
            await handleIceCandidate(payload.candidate as RTCIceCandidateInit);
            break;
        }
      } catch (err) {
        console.error("[WebRTC] signaling error:", err);
      }
    });
  };

  // ── Send Data ──────────────────────────────────────────

  const send = (msg: DataChannelMessage): void => {
    if (dataChannel?.readyState === "open") {
      dataChannel.send(JSON.stringify(msg));
    }
  };

  const sendChat = (id: string, text: string): void => {
    send({
      type: "chat",
      payload: { id, text, timestamp: Date.now() },
    });
  };

  const sendTyping = (isTyping: boolean): void => {
    send({ type: "typing", payload: { isTyping } });
  };

  const sendReadReceipt = (messageId: string): void => {
    send({ type: "read-receipt", payload: { messageId } });
  };

  const sendFile = async (file: File): Promise<string> => {
    const fileId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / FILE_CHUNK_SIZE);

    send({
      type: "file-meta",
      payload: {
        id: fileId,
        name: file.name,
        size: file.size,
        totalChunks,
      },
    });

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const sendChunk = async (index: number): Promise<void> => {
      if (index >= totalChunks) return;

      const start = index * FILE_CHUNK_SIZE;
      const end = Math.min(start + FILE_CHUNK_SIZE, file.size);
      const chunk = bytes.slice(start, end);
      const base64 = btoa(String.fromCharCode(...chunk));

      send({
        type: "file-chunk",
        payload: { fileId, chunkIndex: index, data: base64 },
      });

      const needsDelay =
        index > 0 && index % FILE_CHUNK_BATCH_SIZE === 0;

      if (needsDelay) {
        await new Promise<void>((r) => setTimeout(r, FILE_CHUNK_BATCH_DELAY));
      }

      return sendChunk(index + 1);
    };

    await sendChunk(0);
    return fileId;
  };

  // ── Media Track Management ─────────────────────────────

  const addMediaTrack = (
    track: MediaStreamTrack,
    stream: MediaStream,
  ): RTCRtpSender | null => {
    if (!pc) return null;
    return pc.addTrack(track, stream);
  };

  const removeMediaTrack = (sender: RTCRtpSender): void => {
    pc?.removeTrack(sender);
  };

  // ── Renegotiation Handlers ────────────────────────────

  const isPolite = (): boolean => {
    if (!options.peerPublicKey) return false;
    return options.publicKey < options.peerPublicKey;
  };

  const handleRenegotiationOffer = async (
    sdp: RTCSessionDescriptionInit,
  ): Promise<void> => {
    if (!pc) return;
    try {
      const offerCollision = makingOffer || pc.signalingState !== "stable";
      if (offerCollision && !isPolite()) return;

      if (offerCollision) {
        await Promise.all([
          pc.setLocalDescription({ type: "rollback" }),
          pc.setRemoteDescription(new RTCSessionDescription(sdp)),
        ]);
      } else {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({
        type: "sdp-renegotiate-answer",
        payload: { sdp: pc.localDescription },
      });
    } catch (err) {
      console.error("[WebRTC] handleRenegotiationOffer error:", err);
    }
  };

  const handleRenegotiationAnswer = async (
    sdp: RTCSessionDescriptionInit,
  ): Promise<void> => {
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      isRenegotiating = false;
    } catch (err) {
      console.error("[WebRTC] handleRenegotiationAnswer error:", err);
    }
  };

  const handleRenegotiationIceCandidate = async (
    candidate: RTCIceCandidateInit,
  ): Promise<void> => {
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("[WebRTC] handleRenegotiationIceCandidate error:", err);
    }
  };

  // ── Lifecycle ──────────────────────────────────────────

  const close = (): void => {
    if (dataChannel) {
      dataChannel.close();
      dataChannel = null;
    }
    if (pc) {
      pc.close();
      pc = null;
    }
    setState("closed");
  };

  const getState = (): PeerConnectionState => state;

  return {
    createOffer,
    handleSignalingMessage,
    send,
    sendChat,
    sendTyping,
    sendReadReceipt,
    sendFile,
    addMediaTrack,
    removeMediaTrack,
    handleRenegotiationOffer,
    handleRenegotiationAnswer,
    handleRenegotiationIceCandidate,
    close,
    getState,
  };
};
