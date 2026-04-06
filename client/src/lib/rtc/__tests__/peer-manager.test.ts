import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PeerManager } from '../peer-manager';
import { SignalingManager } from '../signaling-manager';
import { MediaManager } from '../media-manager';

// ── Mock WebRTC APIs ────────────────────────────────────

function createMockRTCPeerConnection() {
  const pc: Record<string, unknown> = {
    connectionState: 'new',
    signalingState: 'stable',
    localDescription: null,
    remoteDescription: null,
    onicecandidate: null,
    onconnectionstatechange: null,
    ondatachannel: null,
    ontrack: null,
    createDataChannel: vi.fn(() => createMockDataChannel()),
    addTrack: vi.fn(() => createMockSender()),
    removeTrack: vi.fn(),
    getSenders: vi.fn(() => []),
    getTransceivers: vi.fn(() => []),
    addIceCandidate: vi.fn().mockResolvedValue(undefined),
    createOffer: vi.fn(async () => ({ type: 'offer' as const, sdp: 'mock-sdp' })),
    createAnswer: vi.fn(async () => ({ type: 'answer' as const, sdp: 'mock-sdp' })),
    setLocalDescription: vi.fn(async function (this: Record<string, unknown>, desc?: RTCSessionDescriptionInit) {
      if (desc?.type === 'rollback') {
        this.signalingState = 'stable';
        this.localDescription = null;
      } else {
        this.localDescription = desc ?? { type: 'offer', sdp: 'mock-sdp' };
      }
    }),
    setRemoteDescription: vi.fn(async function (this: Record<string, unknown>, desc: RTCSessionDescriptionInit) {
      this.remoteDescription = desc;
    }),
    restartIce: vi.fn(),
    close: vi.fn(),
    getStats: vi.fn().mockResolvedValue(new Map()),
  };
  return pc as unknown as RTCPeerConnection;
}

