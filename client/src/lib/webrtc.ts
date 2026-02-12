import type {
  SignalingMessage,
  PeerConnectionState,
  DataChannelMessage,
} from "@shared/types";

// ── Config ───────────────────────────────────────────────

const buildIceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // TURN credentials via env vars (required for NAT traversal / same-machine testing)
  // Set VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL in .env
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  if (turnUrl && turnUsername && turnCredential) {
    // Support comma-separated TURN URLs (e.g. "turn:host:80,turns:host:443")
    const urls = turnUrl.includes(",")
      ? turnUrl.split(",").map((u) => u.trim())
      : turnUrl;
    servers.push({ urls, username: turnUsername, credential: turnCredential });
  }

  return servers;
};

const ICE_SERVERS: RTCIceServer[] = buildIceServers();

const DATA_CHANNEL_LABEL = "thechat";

// ── Types ────────────────────────────────────────────────

interface WebRTCManagerOptions {
  onStateChange: (state: PeerConnectionState) => void;
  onMessage: (msg: DataChannelMessage) => void;
  onSignalingNeeded: (msg: SignalingMessage) => void;
  roomId: string;
  publicKey: string; // our public key
}

// ── WebRTC Manager ───────────────────────────────────────

export const createWebRTCManager = (options: WebRTCManagerOptions) => {
  let pc: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let state: PeerConnectionState = "new";

  // Sequential message queue to prevent race conditions
  // (e.g. ice-candidate arriving before setRemoteDescription completes)
  let messageQueue: Promise<void> = Promise.resolve();

  const setState = (newState: PeerConnectionState): void => {
    state = newState;
    options.onStateChange(newState);
  };

  const createPeerConnection = (): RTCPeerConnection => {
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        options.onSignalingNeeded({
          type: "ice-candidate",
          roomId: options.roomId,
          senderPublicKey: options.publicKey,
          payload: { candidate: event.candidate.toJSON() },
        });
      }
    };

    connection.oniceconnectionstatechange = () => {
      // ICE state tracked via onconnectionstatechange
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

    return connection;
  };

  const setupDataChannel = (channel: RTCDataChannel): void => {
    dataChannel = channel;
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
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
    close,
    getState,
  };
};
