import type { SignalingMessage, SdpPayload, IceCandidatePayload, ChatPayload, DataChannelMessage } from '@/types'
import type { RTCClientOptions, RTCClientEvents, ConnectSubState } from './types'
import { TypedEventEmitter } from './event-emitter'
import { SignalingManager } from './signaling-manager'
import type { MediaManager } from './media-manager'
import { PeerManager } from './peer-manager'
import { fetchTurnCredentials } from '@/lib/turn'
import { selectOptimalCodec } from '@/lib/codec-selection'
import { CONNECT_TIMEOUT } from '@/lib/constants'

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

    const connectSequence = async (): Promise<void> => {
      this.emitSubStep('fetching-turn')
      let iceConfig: RTCConfiguration
      try {
        const turnResult = await fetchTurnCredentials()
        iceConfig = turnResult
        if (turnResult.degraded) {
          this.emit('error', {
            type: 'turn-degraded',
            message: 'Relay server unavailable — using direct connection only. Connections across strict NATs may fail.',
          })
        }
      } catch (err) {
        this.emit('error', {
          type: 'turn-failed',
          message: err instanceof Error ? err.message : 'Could not reach relay server',
        })
        throw err
      }
      if (this.destroyed) return

      this.emitSubStep('acquiring-media')
      this.media = this.options.mediaManager
      this.wireMediaEvents()

      if (!this.media.stream) {
        try {
          await this.media.acquire()
        } catch {
          this.cleanupPartial()
          this.emitSubStep(null)
          this.emit('connection-state', 'failed')
          return
        }
      } else {
        this.emit('media-acquired', this.media.stream)
      }
      if (this.destroyed) return

      this.emitSubStep('selecting-codec')
      let codecResult: { mimeType: string }
      try {
        codecResult = await selectOptimalCodec()
      } catch (err) {
        this.emit('error', {
          type: 'codec-failed',
          message: err instanceof Error ? err.message : 'Could not detect video capabilities',
        })
        throw err
      }
      if (this.destroyed) return

      this.emitSubStep('opening-signaling')
      this.signaling = new SignalingManager(this.options.peerId, this.options.displayName)
      this.wireSignalingEvents()

      this.peerManager = new PeerManager(
        iceConfig,
        this.signaling,
        this.media,
        this.options.peerId,
        this.options.roomId,
        codecResult.mimeType,
      )
      this.wirePeerManagerEvents()

      this.media.onTrackReplaced = (kind: string, newTrack: MediaStreamTrack) => {
        this.peerManager?.replaceTrackOnAll(kind, newTrack)
      }

      this.signaling.connect(this.options.roomId)
      try {
        await this.signaling.waitForOpen()
      } catch (err) {
        this.emit('error', {
          type: 'signaling-failed',
          message: err instanceof Error ? err.message : 'Could not reach signaling server',
        })
        throw err
      }
      if (this.destroyed) return

      this.emitSubStep('negotiating-peers')

      this.connected = true
      this.emitSubStep(null)
      this.emit('connection-state', 'connected')
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('connect-timeout')), CONNECT_TIMEOUT)
    })

    try {
      await Promise.race([connectSequence(), timeoutPromise])
    } catch (err) {
      if (this.destroyed) return

      const message = err instanceof Error ? err.message : 'Connection failed'

      if (message === 'connect-timeout') {
        this.emit('error', {
          type: 'connect-timeout',
          message: 'Connection timed out',
        })
      }

      this.cleanupPartial()
      this.emitSubStep(null)
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

  async startScreenShare(): Promise<void> {
    if (!this.media || !this.peerManager) return
    await this.media.startScreenShare()
    this.broadcastMediaState()
  }

  async stopScreenShare(): Promise<void> {
    if (!this.media || !this.peerManager) return
    await this.media.stopScreenShare()
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
    this.emitSubStep(null)

    this.peerManager?.destroyAll()
    this.peerManager?.removeAllListeners()
    this.peerManager = null

    if (this.media) {
      this.media.onTrackReplaced = null
      this.media = null
    }

    this.signaling?.destroy()
    this.signaling = null

    this.messageQueues.clear()
    this.removeAllListeners()
  }

  // ── Private: Wire Manager Events ──────────────────────

  private emitSubStep(step: ConnectSubState): void {
    this.emit('connect-substep', step)
  }

  private cleanupPartial(): void {
    this.connected = false

    this.peerManager?.destroyAll()
    this.peerManager?.removeAllListeners()
    this.peerManager = null

    if (this.media) {
      this.media.onTrackReplaced = null
      this.media = null
    }

    this.signaling?.destroy()
    this.signaling = null

    this.messageQueues.clear()
  }

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
        this.emitSubStep('opening-signaling')
        this.emit('connection-state', 'reconnecting')
      }
    })

    this.signaling.on('reconnected', () => {
      // Server handles re-announcement: the WebSocket reconnects with the
      // same peerId/roomId, so the server broadcasts peer-joined to others.
      // We just update our connection state.
      this.emitSubStep(null)
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

    this.peerManager.on('peer-failed', (peerId) => {
      this.emit('error', {
        type: 'peer-failed',
        message: `Connection to peer failed after all retry attempts`,
      })
      this.emit('peer-connection-state', peerId, 'failed')
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
      case 'peer-existing': {
        this.peerManager.handlePeerExisting(senderPeerId, msg.displayName)
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
        screenSharing: this.media.isScreenSharing,
      },
    })
  }
}
