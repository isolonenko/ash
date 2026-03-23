import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRTCStore } from '../rtc-store'
import type { StoreApi } from 'zustand'

// ── Mock RTCClient ──────────────────────────────────────

const mockConnect = vi.fn().mockResolvedValue(undefined)
const mockDestroy = vi.fn()
const mockToggleMic = vi.fn()
const mockToggleCam = vi.fn()
const mockStartScreenShare = vi.fn().mockResolvedValue(undefined)
const mockStopScreenShare = vi.fn().mockResolvedValue(undefined)
const mockSendMessage = vi.fn()
const mockOn = vi.fn<(event: string, handler: (...args: unknown[]) => void) => void>()

vi.mock('@/lib/rtc', () => ({
  RTCClient: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    destroy: mockDestroy,
    toggleMic: mockToggleMic,
    toggleCam: mockToggleCam,
    startScreenShare: mockStartScreenShare,
    stopScreenShare: mockStopScreenShare,
    sendMessage: mockSendMessage,
    on: mockOn,
  })),
}))

const { mockMediaRelease } = vi.hoisted(() => ({
  mockMediaRelease: vi.fn(),
}))

vi.mock('@/lib/rtc/media-manager-instance', () => ({
  mediaManager: { _mock: true, release: mockMediaRelease },
}))

// ── Mock sessionStorage ─────────────────────────────────

const mockGetItem = vi.fn().mockReturnValue(null)
const mockSetItem = vi.fn()
const mockRemoveItem = vi.fn()
const mockClear = vi.fn()

Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: mockRemoveItem,
    clear: mockClear,
  },
  writable: true,
})

// ── Helpers ─────────────────────────────────────────────

type RTCStore = ReturnType<typeof createRTCStore> extends StoreApi<infer S> ? S : never

function getEventHandler(eventName: string) {
  const call = mockOn.mock.calls.find(([name]) => name === eventName)
  if (!call) throw new Error(`No handler registered for event "${eventName}"`)
  return call[1] as (...args: unknown[]) => void
}

// ── Tests ───────────────────────────────────────────────

