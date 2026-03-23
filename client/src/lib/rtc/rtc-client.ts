import type { SignalingMessage, SdpPayload, IceCandidatePayload, ChatPayload, DataChannelMessage } from '@/types'
import type { RTCClientOptions, RTCClientEvents } from './types'
import { TypedEventEmitter } from './event-emitter'
import { SignalingManager } from './signaling-manager'
import { MediaManager } from './media-manager'
import { PeerManager } from './peer-manager'
import { fetchTurnCredentials } from '@/lib/turn'
import { selectOptimalCodec } from '@/lib/codec-selection'

export class RTCClient extends TypedEventEmitter<RTCClientEvents> {
  private readonly options: RTCClientOptions
  private signaling: SignalingManager | null = null
  private media: MediaManager | null = null
  private peerManager: PeerManager | null = null
  private connected = false
  private destroyed = false

  // Per-peer message queue for serializing async signaling operations
  private messageQueues = new Map<string, Promise<void>>()

  constructor(options: RTCClientOptions) {
    super()
    this.options = options
  }

  // ── Public API ────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.connected || this.destroyed) return

    this.emit('connection-state', 'connecting')

    try {
      // 1. Fetch TURN credentials
      const iceConfig = await fetchTurnCredentials()
      if (this.destroyed) return

      // 2. Acquire media
      this.media = new MediaManager()
      this.wireMediaEvents()

      try {
        await this.media.acquire()
      } catch {
        // MediaManager already emits its own error event
        // which we re-emit — so just emit failed state and return
        this.emit('connection-state', 'failed')
        return
      }
      if (this.destroyed) return

      // 3. Select optimal codec
      const codecResult = await selectOptimalCodec()
      if (this.destroyed) return

      // 4. Create SignalingManager
      this.signaling = new SignalingManager(this.options.peerId, this.options.displayName)
      this.wireSignalingEvents()

      // 5. Create PeerManager
      this.peerManager = new PeerManager(
        iceConfig,
        this.signaling,
        this.media,
        this.options.peerId,
        this.options.roomId,
        codecResult.mimeType,
      )
      this.wirePeerManagerEvents()

      // 6. Connect signaling (triggers peer-joined messages from server)
      this.signaling.connect(this.options.roomId)

      this.connected = true
      this.emit('connection-state', 'connected')
    } catch (err) {
      this.emit('error', {
        type: 'unknown',
        message: err instanceof Error ? err.message : 'Connection failed',
      })
      this.emit('connection-state', 'failed')
    }
  }

  toggleMic(): void {
    if (!this.media || !this.peerManager) return
    this.media.toggleMic()
    this.broadcastMediaState()
  }

  toggleCam(): void {
    if (!this.media || !this.peerManager) return
    this.media.toggleCam()
    this.broadcastMediaState()
  }

  sendMessage(text: string): void {
    if (!this.peerManager) return

    const payload: ChatPayload = {
      id: crypto.randomUUID(),
      senderName: this.options.displayName,
      text,
      timestamp: Date.now(),
    }

    const msg: DataChannelMessage = { type: 'chat', payload }
    this.peerManager.sendToAll(msg)

    // Also emit locally so the store captures sent messages
    this.emit('message', {
      id: payload.id,
      senderId: this.options.peerId,
      senderName: payload.senderName,
      text: payload.text,
      timestamp: payload.timestamp,
      fromMe: true,
    })
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.connected = false

    this.peerManager?.destroyAll()
    this.peerManager?.removeAllListeners()
    this.peerManager = null

    this.media?.destroy()
    this.media?.removeAllListeners()
    this.media = null

    this.signaling?.destroy()
    this.signaling = null

    this.messageQueues.clear()
    this.removeAllListeners()
  }

  // ── Private: Wire Manager Events ──────────────────────

  private wireMediaEvents(): void {
    if (!this.media) return

    this.media.on('acquired', stream => {
      this.emit('media-acquired', stream)
    })

    this.media.on('changed', info => {
      this.emit('media-changed', info)
    })

    this.media.on('released', () => {
      this.emit('media-released')
    })

    this.media.on('error', error => {
      this.emit('error', error)
    })
  }

  private wireSignalingEvents(): void {
    if (!this.signaling) return

    this.signaling.on('message', (msg: SignalingMessage) => {
      this.handleSignalingMessage(msg)
    })

    this.signaling.on('error', errorType => {
      const errorMessages: Record<string, string> = {
        'room-full': 'This room is full.',
        unknown: 'Signaling connection error.',
      }
      this.emit('error', {
        type: errorType === 'room-full' ? 'room-full' : 'signaling-failed',
        message: errorMessages[errorType] ?? 'Signaling connection error.',
      })
    })

    this.signaling.on('connection-change', connected => {
      if (!connected && this.connected) {
        this.emit('connection-state', 'reconnecting')
      }
    })

    this.signaling.on('reconnected', () => {
      // Server handles re-announcement: the WebSocket reconnects with the
      // same peerId/roomId, so the server broadcasts peer-joined to others.
      // We just update our connection state.
      this.emit('connection-state', 'connected')
    })
  }

  private wirePeerManagerEvents(): void {
    if (!this.peerManager) return

    // Direct re-emissions (same event signature)
    this.peerManager.on('peer-added', (peerId, displayName) => {
      this.emit('peer-added', peerId, displayName)
    })

    this.peerManager.on('peer-removed', peerId => {
      this.emit('peer-removed', peerId)
      this.messageQueues.delete(peerId)
    })

    this.peerManager.on('peer-stream', (peerId, stream) => {
      this.emit('peer-stream', peerId, stream)
    })

    this.peerManager.on('peer-stream-removed', peerId => {
      this.emit('peer-stream-removed', peerId)
    })

    this.peerManager.on('peer-connection-state', (peerId, state) => {
      this.emit('peer-connection-state', peerId, state)
    })

    this.peerManager.on('peer-media-state', (peerId, state) => {
      this.emit('peer-media-state', peerId, state)
    })

    // Convert raw DataChannelMessage → ChatMessage
    this.peerManager.on('message', (peerId, msg) => {
      if (msg.type !== 'chat') return
      const payload = msg.payload as ChatPayload
      this.emit('message', {
        id: payload.id,
        senderId: peerId,
        senderName: payload.senderName,
        text: payload.text,
        timestamp: payload.timestamp,
        fromMe: false,
      })
    })
  }

  // ── Private: Signaling Message Dispatch ────────────────

  private handleSignalingMessage(msg: SignalingMessage): void {
    const senderPeerId = msg.peerId
    if (!senderPeerId || senderPeerId === this.options.peerId) return
    if (!this.peerManager) return

    switch (msg.type) {
      case 'peer-joined': {
        this.peerManager.handlePeerJoined(senderPeerId, msg.displayName)
        break
      }
      case 'peer-left': {
        this.peerManager.handlePeerLeft(senderPeerId)
        break
      }
      case 'sdp-offer': {
        const payload = msg.payload as SdpPayload
        this.enqueue(senderPeerId, () => this.peerManager!.handleSdpOffer(senderPeerId, payload.sdp))
        break
      }
      case 'sdp-answer': {
        const payload = msg.payload as SdpPayload
        this.enqueue(senderPeerId, () => this.peerManager!.handleSdpAnswer(senderPeerId, payload.sdp))
        break
      }
      case 'ice-candidate': {
        const payload = msg.payload as IceCandidatePayload
        this.enqueue(senderPeerId, () => {
          this.peerManager!.handleIceCandidate(senderPeerId, payload.candidate)
        })
        break
      }
    }
  }

  // ── Private: Per-Peer Message Queue ────────────────────

  private enqueue(peerId: string, task: () => void | Promise<void>): void {
    const current = this.messageQueues.get(peerId) ?? Promise.resolve()
    this.messageQueues.set(
      peerId,
      current.then(() => task()),
    )
  }

  // ── Private: Broadcast Media State ─────────────────────

  private broadcastMediaState(): void {
    if (!this.peerManager || !this.media) return
    this.peerManager.sendToAll({
      type: 'media-state',
      payload: {
        audioEnabled: this.media.isMicEnabled,
        videoEnabled: this.media.isCamEnabled,
      },
    })
  }
}