function createMockDataChannel(): RTCDataChannel {
  return {
    label: 'thechat',
    readyState: 'open',
    binaryType: 'arraybuffer',
    onmessage: null,
    onerror: null,
    onopen: null,
    onclose: null,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as RTCDataChannel;
}

function createMockSender(): RTCRtpSender {
  return {
    track: { kind: 'video' } as MediaStreamTrack,
    getParameters: vi.fn(() => ({ encodings: [{}] })),
    setParameters: vi.fn().mockResolvedValue(undefined),
    replaceTrack: vi.fn().mockResolvedValue(undefined),
  } as unknown as RTCRtpSender;
}

function createMockTrack(kind: 'audio' | 'video'): MediaStreamTrack {
  return {
    kind,
    enabled: true,
    readyState: 'live',
    stop: vi.fn(),
    onmute: null,
    onunmute: null,
    onended: null,
  } as unknown as MediaStreamTrack;
}

function createMockStream(): MediaStream {
  const audioTrack = createMockTrack('audio');
  const videoTrack = createMockTrack('video');
  const tracks = [audioTrack, videoTrack];
  return {
    getTracks: () => tracks,
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [videoTrack],
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
  } as unknown as MediaStream;
}

// ── Mock Dependencies ───────────────────────────────────

vi.mock('@/lib/codec-selection', () => ({
  applyCodecPreference: vi.fn(),
}));

vi.mock('@/lib/sdp-utils', () => ({
  enhanceOpusSdp: vi.fn((sdp: string) => sdp),
}));

// Save original and mock RTCPeerConnection globally
let mockPCInstances: ReturnType<typeof createMockRTCPeerConnection>[];

// ── Tests ───────────────────────────────────────────────

describe('PeerManager', () => {
  let peerManager: PeerManager;
  let mockSignaling: SignalingManager;
  let mockMedia: MediaManager;
  const iceConfig: RTCConfiguration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };
  const localPeerId = 'local-peer';
  const roomId = 'test-room';
  const codec = 'video/VP9';

  beforeEach(() => {
    mockPCInstances = [];

    // Mock RTCPeerConnection constructor
    vi.stubGlobal('RTCPeerConnection', vi.fn(() => {
      const pc = createMockRTCPeerConnection();
      mockPCInstances.push(pc);
      return pc;
    }));

    vi.stubGlobal('RTCIceCandidate', vi.fn((init: RTCIceCandidateInit) => init));

    // Create mock managers
    mockSignaling = {
      send: vi.fn(),
      on: vi.fn(() => () => {}),
      emit: vi.fn(),
      removeAllListeners: vi.fn(),
    } as unknown as SignalingManager;

    mockMedia = {
      getLocalTracks: vi.fn(() => ({
        tracks: [createMockTrack('audio'), createMockTrack('video')],
        stream: createMockStream(),
      })),
      stream: createMockStream(),
      on: vi.fn(() => () => {}),
      emit: vi.fn(),
      removeAllListeners: vi.fn(),
    } as unknown as MediaManager;

    peerManager = new PeerManager(
      iceConfig,
      mockSignaling,
      mockMedia,
      localPeerId,
      roomId,
      codec,
    );
  });

  afterEach(() => {
    peerManager.destroyAll();
    vi.unstubAllGlobals();
  });

  describe('handlePeerJoined', () => {
    it('creates RTCPeerConnection with ICE config', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');

      expect(RTCPeerConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          iceServers: iceConfig.iceServers,
        }),
      );
    });

    it('adds local tracks to the peer connection', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');

      const pc = mockPCInstances[0]!;
      expect(pc.addTrack).toHaveBeenCalled();
    });

    it('creates a data channel', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');

      const pc = mockPCInstances[0]!;
      expect(pc.createDataChannel).toHaveBeenCalledWith('thechat', { ordered: true });
    });

    it('creates and sends SDP offer', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');

      const pc = mockPCInstances[0]!;
      expect(pc.setLocalDescription).toHaveBeenCalled();
      expect(mockSignaling.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sdp-offer',
          roomId,
          peerId: localPeerId,
        }),
        'remote-1',
      );
    });

    it('emits peer-added event', async () => {
      const handler = vi.fn();
      peerManager.on('peer-added', handler);

      await peerManager.handlePeerJoined('remote-1', 'Bob');

      expect(handler).toHaveBeenCalledWith('remote-1', 'Bob');
    });

    it('does not duplicate if peer already exists', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      await peerManager.handlePeerJoined('remote-1', 'Bob');

      expect(mockPCInstances).toHaveLength(1);
    });
  });

  describe('handlePeerLeft', () => {
    it('closes connection and emits peer-removed', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      const handler = vi.fn();
      peerManager.on('peer-removed', handler);

      peerManager.handlePeerLeft('remote-1');

      expect(pc.close).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith('remote-1');
    });

    it('stops remote stream tracks', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      // Simulate receiving a remote track
      const remoteStream = createMockStream();
      const remoteTrack = createMockTrack('video');
      const trackEvent = {
        track: remoteTrack,
        streams: [remoteStream],
      } as unknown as RTCTrackEvent;
      (pc.ontrack as (e: RTCTrackEvent) => void)(trackEvent);

      peerManager.handlePeerLeft('remote-1');

      for (const track of remoteStream.getTracks()) {
        expect(track.stop).toHaveBeenCalled();
      }
    });

    it('ignores unknown peer', () => {
      // Should not throw
      peerManager.handlePeerLeft('unknown-peer');
    });
  });

  describe('handleSdpOffer', () => {
    it('creates peer if not exists, sets remote description, sends answer', async () => {
      const sdp: RTCSessionDescriptionInit = { type: 'offer', sdp: 'remote-offer-sdp' };

      await peerManager.handleSdpOffer('remote-1', sdp);

      const pc = mockPCInstances[0]!;
      expect(pc.setRemoteDescription).toHaveBeenCalledWith(sdp);
      expect(pc.setLocalDescription).toHaveBeenCalled();
      expect(mockSignaling.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sdp-answer',
          roomId,
          peerId: localPeerId,
        }),
        'remote-1',
      );
    });

    it('handles glare — polite peer rolls back', async () => {
      // Set up existing peer in have-local-offer state
      await peerManager.handlePeerJoined('remote-z', 'Zara');
      const pc = mockPCInstances[0]!;
      (pc as unknown as Record<string, string>).signalingState = 'have-local-offer';

      // local-peer < remote-z alphabetically, so local is polite
      const sdp: RTCSessionDescriptionInit = { type: 'offer', sdp: 'remote-offer' };
      await peerManager.handleSdpOffer('remote-z', sdp);

      // Polite peer should rollback then accept
      expect(pc.setLocalDescription).toHaveBeenCalledWith({ type: 'rollback' });
      expect(pc.setRemoteDescription).toHaveBeenCalledWith(sdp);
    });

    it('handles glare — impolite peer ignores incoming offer', async () => {
      // Set up existing peer with local-peer > remote-a (local is impolite)
      await peerManager.handlePeerJoined('a-remote', 'Aaron');
      const pc = mockPCInstances[0]!;
      (pc as unknown as Record<string, string>).signalingState = 'have-local-offer';

      const sdp: RTCSessionDescriptionInit = { type: 'offer', sdp: 'remote-offer' };
      await peerManager.handleSdpOffer('a-remote', sdp);

      // Impolite peer should NOT set remote description
      expect(pc.setRemoteDescription).not.toHaveBeenCalledWith(sdp);
    });
  });

  describe('handleSdpAnswer', () => {
    it('sets remote description on existing peer', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      const sdp: RTCSessionDescriptionInit = { type: 'answer', sdp: 'remote-answer-sdp' };
      await peerManager.handleSdpAnswer('remote-1', sdp);

      expect(pc.setRemoteDescription).toHaveBeenCalledWith(sdp);
    });

    it('drains ICE candidate queue after setting remote description', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      // Queue an ICE candidate before remote description is set
      (pc as unknown as Record<string, unknown>).remoteDescription = null;
      peerManager.handleIceCandidate('remote-1', { candidate: 'ice-1', sdpMid: '0', sdpMLineIndex: 0 });

      // Now set remote description (which should drain the queue)
      (pc as unknown as Record<string, unknown>).remoteDescription = { type: 'answer', sdp: 'sdp' };
      const sdp: RTCSessionDescriptionInit = { type: 'answer', sdp: 'answer-sdp' };
      await peerManager.handleSdpAnswer('remote-1', sdp);

      expect(pc.addIceCandidate).toHaveBeenCalled();
    });

    it('ignores unknown peer', async () => {
      // Should not throw
      await peerManager.handleSdpAnswer('unknown', { type: 'answer', sdp: 'sdp' });
    });
  });

  describe('handleIceCandidate', () => {
    it('adds candidate immediately if remote description exists', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;
      (pc as unknown as Record<string, unknown>).remoteDescription = { type: 'offer', sdp: 'sdp' };

      peerManager.handleIceCandidate('remote-1', { candidate: 'ice-1', sdpMid: '0', sdpMLineIndex: 0 });

      expect(pc.addIceCandidate).toHaveBeenCalled();
    });

    it('queues candidate if no remote description yet', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;
      (pc as unknown as Record<string, unknown>).remoteDescription = null;

      peerManager.handleIceCandidate('remote-1', { candidate: 'ice-1', sdpMid: '0', sdpMLineIndex: 0 });

      // Should NOT have called addIceCandidate yet
      expect(pc.addIceCandidate).not.toHaveBeenCalled();
    });

    it('ignores unknown peer', () => {
      // Should not throw
      peerManager.handleIceCandidate('unknown-peer', { candidate: 'ice-1', sdpMid: '0', sdpMLineIndex: 0 });
    });
  });

  describe('data channels', () => {
    it('emits message event for chat messages', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      // Get the data channel created during handlePeerJoined
      const dc = vi.mocked(pc.createDataChannel).mock.results[0]!.value as RTCDataChannel;

      const handler = vi.fn();
      peerManager.on('message', handler);

      // Simulate receiving a chat message
      const chatMsg = { type: 'chat', payload: { id: '1', senderName: 'Bob', text: 'hello', timestamp: 123 } };
      (dc.onmessage as (e: MessageEvent) => void)({ data: JSON.stringify(chatMsg) } as MessageEvent);

      expect(handler).toHaveBeenCalledWith('remote-1', chatMsg);
    });

    it('emits peer-media-state for media-state messages', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      const dc = vi.mocked(pc.createDataChannel).mock.results[0]!.value as RTCDataChannel;

      const handler = vi.fn();
      peerManager.on('peer-media-state', handler);

      const mediaStateMsg = { type: 'media-state', payload: { audioEnabled: false, videoEnabled: true } };
      (dc.onmessage as (e: MessageEvent) => void)({ data: JSON.stringify(mediaStateMsg) } as MessageEvent);

      expect(handler).toHaveBeenCalledWith('remote-1', { isMicEnabled: false, isCamEnabled: true, isScreenSharing: false });
    });
  });

  describe('sendToAll', () => {
    it('sends message to all peers with open data channels', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      await peerManager.handlePeerJoined('remote-2', 'Carol');

      const dc1 = vi.mocked(mockPCInstances[0]!.createDataChannel).mock.results[0]!.value as RTCDataChannel;
      const dc2 = vi.mocked(mockPCInstances[1]!.createDataChannel).mock.results[0]!.value as RTCDataChannel;

      const msg = { type: 'media-state' as const, payload: { audioEnabled: true, videoEnabled: false } };
      peerManager.sendToAll(msg);

      expect(dc1.send).toHaveBeenCalledWith(JSON.stringify(msg));
      expect(dc2.send).toHaveBeenCalledWith(JSON.stringify(msg));
    });
  });

  describe('replaceTrackOnAll', () => {
    it('replaces track immediately when signalingState is stable', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      const newTrack = createMockTrack('video');
      const senders = vi.mocked(pc.addTrack).mock.results.map(result => result.value as RTCRtpSender);

      peerManager.replaceTrackOnAll('video', newTrack);

      let replaceTrackCalled = false;
      for (const sender of senders) {
        if (sender.track?.kind === 'video' && vi.mocked(sender.replaceTrack).mock.calls.length > 0) {
          expect(sender.replaceTrack).toHaveBeenCalledWith(newTrack);
          replaceTrackCalled = true;
        }
      }
      expect(replaceTrackCalled).toBe(true);
    });

    it('queues track replacement when signalingState is have-local-offer', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;
      ;(pc as unknown as Record<string, string>).signalingState = 'have-local-offer';

      const newTrack = createMockTrack('video');
      const senders = vi.mocked(pc.addTrack).mock.results.map(result => result.value as RTCRtpSender);

      peerManager.replaceTrackOnAll('video', newTrack);

      // replaceTrack should NOT have been called on any sender (mid-negotiation)
      for (const sender of senders) {
        if (sender.track?.kind === 'video') {
          expect(sender.replaceTrack).not.toHaveBeenCalled();
        }
      }
    });

    it('skips track replacement when signalingState is closed', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;
      ;(pc as unknown as Record<string, string>).signalingState = 'closed';

      const newTrack = createMockTrack('video');

      peerManager.replaceTrackOnAll('video', newTrack);

      const senders = vi.mocked(pc.addTrack).mock.results.map(result => result.value as RTCRtpSender);
      for (const sender of senders) {
        if (sender.track?.kind === 'video') {
          expect(sender.replaceTrack).not.toHaveBeenCalled();
        }
      }
    });

    it('flushes queued track replacement when signalingState becomes stable', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;
      ;(pc as unknown as Record<string, string>).signalingState = 'have-local-offer';

      const newTrack = createMockTrack('video');
      peerManager.replaceTrackOnAll('video', newTrack);

      ;(pc as unknown as Record<string, string>).signalingState = 'stable';
      ;(pc as unknown as Record<string, (() => void) | null>).onsignalingstatechange?.();

      const senders = vi.mocked(pc.addTrack).mock.results.map(result => result.value as RTCRtpSender);
      let replaceTrackCalled = false;
      for (const sender of senders) {
        if (sender.track?.kind === 'video' && vi.mocked(sender.replaceTrack).mock.calls.length > 0) {
          expect(sender.replaceTrack).toHaveBeenCalledWith(newTrack);
          replaceTrackCalled = true;
        }
      }
      expect(replaceTrackCalled).toBe(true);
    });
  });

  describe('data channel message queue', () => {
    it('queues messages when data channel is not open', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      const dc = vi.mocked(pc.createDataChannel).mock.results[0]!.value as RTCDataChannel;
      ;(dc as unknown as Record<string, string>).readyState = 'connecting';

      const msg = { type: 'media-state' as const, payload: { audioEnabled: true, videoEnabled: false } };
      peerManager.sendToAll(msg);

      expect(dc.send).not.toHaveBeenCalled();
    });

    it('flushes queued messages when data channel opens', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      const dc = vi.mocked(pc.createDataChannel).mock.results[0]!.value as RTCDataChannel;
      ;(dc as unknown as Record<string, string>).readyState = 'connecting';

      const msg = { type: 'media-state' as const, payload: { audioEnabled: true, videoEnabled: false } };
      peerManager.sendToAll(msg);

      expect(dc.send).not.toHaveBeenCalled();

      ;(dc as unknown as Record<string, string>).readyState = 'open';
      ;(dc as unknown as Record<string, (() => void) | null>).onopen?.();

      expect(dc.send).toHaveBeenCalledWith(JSON.stringify(msg));
    });
  });

  describe('ICE restart', () => {
    it('restarts ICE on connection failure', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      // Simulate connection failure
      (pc as unknown as Record<string, string>).connectionState = 'failed';
      (pc.onconnectionstatechange as () => void)();

      expect(pc.restartIce).toHaveBeenCalled();
    });

    it('resets ICE restart counter on successful connection', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      // Simulate failure then success
      (pc as unknown as Record<string, string>).connectionState = 'failed';
      (pc.onconnectionstatechange as () => void)();

      (pc as unknown as Record<string, string>).connectionState = 'connected';
      (pc.onconnectionstatechange as () => void)();

      // Should be able to restart again after reset
      (pc as unknown as Record<string, string>).connectionState = 'failed';
      (pc.onconnectionstatechange as () => void)();

      expect(pc.restartIce).toHaveBeenCalledTimes(2);
    });
  });

  describe('ontrack', () => {
    it('emits peer-stream when remote track is received', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      const handler = vi.fn();
      peerManager.on('peer-stream', handler);

      const remoteStream = createMockStream();
      const trackEvent = {
        track: createMockTrack('video'),
        streams: [remoteStream],
      } as unknown as RTCTrackEvent;

      (pc.ontrack as (e: RTCTrackEvent) => void)(trackEvent);

      expect(handler).toHaveBeenCalledWith('remote-1', remoteStream);
    });

    it('creates new MediaStream if event.streams is empty (Safari fallback)', async () => {
      vi.stubGlobal('MediaStream', vi.fn(() => ({
        addTrack: vi.fn(),
        getTracks: () => [],
        getAudioTracks: () => [],
        getVideoTracks: () => [],
        removeTrack: vi.fn(),
      })));

      await peerManager.handlePeerJoined('remote-1', 'Bob');
      const pc = mockPCInstances[0]!;

      const handler = vi.fn();
      peerManager.on('peer-stream', handler);

      const trackEvent = {
        track: createMockTrack('video'),
        streams: [],
      } as unknown as RTCTrackEvent;

      (pc.ontrack as (e: RTCTrackEvent) => void)(trackEvent);

      expect(handler).toHaveBeenCalledWith('remote-1', expect.anything());
    });
  });

  describe('destroyAll', () => {
    it('closes all peer connections and clears peers map', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');
      await peerManager.handlePeerJoined('remote-2', 'Carol');

      peerManager.destroyAll();

      expect(mockPCInstances[0]!.close).toHaveBeenCalled();
      expect(mockPCInstances[1]!.close).toHaveBeenCalled();
      expect(peerManager.getPeers().size).toBe(0);
    });
  });

  describe('getPeers', () => {
    it('returns PeerSnapshot map', async () => {
      await peerManager.handlePeerJoined('remote-1', 'Bob');

      const peers = peerManager.getPeers();
      expect(peers.size).toBe(1);

      const snapshot = peers.get('remote-1')!;
      expect(snapshot.displayName).toBe('Bob');
      expect(snapshot.audioEnabled).toBe(true);
      expect(snapshot.videoEnabled).toBe(true);
    });
  });
});
