import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MediaManager } from '../media-manager'

// Mock getNetworkTier
vi.mock('../network-quality', () => ({
  getNetworkTier: vi.fn(() => 'high'),
  onNetworkTierChange: vi.fn(() => () => {}),
}))

// ── Mock Helpers ────────────────────────────────────────

function createMockTrack(kind: 'audio' | 'video', deviceId = 'default'): MediaStreamTrack {
  return {
    kind,
    enabled: true,
    readyState: 'live',
    stop: vi.fn(),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    getSettings: () => ({ deviceId }),
  } as unknown as MediaStreamTrack
}

function createMockStream(tracks: MediaStreamTrack[]): MediaStream {
  const _tracks = [...tracks]
  return {
    getTracks: () => _tracks,
    getAudioTracks: () => _tracks.filter(t => t.kind === 'audio'),
    getVideoTracks: () => _tracks.filter(t => t.kind === 'video'),
    addTrack: vi.fn((t: MediaStreamTrack) => _tracks.push(t)),
    removeTrack: vi.fn((t: MediaStreamTrack) => {
      const idx = _tracks.indexOf(t)
      if (idx !== -1) _tracks.splice(idx, 1)
    }),
  } as unknown as MediaStream
}

function createMockDevice(kind: 'audioinput' | 'videoinput', id: string, label: string): MediaDeviceInfo {
  return {
    deviceId: id,
    groupId: 'group-' + id,
    kind,
    label,
    toJSON: () => ({}),
  } as MediaDeviceInfo
}

// ── Setup ───────────────────────────────────────────────

