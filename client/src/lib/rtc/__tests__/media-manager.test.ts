import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaManager } from '../media-manager';

// Mock getNetworkTier
vi.mock('../network-quality', () => ({
  getNetworkTier: vi.fn(() => 'high'),
  onNetworkTierChange: vi.fn(() => () => {}),
}));

// Mock browser APIs
function createMockTrack(kind: 'audio' | 'video'): MediaStreamTrack {
  return {
    kind,
    enabled: true,
    readyState: 'live',
    stop: vi.fn(),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  } as unknown as MediaStreamTrack;
}

function createMockStream(audioTrack: MediaStreamTrack, videoTrack: MediaStreamTrack): MediaStream {
  const tracks = [audioTrack, videoTrack];
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter(t => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter(t => t.kind === 'video'),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
  } as unknown as MediaStream;
}

describe('MediaManager', () => {
  let manager: MediaManager;
  let mockAudioTrack: MediaStreamTrack;
  let mockVideoTrack: MediaStreamTrack;
  let mockStream: MediaStream;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockAudioTrack = createMockTrack('audio');
    mockVideoTrack = createMockTrack('video');
    mockStream = createMockStream(mockAudioTrack, mockVideoTrack);

    // Mock getUserMedia
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue(mockStream),
        },
      },
      writable: true,
      configurable: true,
    });

    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    manager = new MediaManager();
  });

  afterEach(() => {
    manager.destroy();
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  describe('acquire', () => {
    it('calls getUserMedia and emits acquired event', async () => {
      const handler = vi.fn();
      manager.on('acquired', handler);

      const stream = await manager.acquire();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
      expect(stream).toBe(mockStream);
      expect(handler).toHaveBeenCalledWith(mockStream);
      expect(manager.stream).toBe(mockStream);
    });

    it('sets isMicEnabled and isCamEnabled to true after acquire', async () => {
      await manager.acquire();
      expect(manager.isMicEnabled).toBe(true);
      expect(manager.isCamEnabled).toBe(true);
    });

    it('emits error with media-denied for NotAllowedError', async () => {
      const error = new DOMException('Permission denied', 'NotAllowedError');
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(error);

      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      await expect(manager.acquire()).rejects.toThrow();
      expect(errorHandler).toHaveBeenCalledWith({
        type: 'media-denied',
        message: 'Camera/mic access denied. Check browser permissions.',
      });
    });

    it('emits error with media-not-found for NotFoundError', async () => {
      const error = new DOMException('Device not found', 'NotFoundError');
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(error);

      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      await expect(manager.acquire()).rejects.toThrow();
      expect(errorHandler).toHaveBeenCalledWith({
        type: 'media-not-found',
        message: 'No camera or microphone found.',
      });
    });

    it('guards against stale acquire calls', async () => {
      // Start first acquire
      let resolveFirst!: (s: MediaStream) => void;
      vi.mocked(navigator.mediaDevices.getUserMedia)
        .mockReturnValueOnce(new Promise<MediaStream>(r => { resolveFirst = r; }))
        .mockResolvedValueOnce(mockStream);

      const firstPromise = manager.acquire();
      // Start second acquire before first resolves
      const secondPromise = manager.acquire();

      // Resolve first acquire
      resolveFirst(createMockStream(createMockTrack('audio'), createMockTrack('video')));

      // First should be rejected (stale), second should succeed
      await expect(firstPromise).rejects.toThrow('Stale acquire call');
      const stream = await secondPromise;
      expect(stream).toBe(mockStream);
    });
  });

  describe('toggleMic', () => {
    it('toggles audio track enabled state', async () => {
      await manager.acquire();
      expect(manager.isMicEnabled).toBe(true);

      manager.toggleMic();
      expect(mockAudioTrack.enabled).toBe(false);
      expect(manager.isMicEnabled).toBe(false);

      manager.toggleMic();
      expect(mockAudioTrack.enabled).toBe(true);
      expect(manager.isMicEnabled).toBe(true);
    });

    it('emits changed event on toggle', async () => {
      await manager.acquire();
      const handler = vi.fn();
      manager.on('changed', handler);

      manager.toggleMic();
      expect(handler).toHaveBeenCalledWith({ isMicEnabled: false, isCamEnabled: true });
    });

    it('does nothing if no stream', () => {
      // Should not throw
      manager.toggleMic();
    });
  });

  describe('toggleCam', () => {
    it('toggles video track enabled state', async () => {
      await manager.acquire();
      expect(manager.isCamEnabled).toBe(true);

      manager.toggleCam();
      expect(mockVideoTrack.enabled).toBe(false);
      expect(manager.isCamEnabled).toBe(false);
    });

    it('emits changed event on toggle', async () => {
      await manager.acquire();
      const handler = vi.fn();
      manager.on('changed', handler);

      manager.toggleCam();
      expect(handler).toHaveBeenCalledWith({ isMicEnabled: true, isCamEnabled: false });
    });
  });

  describe('release', () => {
    it('stops all tracks and emits released event', async () => {
      await manager.acquire();
      const handler = vi.fn();
      manager.on('released', handler);

      manager.release();

      expect(mockAudioTrack.stop).toHaveBeenCalled();
      expect(mockVideoTrack.stop).toHaveBeenCalled();
      expect(manager.stream).toBeNull();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — second release does nothing', async () => {
      await manager.acquire();
      const handler = vi.fn();
      manager.on('released', handler);

      manager.release();
      manager.release();

      expect(handler).toHaveBeenCalledTimes(1); // only once
    });
  });

  describe('getLocalTracks', () => {
    it('returns tracks and stream when acquired', async () => {
      await manager.acquire();
      const result = manager.getLocalTracks();

      expect(result).not.toBeNull();
      expect(result!.stream).toBe(mockStream);
      expect(result!.tracks).toEqual(mockStream.getTracks());
    });

    it('returns null when no stream', () => {
      expect(manager.getLocalTracks()).toBeNull();
    });
  });

  describe('destroy', () => {
    it('releases media and removes beforeunload handler', async () => {
      await manager.acquire();

      // Verify beforeunload was registered during acquire
      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

      manager.destroy();

      expect(mockAudioTrack.stop).toHaveBeenCalled();
      expect(mockVideoTrack.stop).toHaveBeenCalled();
      expect(manager.stream).toBeNull();

      // Verify beforeunload was removed during destroy
      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });
  });
});