describe('rtc-store', () => {
  let store: StoreApi<RTCStore>

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetItem.mockReturnValue(null)
    store = createRTCStore()
  })

  afterEach(() => {
    store.getState().disconnect()
  })

  // ── Initial state ───────────────────────────────────────

  describe('initial state', () => {
    it('starts with idle connectionState and empty collections', () => {
      const s = store.getState()
      expect(s.connectionState).toBe('idle')
      expect(s.localStream).toBeNull()
      expect(s.isMicEnabled).toBe(true)
      expect(s.isCamEnabled).toBe(true)
      expect(s.isScreenSharing).toBe(false)
      expect(s.peers).toEqual(new Map())
      expect(s.messages).toEqual([])
      expect(s.lastError).toBeNull()
    })
  })

  // ── Connect ─────────────────────────────────────────────

  describe('connect', () => {
    it('creates RTCClient and calls connect()', async () => {
      await store.getState().connect('room-1', 'peer-1', 'Alice', true, true)

      const { RTCClient } = await import('@/lib/rtc')
      expect(RTCClient).toHaveBeenCalledWith({
        roomId: 'room-1',
        peerId: 'peer-1',
        displayName: 'Alice',
        mediaManager: expect.any(Object),
      })
      expect(mockConnect).toHaveBeenCalledOnce()
    })

    it('wires all RTCClient event listeners', async () => {
      await store.getState().connect('room-1', 'peer-1', 'Alice', true, true)

      const eventNames = mockOn.mock.calls.map(([name]) => name)
      expect(eventNames).toContain('connection-state')
      expect(eventNames).toContain('media-acquired')
      expect(eventNames).toContain('media-changed')
      expect(eventNames).toContain('media-released')
      expect(eventNames).toContain('peer-added')
      expect(eventNames).toContain('peer-removed')
      expect(eventNames).toContain('peer-stream')
      expect(eventNames).toContain('peer-stream-removed')
      expect(eventNames).toContain('peer-connection-state')
      expect(eventNames).toContain('peer-media-state')
      expect(eventNames).toContain('message')
      expect(eventNames).toContain('error')
    })

    it('toggles mic off after connect when initialAudioEnabled is false', async () => {
      await store.getState().connect('room-1', 'peer-1', 'Alice', false, true)
      expect(mockToggleMic).toHaveBeenCalledOnce()
      expect(mockToggleCam).not.toHaveBeenCalled()
    })

    it('toggles cam off after connect when initialVideoEnabled is false', async () => {
      await store.getState().connect('room-1', 'peer-1', 'Alice', true, false)
      expect(mockToggleCam).toHaveBeenCalledOnce()
      expect(mockToggleMic).not.toHaveBeenCalled()
    })

    it('does not toggle when initial media state matches defaults', async () => {
      await store.getState().connect('room-1', 'peer-1', 'Alice', true, true)
      expect(mockToggleMic).not.toHaveBeenCalled()
      expect(mockToggleCam).not.toHaveBeenCalled()
    })

    it('ignores second connect call if already connected (StrictMode guard)', async () => {
      await store.getState().connect('room-1', 'peer-1', 'Alice', true, true)
      await store.getState().connect('room-1', 'peer-1', 'Alice', true, true)

      const { RTCClient } = await import('@/lib/rtc')
      expect(RTCClient).toHaveBeenCalledTimes(1)
      expect(mockConnect).toHaveBeenCalledOnce()
    })

    it('loads persisted messages from sessionStorage on connect', async () => {
      const persisted = [{ id: 'msg-1', senderId: 'p1', senderName: 'Bob', text: 'hi', timestamp: 1, fromMe: false }]
      mockGetItem.mockReturnValue(JSON.stringify(persisted))

      await store.getState().connect('room-1', 'peer-1', 'Alice', true, true)

      expect(mockGetItem).toHaveBeenCalledWith('messages-room-1')
      expect(store.getState().messages).toEqual(persisted)
    })
  })

  // ── Event handlers → state updates ──────────────────────

  describe('event handlers → state updates', () => {
    beforeEach(async () => {
      await store.getState().connect('room-1', 'peer-1', 'Alice', true, true)
    })

    it('connection-state event updates connectionState', () => {
      const handler = getEventHandler('connection-state')
      handler('connected')
      expect(store.getState().connectionState).toBe('connected')
    })

    it('media-acquired event updates localStream', () => {
      const handler = getEventHandler('media-acquired')
      const stream = {} as MediaStream
      handler(stream)
      expect(store.getState().localStream).toBe(stream)
    })

    it('media-changed event updates isMicEnabled and isCamEnabled', () => {
      const handler = getEventHandler('media-changed')
      handler({ isMicEnabled: false, isCamEnabled: false })
      expect(store.getState().isMicEnabled).toBe(false)
      expect(store.getState().isCamEnabled).toBe(false)
    })

    it('media-changed event updates isScreenSharing', () => {
      const handler = getEventHandler('media-changed')
      handler({ isMicEnabled: true, isCamEnabled: true, isScreenSharing: true })
      expect(store.getState().isScreenSharing).toBe(true)
    })

    it('media-released event clears localStream', () => {
      const acquireHandler = getEventHandler('media-acquired')
      acquireHandler({} as MediaStream)
      expect(store.getState().localStream).not.toBeNull()

      const handler = getEventHandler('media-released')
      handler()
      expect(store.getState().localStream).toBeNull()
    })

    it('peer-added event adds peer to peers map', () => {
      const handler = getEventHandler('peer-added')
      handler('peer-2', 'Bob')

      const peer = store.getState().peers.get('peer-2')
      expect(peer).toBeDefined()
      expect(peer!.displayName).toBe('Bob')
      expect(peer!.stream).toBeNull()
      expect(peer!.connectionState).toBe('new')
      expect(peer!.audioEnabled).toBe(true)
      expect(peer!.videoEnabled).toBe(true)
    })

    it('peer-removed event removes peer from peers map', () => {
      const addHandler = getEventHandler('peer-added')
      addHandler('peer-2', 'Bob')
      expect(store.getState().peers.has('peer-2')).toBe(true)

      const handler = getEventHandler('peer-removed')
      handler('peer-2')
      expect(store.getState().peers.has('peer-2')).toBe(false)
    })

    it('peer-stream event updates peer stream', () => {
      const addHandler = getEventHandler('peer-added')
      addHandler('peer-2', 'Bob')

      const handler = getEventHandler('peer-stream')
      const stream = {} as MediaStream
      handler('peer-2', stream)

      expect(store.getState().peers.get('peer-2')!.stream).toBe(stream)
    })

    it('peer-stream event is ignored for unknown peer', () => {
      const handler = getEventHandler('peer-stream')
      const stream = {} as MediaStream

      // Should not throw
      handler('unknown-peer', stream)
      expect(store.getState().peers.has('unknown-peer')).toBe(false)
    })

    it('peer-stream-removed event clears peer stream', () => {
      const addHandler = getEventHandler('peer-added')
      addHandler('peer-2', 'Bob')

      const streamHandler = getEventHandler('peer-stream')
      streamHandler('peer-2', {} as MediaStream)
      expect(store.getState().peers.get('peer-2')!.stream).not.toBeNull()

      const handler = getEventHandler('peer-stream-removed')
      handler('peer-2')
      expect(store.getState().peers.get('peer-2')!.stream).toBeNull()
    })

    it('peer-connection-state event updates peer connectionState', () => {
      const addHandler = getEventHandler('peer-added')
      addHandler('peer-2', 'Bob')

      const handler = getEventHandler('peer-connection-state')
      handler('peer-2', 'connected')
      expect(store.getState().peers.get('peer-2')!.connectionState).toBe('connected')
    })

    it('peer-media-state event updates peer audioEnabled and videoEnabled', () => {
      const addHandler = getEventHandler('peer-added')
      addHandler('peer-2', 'Bob')

      const handler = getEventHandler('peer-media-state')
      handler('peer-2', { isMicEnabled: false, isCamEnabled: false })

      const peer = store.getState().peers.get('peer-2')!
      expect(peer.audioEnabled).toBe(false)
      expect(peer.videoEnabled).toBe(false)
    })

    it('message event appends message and persists to sessionStorage', () => {
      const handler = getEventHandler('message')
      const msg = { id: 'msg-1', senderId: 'p2', senderName: 'Bob', text: 'hi', timestamp: 1, fromMe: false }
      handler(msg)

      expect(store.getState().messages).toEqual([msg])
      expect(mockSetItem).toHaveBeenCalledWith('messages-room-1', JSON.stringify([msg]))
    })

    it('message event deduplicates by id', () => {
      const handler = getEventHandler('message')
      const msg = { id: 'msg-1', senderId: 'p2', senderName: 'Bob', text: 'hi', timestamp: 1, fromMe: false }
      handler(msg)
      handler(msg)

      expect(store.getState().messages).toHaveLength(1)
    })

    it('error event updates lastError', () => {
      const handler = getEventHandler('error')
      const error = { type: 'unknown' as const, message: 'something broke' }
      handler(error)
      expect(store.getState().lastError).toEqual(error)
    })
  })

  // ── Actions ─────────────────────────────────────────────

  describe('actions', () => {
    beforeEach(async () => {
      await store.getState().connect('room-1', 'peer-1', 'Alice', true, true)
    })

    it('toggleMic delegates to RTCClient', () => {
      store.getState().toggleMic()
      expect(mockToggleMic).toHaveBeenCalledOnce()
    })

    it('toggleCam delegates to RTCClient', () => {
      store.getState().toggleCam()
      expect(mockToggleCam).toHaveBeenCalledOnce()
    })

    it('startScreenShare delegates to RTCClient', async () => {
      await store.getState().startScreenShare()
      expect(mockStartScreenShare).toHaveBeenCalledOnce()
    })

    it('stopScreenShare delegates to RTCClient', async () => {
      await store.getState().stopScreenShare()
      expect(mockStopScreenShare).toHaveBeenCalledOnce()
    })

    it('sendMessage delegates to RTCClient', () => {
      store.getState().sendMessage('hello')
      expect(mockSendMessage).toHaveBeenCalledWith('hello')
    })
  })

  // ── Disconnect ──────────────────────────────────────────

  describe('disconnect', () => {
    it('destroys RTCClient and resets state', async () => {
      await store.getState().connect('room-1', 'peer-1', 'Alice', true, true)

      // Add some state
      const addHandler = getEventHandler('peer-added')
      addHandler('peer-2', 'Bob')

      const mediaHandler = getEventHandler('media-changed')
      mediaHandler({ isMicEnabled: true, isCamEnabled: true, isScreenSharing: true })
      expect(store.getState().isScreenSharing).toBe(true)

      store.getState().disconnect()

      expect(mockDestroy).toHaveBeenCalledOnce()
      const s = store.getState()
      expect(s.connectionState).toBe('idle')
      expect(s.localStream).toBeNull()
      expect(s.isScreenSharing).toBe(false)
      expect(s.peers).toEqual(new Map())
      expect(s.messages).toEqual([])
      expect(s.lastError).toBeNull()
    })

    it('clears sessionStorage for the room', async () => {
      await store.getState().connect('room-1', 'peer-1', 'Alice', true, true)
      store.getState().disconnect()
      expect(mockRemoveItem).toHaveBeenCalledWith('messages-room-1')
    })

    it('releases mediaManager on disconnect', async () => {
      await store.getState().connect('room-1', 'peer-1', 'Alice', true, true)
      store.getState().disconnect()
      expect(mockMediaRelease).toHaveBeenCalled()
    })

    it('is safe to call without prior connect', () => {
      expect(() => store.getState().disconnect()).not.toThrow()
    })
  })

  // ── Actions before connect ──────────────────────────────

  describe('actions before connect', () => {
    it('toggleMic is safe before connect', () => {
      expect(() => store.getState().toggleMic()).not.toThrow()
    })

    it('toggleCam is safe before connect', () => {
      expect(() => store.getState().toggleCam()).not.toThrow()
    })

    it('startScreenShare is safe before connect', async () => {
      await expect(store.getState().startScreenShare()).resolves.not.toThrow()
    })

    it('stopScreenShare is safe before connect', async () => {
      await expect(store.getState().stopScreenShare()).resolves.not.toThrow()
    })

    it('sendMessage is safe before connect', () => {
      expect(() => store.getState().sendMessage('hello')).not.toThrow()
    })
  })
})
