import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RTCClient } from '../rtc-client'
import type { RTCClientOptions, RTCClientState } from '../types'

// ── Mock dependencies ───────────────────────────────────

// Mock fetchTurnCredentials
vi.mock('@/lib/turn', () => ({
  fetchTurnCredentials: vi.fn().mockResolvedValue({
    iceServers: [{ urls: 'stun:stun.test:19302' }],
    iceTransportPolicy: 'all',
  }),
}))

// Mock selectOptimalCodec
vi.mock('@/lib/codec-selection', () => ({
  selectOptimalCodec: vi.fn().mockResolvedValue({ mimeType: 'video/VP9', powerEfficient: true }),
  applyCodecPreference: vi.fn(),
}))

// Mock RTCPeerConnection and MediaStream globally (must be before MediaManager mock)
globalThis.RTCPeerConnection = vi.fn() as unknown as typeof RTCPeerConnection
globalThis.MediaStream = vi.fn().mockImplementation(() => ({
  getTracks: () => [],
  getAudioTracks: () => [],
  getVideoTracks: () => [],
})) as unknown as typeof MediaStream

// Mock SignalingManager
type OnFn = (event: string, handler: (...args: unknown[]) => void) => () => void
const mockSignalingOn = vi.fn<OnFn>(() => () => {})
const mockSignalingEmit = vi.fn()
const mockSignalingConnect = vi.fn()
const mockSignalingSend = vi.fn()
const mockSignalingDisconnect = vi.fn()
const mockSignalingDestroy = vi.fn()
const mockSignalingRemoveAllListeners = vi.fn()

vi.mock('../signaling-manager', () => ({
  SignalingManager: vi.fn().mockImplementation(() => ({
    on: mockSignalingOn,
    emit: mockSignalingEmit,
    connect: mockSignalingConnect,
    send: mockSignalingSend,
    disconnect: mockSignalingDisconnect,
    destroy: mockSignalingDestroy,
    removeAllListeners: mockSignalingRemoveAllListeners,
  })),
}))

// Mock MediaManager
const mockMediaOn = vi.fn<OnFn>(() => () => {})
const mockMediaEmit = vi.fn()
const mockMediaAcquire = vi.fn().mockResolvedValue(new MediaStream())
const mockMediaToggleMic = vi.fn()
const mockMediaToggleCam = vi.fn()
const mockMediaRelease = vi.fn()
const mockMediaDestroy = vi.fn()
const mockMediaRemoveAllListeners = vi.fn()
const mockMediaGetLocalTracks = vi.fn(() => null)

vi.mock('../media-manager', () => ({
  MediaManager: vi.fn().mockImplementation(() => ({
    on: mockMediaOn,
    emit: mockMediaEmit,
    acquire: mockMediaAcquire,
    toggleMic: mockMediaToggleMic,
    toggleCam: mockMediaToggleCam,
    release: mockMediaRelease,
    destroy: mockMediaDestroy,
    removeAllListeners: mockMediaRemoveAllListeners,
    getLocalTracks: mockMediaGetLocalTracks,
    get stream() {
      return null
    },
    get isMicEnabled() {
      return true
    },
    get isCamEnabled() {
      return true
    },
  })),
}))

// Mock PeerManager
const mockPeerManagerOn = vi.fn<OnFn>(() => () => {})
const mockPeerManagerEmit = vi.fn()
const mockPeerManagerHandlePeerJoined = vi.fn().mockResolvedValue(undefined)
const mockPeerManagerHandlePeerLeft = vi.fn()
const mockPeerManagerHandleSdpOffer = vi.fn().mockResolvedValue(undefined)
const mockPeerManagerHandleSdpAnswer = vi.fn().mockResolvedValue(undefined)
const mockPeerManagerHandleIceCandidate = vi.fn()
const mockPeerManagerSendToAll = vi.fn()
const mockPeerManagerAddTrackToAll = vi.fn()
const mockPeerManagerRemoveTrackFromAll = vi.fn()
const mockPeerManagerDestroyAll = vi.fn()
const mockPeerManagerRemoveAllListeners = vi.fn()