describe('MediaManager', () => {
  let manager: MediaManager
  let mockGetUserMedia: ReturnType<typeof vi.fn>
  let mockEnumerateDevices: ReturnType<typeof vi.fn>
  let deviceChangeListeners: Array<() => void>
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>

  const defaultAudioDevice = createMockDevice('audioinput', 'audio-1', 'Built-in Mic')
  const defaultVideoDevice = createMockDevice('videoinput', 'video-1', 'Built-in Camera')
  const secondAudioDevice = createMockDevice('audioinput', 'audio-2', 'USB Mic')

  beforeEach(() => {
    deviceChangeListeners = []
    mockGetUserMedia = vi.fn()
    mockEnumerateDevices = vi.fn()

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        mediaDevices: {
          getUserMedia: mockGetUserMedia,
          enumerateDevices: mockEnumerateDevices,
          addEventListener: vi.fn((event: string, handler: () => void) => {
            if (event === 'devicechange') deviceChangeListeners.push(handler)
          }),
          removeEventListener: vi.fn((event: string, handler: () => void) => {
            if (event === 'devicechange') {
              deviceChangeListeners = deviceChangeListeners.filter(h => h !== handler)
            }
          }),
        },
      },
      writable: true,
      configurable: true,
    })

    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    manager = new MediaManager()
  })

  afterEach(() => {
    manager.destroy()
    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })

  // ── enumerate() ─────────────────────────────────────

  describe('enumerate', () => {
    it('categorizes audio and video devices', async () => {
      mockEnumerateDevices.mockResolvedValue([
        defaultAudioDevice,
        defaultVideoDevice,
        secondAudioDevice,
      ])

      await manager.enumerate()

      expect(manager.devices.audio).toHaveLength(2)
      expect(manager.devices.video).toHaveLength(1)
      expect(manager.devices.audio[0].label).toBe('Built-in Mic')
    })

    it('emits devices-changed event', async () => {
      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice])
      const handler = vi.fn()
      manager.on('devices-changed', handler)

      await manager.enumerate()

      expect(handler).toHaveBeenCalledWith({
        audio: [defaultAudioDevice],
        video: [],
      })
    })

    it('registers devicechange listener for hot-plug', async () => {
      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice])

      await manager.enumerate()

      expect(navigator.mediaDevices.addEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function),
      )
    })
  })

  // ── acquire() ───────────────────────────────────────

  describe('acquire', () => {
    it('acquires stream with both devices and emits acquired', async () => {
      const audioTrack = createMockTrack('audio', 'audio-1')
      const videoTrack = createMockTrack('video', 'video-1')
      const stream = createMockStream([audioTrack, videoTrack])

      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValue(stream)

      const handler = vi.fn()
      manager.on('acquired', handler)

      const result = await manager.acquire()

      expect(result).toBe(stream)
      expect(manager.stream).toBe(stream)
      expect(manager.isMicEnabled).toBe(true)
      expect(manager.isCamEnabled).toBe(true)
      expect(handler).toHaveBeenCalledWith(stream)
    })

    it('acquires audio-only when no video devices exist', async () => {
      const audioTrack = createMockTrack('audio', 'audio-1')
      const stream = createMockStream([audioTrack])

      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice])
      mockGetUserMedia.mockResolvedValue(stream)

      await manager.acquire()

      // getUserMedia should have been called with video: false
      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ video: false }),
      )
      expect(manager.isCamEnabled).toBe(false)
      expect(manager.isMicEnabled).toBe(true)
    })

    it('acquires video-only when no audio devices exist', async () => {
      const videoTrack = createMockTrack('video', 'video-1')
      const stream = createMockStream([videoTrack])

      mockEnumerateDevices.mockResolvedValue([defaultVideoDevice])
      mockGetUserMedia.mockResolvedValue(stream)

      await manager.acquire()

      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ audio: false }),
      )
      expect(manager.isMicEnabled).toBe(false)
      expect(manager.isCamEnabled).toBe(true)
    })

    it('throws and emits media-not-found when no devices exist', async () => {
      mockEnumerateDevices.mockResolvedValue([])

      const errorHandler = vi.fn()
      manager.on('error', errorHandler)

      await expect(manager.acquire()).rejects.toThrow()

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'media-not-found' }),
      )
      expect(manager.stream).toBeNull()
    })

    it('applies selected deviceIds when specified', async () => {
      const audioTrack = createMockTrack('audio', 'audio-2')
      const videoTrack = createMockTrack('video', 'video-1')
      const stream = createMockStream([audioTrack, videoTrack])

      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, secondAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValue(stream)

      await manager.acquire({ audioDeviceId: 'audio-2' })

      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            deviceId: { exact: 'audio-2' },
          }),
        }),
      )
    })

    it('emits media-denied for NotAllowedError', async () => {
      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))

      const errorHandler = vi.fn()
      manager.on('error', errorHandler)

      await expect(manager.acquire()).rejects.toThrow()

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'media-denied' }),
      )
    })

    it('guards against stale acquire calls', async () => {
      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, defaultVideoDevice])

      let resolveFirst!: (s: MediaStream) => void
      const firstStream = createMockStream([createMockTrack('audio'), createMockTrack('video')])
      const secondStream = createMockStream([createMockTrack('audio'), createMockTrack('video')])

      mockGetUserMedia
        .mockReturnValueOnce(new Promise<MediaStream>(r => { resolveFirst = r }))
        .mockResolvedValueOnce(secondStream)

      const firstPromise = manager.acquire()
      const secondPromise = manager.acquire()

      resolveFirst(firstStream)

      await expect(firstPromise).rejects.toThrow('Stale acquire call')
      const result = await secondPromise
      expect(result).toBe(secondStream)
    })
  })

  // ── switchDevice() ──────────────────────────────────

  describe('switchDevice', () => {
    it('replaces the audio track and calls onTrackReplaced', async () => {
      // Setup: acquire with default devices
      const oldAudioTrack = createMockTrack('audio', 'audio-1')
      const videoTrack = createMockTrack('video', 'video-1')
      const stream = createMockStream([oldAudioTrack, videoTrack])

      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, secondAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValueOnce(stream)

      await manager.acquire()

      // Setup: new track for switch
      const newAudioTrack = createMockTrack('audio', 'audio-2')
      const newStream = createMockStream([newAudioTrack])
      mockGetUserMedia.mockResolvedValueOnce(newStream)

      const onTrackReplaced = vi.fn()
      manager.onTrackReplaced = onTrackReplaced

      await manager.switchDevice('audio', 'audio-2')

      expect(oldAudioTrack.stop).toHaveBeenCalled()
      expect(stream.removeTrack).toHaveBeenCalledWith(oldAudioTrack)
      expect(stream.addTrack).toHaveBeenCalledWith(newAudioTrack)
      expect(manager.selectedAudioId).toBe('audio-2')
      expect(onTrackReplaced).toHaveBeenCalledWith('audio', newAudioTrack)
    })

    it('emits device-switched event on success', async () => {
      const audioTrack = createMockTrack('audio', 'audio-1')
      const videoTrack = createMockTrack('video', 'video-1')
      const stream = createMockStream([audioTrack, videoTrack])

      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, secondAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValueOnce(stream)

      await manager.acquire()

      const newAudioTrack = createMockTrack('audio', 'audio-2')
      mockGetUserMedia.mockResolvedValueOnce(createMockStream([newAudioTrack]))

      const handler = vi.fn()
      manager.on('device-switched', handler)

      await manager.switchDevice('audio', 'audio-2')

      expect(handler).toHaveBeenCalledWith('audio', 'audio-2')
    })

    it('keeps current track on failure and emits error', async () => {
      const audioTrack = createMockTrack('audio', 'audio-1')
      const videoTrack = createMockTrack('video', 'video-1')
      const stream = createMockStream([audioTrack, videoTrack])

      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, secondAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValueOnce(stream)

      await manager.acquire()

      mockGetUserMedia.mockRejectedValueOnce(new Error('Device busy'))

      const errorHandler = vi.fn()
      manager.on('error', errorHandler)

      // Should NOT throw (non-fatal)
      await manager.switchDevice('audio', 'bad-id')

      expect(audioTrack.stop).not.toHaveBeenCalled()
      expect(errorHandler).toHaveBeenCalled()
    })
  })

  // ── Hot-plug ────────────────────────────────────────

  describe('hot-plug', () => {
    it('updates device list when devicechange fires', async () => {
      mockEnumerateDevices.mockResolvedValueOnce([defaultAudioDevice, defaultVideoDevice])
      await manager.enumerate()

      // Simulate hot-plug: new device appears
      mockEnumerateDevices.mockResolvedValueOnce([defaultAudioDevice, secondAudioDevice, defaultVideoDevice])

      const handler = vi.fn()
      manager.on('devices-changed', handler)

      // Fire the devicechange listener
      await Promise.resolve() // flush
      for (const listener of deviceChangeListeners) listener()
      await vi.waitFor(() => expect(handler).toHaveBeenCalled())

      expect(manager.devices.audio).toHaveLength(2)
    })

    it('auto-switches when active device is unplugged', async () => {
      // Acquire with audio-1
      const audioTrack = createMockTrack('audio', 'audio-1')
      const videoTrack = createMockTrack('video', 'video-1')
      const stream = createMockStream([audioTrack, videoTrack])

      // acquire() calls enumerate() twice: once before getUserMedia, once after
      mockEnumerateDevices.mockResolvedValueOnce([defaultAudioDevice, secondAudioDevice, defaultVideoDevice])
      mockEnumerateDevices.mockResolvedValueOnce([defaultAudioDevice, secondAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValueOnce(stream)

      await manager.acquire()

      // Simulate: audio-1 unplugged, only audio-2 remains
      mockEnumerateDevices.mockResolvedValueOnce([secondAudioDevice, defaultVideoDevice])
      const newAudioTrack = createMockTrack('audio', 'audio-2')
      mockGetUserMedia.mockResolvedValueOnce(createMockStream([newAudioTrack]))

      const switchHandler = vi.fn()
      manager.on('device-switched', switchHandler)

      // Fire devicechange
      for (const listener of deviceChangeListeners) listener()
      await vi.waitFor(() => expect(switchHandler).toHaveBeenCalled())

      expect(switchHandler).toHaveBeenCalledWith('audio', 'audio-2')
    })
  })

  // ── toggleMic / toggleCam (existing behavior) ─────

  describe('toggleMic', () => {
    it('toggles audio track enabled state', async () => {
      const audioTrack = createMockTrack('audio')
      const videoTrack = createMockTrack('video')
      const stream = createMockStream([audioTrack, videoTrack])

      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValue(stream)

      await manager.acquire()
      expect(manager.isMicEnabled).toBe(true)

      manager.toggleMic()
      expect(audioTrack.enabled).toBe(false)
      expect(manager.isMicEnabled).toBe(false)

      manager.toggleMic()
      expect(audioTrack.enabled).toBe(true)
      expect(manager.isMicEnabled).toBe(true)
    })

    it('emits changed event on toggle', async () => {
      const audioTrack = createMockTrack('audio')
      const videoTrack = createMockTrack('video')
      const stream = createMockStream([audioTrack, videoTrack])

      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValue(stream)

      await manager.acquire()
      const handler = vi.fn()
      manager.on('changed', handler)

      manager.toggleMic()
      expect(handler).toHaveBeenCalledWith({ isMicEnabled: false, isCamEnabled: true })
    })

    it('does nothing if no stream', () => {
      manager.toggleMic() // should not throw
    })
  })

  describe('toggleCam', () => {
    it('toggles video track enabled state', async () => {
      const audioTrack = createMockTrack('audio')
      const videoTrack = createMockTrack('video')
      const stream = createMockStream([audioTrack, videoTrack])

      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValue(stream)

      await manager.acquire()
      expect(manager.isCamEnabled).toBe(true)

      manager.toggleCam()
      expect(videoTrack.enabled).toBe(false)
      expect(manager.isCamEnabled).toBe(false)
    })
  })

  // ── release / destroy ─────────────────────────────

  describe('release', () => {
    it('stops all tracks and emits released event', async () => {
      const audioTrack = createMockTrack('audio')
      const videoTrack = createMockTrack('video')
      const stream = createMockStream([audioTrack, videoTrack])

      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValue(stream)

      await manager.acquire()
      const handler = vi.fn()
      manager.on('released', handler)

      manager.release()

      expect(audioTrack.stop).toHaveBeenCalled()
      expect(videoTrack.stop).toHaveBeenCalled()
      expect(manager.stream).toBeNull()
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('is idempotent — second release does nothing', async () => {
      const stream = createMockStream([createMockTrack('audio'), createMockTrack('video')])
      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValue(stream)

      await manager.acquire()
      const handler = vi.fn()
      manager.on('released', handler)

      manager.release()
      manager.release()

      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  describe('getLocalTracks', () => {
    it('returns tracks and stream when acquired', async () => {
      const stream = createMockStream([createMockTrack('audio'), createMockTrack('video')])
      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValue(stream)

      await manager.acquire()
      const result = manager.getLocalTracks()

      expect(result).not.toBeNull()
      expect(result!.stream).toBe(stream)
    })

    it('returns null when no stream', () => {
      expect(manager.getLocalTracks()).toBeNull()
    })
  })

  describe('destroy', () => {
    it('releases media, removes listeners, and cleans up devicechange listener', async () => {
      const stream = createMockStream([createMockTrack('audio'), createMockTrack('video')])
      mockEnumerateDevices.mockResolvedValue([defaultAudioDevice, defaultVideoDevice])
      mockGetUserMedia.mockResolvedValue(stream)

      await manager.acquire()

      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

      manager.destroy()

      expect(manager.stream).toBeNull()
      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
      expect(navigator.mediaDevices.removeEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function),
      )
    })
  })
})
