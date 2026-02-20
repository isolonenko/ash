import type {
  SignalingMessage,
  PeerConnectionState,
  DataChannelMessage,
} from "@shared/types";

// ── Config ───────────────────────────────────────────────

const buildIceServers = (): RTCIceServer[] => {
  // Production: override via env vars
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  if (turnUrl && turnUsername && turnCredential) {
    const urls = turnUrl.includes(",")
      ? turnUrl.split(",").map((u) => u.trim())
      : turnUrl;
    return [
      { urls: "stun:stun.l.google.com:19302" },
      { urls, username: turnUsername, credential: turnCredential },
    ];
  }

  // Local dev default: coturn from docker compose
  // Only TURN (no STUN) to avoid bogus 0.0.0.0 CREATE_PERMISSION attempts
  return [
    {
      urls: [
        "turn:127.0.0.1:3478",
        "turn:127.0.0.1:3478?transport=tcp",
      ],
      username: "thechat",
      credential: "thechat",
    },
  ];
};

// In local dev, force relay-only to prevent zero-address CREATE_PERMISSION 403s
// In production (env vars set), allow all transport policies
const getIceTransportPolicy = (): RTCIceTransportPolicy => {
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  return turnUrl ? "all" : "relay";
};

const ICE_SERVERS: RTCIceServer[] = buildIceServers();
const ICE_TRANSPORT_POLICY: RTCIceTransportPolicy = getIceTransportPolicy();

const DATA_CHANNEL_LABEL = "thechat";

// ── Types ────────────────────────────────────────────────

interface WebRTCManagerOptions {
  onStateChange: (state: PeerConnectionState) => void;
  onMessage: (msg: DataChannelMessage) => void;
  onSignalingNeeded: (msg: SignalingMessage) => void;
  onTrack: (event: RTCTrackEvent) => void;
  roomId: string;
  publicKey: string; // our public key
  peerPublicKey?: string;
}

// ── WebRTC Manager ───────────────────────────────────────

export const createWebRTCManager = (options: WebRTCManagerOptions) => {
  let pc: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let state: PeerConnectionState = "new";

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
      iceServers: ICE_SERVERS,
      iceTransportPolicy: ICE_TRANSPORT_POLICY,
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
      const stateMap: Record<string, PeerConnectionState> = {
        new: "new",
        connecting: "connecting",
        connected: "connected",
        disconnected: "disconnected",
        failed: "failed",
        closed: "closed",
      };
      setState(stateMap[connection.connectionState] ?? "new");
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
      } catch {
        // Ignore malformed
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

  // ── File Transfer ──────────────────────────────────────

  const CHUNK_SIZE = 16 * 1024; // 16KB chunks

  const sendFile = async (file: File): Promise<string> => {
    const fileId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Send metadata first
    send({
      type: "file-meta",
      payload: {
        id: fileId,
        name: file.name,
        size: file.size,
        totalChunks,
      },
    });

    // Send chunks
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = bytes.slice(start, end);
      const base64 = btoa(String.fromCharCode(...chunk));

      send({
        type: "file-chunk",
        payload: {
          fileId,
          chunkIndex: i,
          data: base64,
        },
      });

      // Small delay to avoid flooding the channel
      if (i % 10 === 0 && i > 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }

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