vi.mock('../peer-manager', () => ({
  PeerManager: vi.fn().mockImplementation(() => ({
    on: mockPeerManagerOn,
    emit: mockPeerManagerEmit,
    handlePeerJoined: mockPeerManagerHandlePeerJoined,
    handlePeerLeft: mockPeerManagerHandlePeerLeft,
    handleSdpOffer: mockPeerManagerHandleSdpOffer,
    handleSdpAnswer: mockPeerManagerHandleSdpAnswer,
    handleIceCandidate: mockPeerManagerHandleIceCandidate,
    sendToAll: mockPeerManagerSendToAll,
    addTrackToAll: mockPeerManagerAddTrackToAll,
    removeTrackFromAll: mockPeerManagerRemoveTrackFromAll,
    destroyAll: mockPeerManagerDestroyAll,
    removeAllListeners: mockPeerManagerRemoveAllListeners,
  })),
}))

describe('RTCClient', () => {
  let client: RTCClient
  const options: RTCClientOptions = {
    roomId: 'room-123',
    peerId: 'peer-1',
    displayName: 'Alice',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    client = new RTCClient(options)
  })

  afterEach(() => {
    client.destroy()
  })

  describe('connect', () => {
    it('fetches TURN credentials, acquires media, selects codec, and connects signaling', async () => {
      const { fetchTurnCredentials } = await import('@/lib/turn')
      const { selectOptimalCodec } = await import('@/lib/codec-selection')

      await client.connect()

      expect(fetchTurnCredentials).toHaveBeenCalled()
      expect(mockMediaAcquire).toHaveBeenCalled()
      expect(selectOptimalCodec).toHaveBeenCalled()
      expect(mockSignalingConnect).toHaveBeenCalledWith('room-123')
    })

    it('emits connection-state: connecting then connected', async () => {
      const states: RTCClientState[] = []
      client.on('connection-state', state => states.push(state))

      await client.connect()

      expect(states).toContain('connecting')
      expect(states).toContain('connected')
    })

    it('emits error and failed state when media acquisition fails', async () => {
      const error = new DOMException('Denied', 'NotAllowedError')
      mockMediaAcquire.mockRejectedValueOnce(error)

      // MediaManager.on('error', handler) is wired before acquire() is called.
      // When acquire() rejects, RTCClient catches it and emits connection-state 'failed'.
      // The MediaManager itself emits an 'error' event which RTCClient re-emits.
      // Simulate: capture the MediaManager error handler, then trigger it.
      const states: RTCClientState[] = []
      client.on('connection-state', state => states.push(state))

      const errorHandler = vi.fn()
      client.on('error', errorHandler)

      await client.connect()

      // RTCClient should emit 'failed' after media acquire rejects
      expect(states).toContain('failed')

      // Now simulate MediaManager emitting its error event (which happens
      // inside MediaManager.acquire() before the rejection propagates)
      const mediaErrorCall = mockMediaOn.mock.calls.find(call => call[0] === 'error')
      expect(mediaErrorCall).toBeDefined()
      const mediaErrorHandler = mediaErrorCall![1] as (err: { type: string; message: string }) => void
      mediaErrorHandler({ type: 'media-denied', message: 'Permission denied' })

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({ type: 'media-denied' }))
    })

    it('prevents double connect', async () => {
      await client.connect()
      await client.connect() // second call should be no-op

      expect(mockSignalingConnect).toHaveBeenCalledTimes(1)
    })
  })

  describe('signaling message dispatch', () => {
    it('wires signaling message handler during connect', async () => {
      await client.connect()

      // SignalingManager.on('message', handler) should have been called
      expect(mockSignalingOn).toHaveBeenCalledWith('message', expect.any(Function))
    })

    it('dispatches peer-joined to PeerManager', async () => {
      await client.connect()

      // Find the message handler
      const messageCall = mockSignalingOn.mock.calls.find(call => call[0] === 'message')
      const handler = messageCall![1] as (msg: Record<string, unknown>) => void

      handler({
        type: 'peer-joined',
        roomId: 'room-123',
        peerId: 'peer-2',
        displayName: 'Bob',
      })

      expect(mockPeerManagerHandlePeerJoined).toHaveBeenCalledWith('peer-2', 'Bob')
    })

    it('dispatches peer-left to PeerManager', async () => {
      await client.connect()

      const messageCall = mockSignalingOn.mock.calls.find(call => call[0] === 'message')
      const handler = messageCall![1] as (msg: Record<string, unknown>) => void

      handler({
        type: 'peer-left',
        roomId: 'room-123',
        peerId: 'peer-2',
      })

      expect(mockPeerManagerHandlePeerLeft).toHaveBeenCalledWith('peer-2')
    })

    it('dispatches sdp-offer to PeerManager via message queue', async () => {
      await client.connect()

      const messageCall = mockSignalingOn.mock.calls.find(call => call[0] === 'message')
      const handler = messageCall![1] as (msg: Record<string, unknown>) => void

      const sdp = { type: 'offer', sdp: 'v=0...' }
      handler({
        type: 'sdp-offer',
        roomId: 'room-123',
        peerId: 'peer-2',
        payload: { sdp },
      })

      // Allow the message queue promise to resolve
      await new Promise(r => setTimeout(r, 0))

      expect(mockPeerManagerHandleSdpOffer).toHaveBeenCalledWith('peer-2', sdp)
    })

    it('ignores messages from self', async () => {
      await client.connect()

      const messageCall = mockSignalingOn.mock.calls.find(call => call[0] === 'message')
      const handler = messageCall![1] as (msg: Record<string, unknown>) => void

      handler({
        type: 'peer-joined',
        roomId: 'room-123',
        peerId: 'peer-1', // same as our peerId
        displayName: 'Alice',
      })

      expect(mockPeerManagerHandlePeerJoined).not.toHaveBeenCalled()
    })
  })

  describe('event re-emission', () => {
    it('re-emits PeerManager peer-added as RTCClient peer-added', async () => {
      await client.connect()

      const peerAddedCall = mockPeerManagerOn.mock.calls.find(call => call[0] === 'peer-added')
      expect(peerAddedCall).toBeDefined()

      const clientHandler = vi.fn()
      client.on('peer-added', clientHandler)

      // Invoke the PeerManager handler
      const pmHandler = peerAddedCall![1] as (peerId: string, displayName: string) => void
      pmHandler('peer-2', 'Bob')

      expect(clientHandler).toHaveBeenCalledWith('peer-2', 'Bob')
    })

    it('re-emits MediaManager acquired as RTCClient media-acquired', async () => {
      await client.connect()

      const acquiredCall = mockMediaOn.mock.calls.find(call => call[0] === 'acquired')
      expect(acquiredCall).toBeDefined()

      const clientHandler = vi.fn()
      client.on('media-acquired', clientHandler)

      const stream = new MediaStream()
      const mmHandler = acquiredCall![1] as (stream: MediaStream) => void
      mmHandler(stream)

      expect(clientHandler).toHaveBeenCalledWith(stream)
    })

    it('converts PeerManager message (DataChannelMessage) to ChatMessage and re-emits', async () => {
      await client.connect()

      const messageCall = mockPeerManagerOn.mock.calls.find(call => call[0] === 'message')
      expect(messageCall).toBeDefined()

      const clientHandler = vi.fn()
      client.on('message', clientHandler)

      // PeerManager emits raw DataChannelMessage
      const pmHandler = messageCall![1] as (peerId: string, msg: { type: string; payload: unknown }) => void
      pmHandler('peer-2', {
        type: 'chat',
        payload: { id: 'msg-1', senderName: 'Bob', text: 'hello', timestamp: 1000 },
      })

      expect(clientHandler).toHaveBeenCalledWith({
        id: 'msg-1',
        senderId: 'peer-2',
        senderName: 'Bob',
        text: 'hello',
        timestamp: 1000,
        fromMe: false,
      })
    })

    it('re-emits SignalingManager error as RTCClient error', async () => {
      await client.connect()

      const errorCall = mockSignalingOn.mock.calls.find(call => call[0] === 'error')
      expect(errorCall).toBeDefined()

      const clientHandler = vi.fn()
      client.on('error', clientHandler)

      const smHandler = errorCall![1] as (err: string) => void
      smHandler('room-full')

      expect(clientHandler).toHaveBeenCalledWith({
        type: 'room-full',
        message: 'This room is full.',
      })
    })
  })

  describe('toggleMic', () => {
    it('delegates to MediaManager and broadcasts media-state', async () => {
      await client.connect()
      client.toggleMic()

      expect(mockMediaToggleMic).toHaveBeenCalled()
      expect(mockPeerManagerSendToAll).toHaveBeenCalledWith(expect.objectContaining({ type: 'media-state' }))
    })
  })

  describe('toggleCam', () => {
    it('delegates to MediaManager and broadcasts media-state', async () => {
      await client.connect()
      client.toggleCam()

      expect(mockMediaToggleCam).toHaveBeenCalled()
      expect(mockPeerManagerSendToAll).toHaveBeenCalledWith(expect.objectContaining({ type: 'media-state' }))
    })
  })

  describe('sendMessage', () => {
    it('broadcasts chat message via PeerManager data channels', async () => {
      await client.connect()
      client.sendMessage('hello world')

      expect(mockPeerManagerSendToAll).toHaveBeenCalledWith({
        type: 'chat',
        payload: expect.objectContaining({
          senderName: 'Alice',
          text: 'hello world',
        }),
      })
    })

    it('emits message event for sent messages (fromMe: true)', async () => {
      await client.connect()
      const handler = vi.fn()
      client.on('message', handler)

      client.sendMessage('hello')

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          senderName: 'Alice',
          text: 'hello',
          fromMe: true,
        }),
      )
    })
  })

  describe('signaling reconnect', () => {
    it('emits connection-state connected on reconnect', async () => {
      await client.connect()

      const reconnectedCall = mockSignalingOn.mock.calls.find(call => call[0] === 'reconnected')
      expect(reconnectedCall).toBeDefined()

      // Listen for connection-state changes
      const stateHandler = vi.fn()
      client.on('connection-state', stateHandler)

      // Simulate reconnect
      const handler = reconnectedCall![1] as () => void
      handler()

      // RTCClient should re-emit connection-state 'connected'
      expect(stateHandler).toHaveBeenCalledWith('connected')
    })

    it('emits reconnecting when signaling connection drops', async () => {
      await client.connect()

      const connectionChangeCall = mockSignalingOn.mock.calls.find(call => call[0] === 'connection-change')
      expect(connectionChangeCall).toBeDefined()

      const stateHandler = vi.fn()
      client.on('connection-state', stateHandler)

      // Simulate signaling disconnect
      const handler = connectionChangeCall![1] as (connected: boolean) => void
      handler(false)

      expect(stateHandler).toHaveBeenCalledWith('reconnecting')
    })
  })

  describe('destroy', () => {
    it('tears down all managers and removes listeners', async () => {
      await client.connect()
      client.destroy()

      expect(mockMediaDestroy).toHaveBeenCalled()
      expect(mockPeerManagerDestroyAll).toHaveBeenCalled()
      expect(mockSignalingDestroy).toHaveBeenCalled()
    })

    it('is safe to call multiple times', async () => {
      await client.connect()
      client.destroy()
      client.destroy() // should not throw
    })
  })
})
