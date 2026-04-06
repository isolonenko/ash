import type { DataChannelMessage } from '@/types'
import type { PeerManagerEvents, PeerSnapshot, InternalPeer } from './types'
import { TypedEventEmitter } from './event-emitter'
import { SignalingManager } from './signaling-manager'
import { MediaManager } from './media-manager'
import {
  DATA_CHANNEL_LABEL,
  ICE_RESTART_MAX_ATTEMPTS,
  VIDEO_MAX_BITRATE,
  AUDIO_MAX_BITRATE,
  STATS_POLL_INTERVAL,
  BITRATE_RAMP_DOWN,
  BITRATE_RAMP_UP,
  PACKET_LOSS_THRESHOLD,
  JITTER_THRESHOLD,
  RTT_THRESHOLD,
} from '@/lib/constants'
import { applyCodecPreference } from '@/lib/codec-selection'

// ── Bitrate Management ──────────────────────────────────

function applyBitrateParams(sender: RTCRtpSender, kind: string): void {
  const params = sender.getParameters()
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}]
  }

  if (kind === 'video') {
    params.encodings[0].maxBitrate = VIDEO_MAX_BITRATE
    params.degradationPreference = 'maintain-resolution'
  } else if (kind === 'audio') {
    params.encodings[0].maxBitrate = AUDIO_MAX_BITRATE
  }

  sender.setParameters(params).catch(err => {
    console.warn(`[RTC] Failed to set ${kind} encoding params:`, err)
  })
}

// ── Adaptive Bitrate Stats ──────────────────────────────

interface StatsSnapshot {
  packetsLost: number
  packetsReceived: number
  jitter: number
  rtt: number
  timestamp: number
}

const SMOOTHING_WINDOW = 5

// ── PeerManager ─────────────────────────────────────────

export class PeerManager extends TypedEventEmitter<PeerManagerEvents> {
  private peers = new Map<string, InternalPeer>()
  private sendersMap = new Map<string, RTCRtpSender[]>()
  private iceConfig: RTCConfiguration
  private signalingManager: SignalingManager
  private mediaManager: MediaManager
  private localPeerId: string
  private roomId: string
  private codec: string

  // Adaptive bitrate state
  private statsInterval: ReturnType<typeof setInterval> | null = null
  private previousStats = new Map<string, StatsSnapshot>()
  private lossHistory: number[] = []
  private pendingTrackReplacements = new Map<string, { kind: string; track: MediaStreamTrack }>()

  constructor(
    iceConfig: RTCConfiguration,
    signalingManager: SignalingManager,
    mediaManager: MediaManager,
    localPeerId: string,
    roomId: string,
    codec: string,
  ) {
    super()
    this.iceConfig = iceConfig
    this.signalingManager = signalingManager
    this.mediaManager = mediaManager
    this.localPeerId = localPeerId
    this.roomId = roomId
    this.codec = codec

    this.startAdaptiveBitrate()
  }

  // ── Peer Lifecycle ────────────────────────────────────

  async handlePeerJoined(remotePeerId: string, displayName?: string): Promise<void> {
    if (this.peers.has(remotePeerId)) return

    const pc = this.createPeerConnection(remotePeerId)
    const peerSenders = this.addLocalTracks(pc)

    const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true })
    this.setupDataChannel(remotePeerId, channel)

    const internal: InternalPeer = {
      connection: pc,
      dataChannel: channel,
      remoteStream: null,
      displayName: displayName ?? remotePeerId,
      iceRestartAttempts: 0,
      iceCandidateQueue: [],
      audioEnabled: true,
      videoEnabled: true,
      screenSharing: false,
      pendingMessages: [],
    }

    this.peers.set(remotePeerId, internal)
    this.sendersMap.set(remotePeerId, peerSenders)

    this.emit('peer-added', remotePeerId, internal.displayName)

    try {
      await pc.setLocalDescription()
      this.signalingManager.send(
        {
          type: 'sdp-offer',
          roomId: this.roomId,
          peerId: this.localPeerId,
          payload: { sdp: pc.localDescription! },
        },
        remotePeerId,
      )
    } catch (err) {
      console.error(`[RTC] Failed to create offer for ${remotePeerId}:`, err)
    }
  }

  handlePeerExisting(remotePeerId: string, displayName?: string): void {
    if (this.peers.has(remotePeerId)) return

    const pc = this.createPeerConnection(remotePeerId)
    const peerSenders = this.addLocalTracks(pc)

    const internal: InternalPeer = {
      connection: pc,
      dataChannel: null,
      remoteStream: null,
      displayName: displayName ?? remotePeerId,
      iceRestartAttempts: 0,
      iceCandidateQueue: [],
      audioEnabled: true,
      videoEnabled: true,
      screenSharing: false,
      pendingMessages: [],
    }

    this.peers.set(remotePeerId, internal)
    this.sendersMap.set(remotePeerId, peerSenders)

    this.emit('peer-added', remotePeerId, internal.displayName)
  }

  handlePeerLeft(remotePeerId: string): void {
    const internal = this.peers.get(remotePeerId)
    if (!internal) return

    internal.dataChannel?.close()
    internal.connection.close()
    internal.remoteStream?.getTracks().forEach(t => t.stop())

    this.pendingTrackReplacements.delete(remotePeerId)
    this.peers.delete(remotePeerId)
    this.sendersMap.delete(remotePeerId)
    this.previousStats.delete(remotePeerId)

    this.emit('peer-removed', remotePeerId)
  }

  // ── SDP Handling ──────────────────────────────────────

  async handleSdpOffer(remotePeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    let internal = this.peers.get(remotePeerId)
    if (!internal) {
      const pc = this.createPeerConnection(remotePeerId)
      const peerSenders = this.addLocalTracks(pc)

      internal = {
        connection: pc,
        dataChannel: null,
        remoteStream: null,
        displayName: remotePeerId,
        iceRestartAttempts: 0,
        iceCandidateQueue: [],
        audioEnabled: true,
        videoEnabled: true,
        screenSharing: false,
        pendingMessages: [],
      }
      this.peers.set(remotePeerId, internal)
      this.sendersMap.set(remotePeerId, peerSenders)
    }

    const pc = internal.connection

    try {
      if (pc.signalingState === 'have-local-offer') {
        const isPolite = this.localPeerId < remotePeerId
        if (!isPolite) return
        await pc.setLocalDescription({ type: 'rollback' })
      }

      await pc.setRemoteDescription(sdp)

      // Drain ICE candidate queue
      if (internal.iceCandidateQueue.length > 0) {
        for (const candidate of internal.iceCandidateQueue) {
          await pc.addIceCandidate(candidate).catch(e => console.error('[RTC] Error adding queued ICE candidate:', e))
        }
        internal.iceCandidateQueue = []
      }

      await pc.setLocalDescription()

      this.signalingManager.send(
        {
          type: 'sdp-answer',
          roomId: this.roomId,
          peerId: this.localPeerId,
          payload: { sdp: pc.localDescription },
        },
        remotePeerId,
      )
    } catch (err) {
      console.error(`[RTC] Failed to handle SDP offer from ${remotePeerId}:`, err)
    }
  }

  async handleSdpAnswer(remotePeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const internal = this.peers.get(remotePeerId)
    if (!internal) return

    try {
      await internal.connection.setRemoteDescription(sdp)

      // Drain ICE candidate queue
      if (internal.iceCandidateQueue.length > 0) {
        for (const candidate of internal.iceCandidateQueue) {
          await internal.connection
            .addIceCandidate(candidate)
            .catch(e => console.error('[RTC] Error adding queued ICE candidate:', e))
        }
        internal.iceCandidateQueue = []
      }
    } catch (err) {
      console.error(`[RTC] Failed to handle SDP answer from ${remotePeerId}:`, err)
    }
  }

  // ── ICE Handling ──────────────────────────────────────

  handleIceCandidate(remotePeerId: string, candidate: RTCIceCandidateInit): void {
    const internal = this.peers.get(remotePeerId)
    if (!internal) return

    const pc = internal.connection
    const iceCandidate = new RTCIceCandidate(candidate)

    if (pc.remoteDescription) {
      pc.addIceCandidate(iceCandidate).catch(e => {
        if ((e as DOMException).name === 'InvalidStateError') {
          console.warn(`[RTC] Skipping ICE candidate (invalid state) for ${remotePeerId}`)
        } else {
          console.error('[RTC] Error adding ICE candidate:', e)
        }
      })
    } else {
      internal.iceCandidateQueue.push(iceCandidate)
    }
  }

  // ── Track Management ──────────────────────────────────

  addTrackToAll(track: MediaStreamTrack, stream: MediaStream): void {
    for (const [peerId, internal] of this.peers) {
      const sender = internal.connection.addTrack(track, stream)
      if (track.kind === 'video') {
        applyCodecPreference(internal.connection, sender, this.codec)
      }
      applyBitrateParams(sender, track.kind)

      const existing = this.sendersMap.get(peerId) ?? []
      existing.push(sender)
      this.sendersMap.set(peerId, existing)
    }
  }

  removeTrackFromAll(track: MediaStreamTrack): void {
    for (const [peerId, internal] of this.peers) {
      const peerSenders = this.sendersMap.get(peerId) ?? []
      const sender = peerSenders.find(s => s.track === track)
      if (sender) {
        internal.connection.removeTrack(sender)
        const idx = peerSenders.indexOf(sender)
        if (idx !== -1) peerSenders.splice(idx, 1)
      }
    }
  }

  replaceTrackOnAll(kind: string, newTrack: MediaStreamTrack): void {
    for (const [peerId] of this.peers) {
      const peerSenders = this.sendersMap.get(peerId) ?? []
      const sender = peerSenders.find(s => s.track?.kind === kind)
      if (!sender) continue

      const peer = this.peers.get(peerId)
      if (!peer) continue

      const pc = peer.connection
      if (pc.signalingState === 'closed') {
        continue
      }
      if (pc.signalingState === 'stable') {
        sender.replaceTrack(newTrack).catch(err => {
          console.warn(`[RTC] replaceTrack failed for peer ${peerId}:`, err)
        })
      } else {
        this.pendingTrackReplacements.set(peerId, { kind, track: newTrack })
      }
    }
  }

  // ── Data Channel ──────────────────────────────────────

  sendToAll(msg: DataChannelMessage): void {
    const data = JSON.stringify(msg)
    for (const [, internal] of this.peers) {
      if (internal.dataChannel?.readyState === 'open') {
        internal.dataChannel.send(data)
      } else {
        internal.pendingMessages.push(msg)
      }
    }
  }

  // ── Public Getters ────────────────────────────────────

  getPeers(): Map<string, PeerSnapshot> {
    const result = new Map<string, PeerSnapshot>()
    for (const [id, internal] of this.peers) {
      result.set(id, {
        displayName: internal.displayName,
        stream: internal.remoteStream,
        connectionState: internal.connection.connectionState,
        audioEnabled: internal.audioEnabled,
        videoEnabled: internal.videoEnabled,
        screenSharing: internal.screenSharing,
      })
    }
    return result
  }

  // ── Cleanup ───────────────────────────────────────────

  destroyAll(): void {
    this.stopAdaptiveBitrate()

    for (const [, internal] of this.peers) {
      internal.dataChannel?.close()
      internal.connection.close()
      internal.remoteStream?.getTracks().forEach(t => t.stop())
    }
    this.peers.clear()
    this.sendersMap.clear()
    this.previousStats.clear()
    this.lossHistory = []
    this.pendingTrackReplacements.clear()
    this.removeAllListeners()
  }

  // ── Private: Create Peer Connection ───────────────────

  private createPeerConnection(remotePeerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(this.iceConfig)

    pc.onicecandidate = event => {
      if (event.candidate) {
        this.signalingManager.send(
          {
            type: 'ice-candidate',
            roomId: this.roomId,
            peerId: this.localPeerId,
            payload: { candidate: event.candidate.toJSON() },
          },
          remotePeerId,
        )
      }
    }

    pc.onconnectionstatechange = () => {
      const internal = this.peers.get(remotePeerId)

      if (pc.connectionState === 'failed' && internal && internal.iceRestartAttempts < ICE_RESTART_MAX_ATTEMPTS) {
        internal.iceRestartAttempts++
        console.warn(
          `[RTC] Peer ${remotePeerId} failed — ICE restart (${internal.iceRestartAttempts}/${ICE_RESTART_MAX_ATTEMPTS})`,
        )
        pc.restartIce()
        pc.setLocalDescription()
          .then(() => {
            this.signalingManager.send(
              {
                type: 'sdp-offer',
                roomId: this.roomId,
                peerId: this.localPeerId,
                payload: { sdp: pc.localDescription },
              },
              remotePeerId,
            )
          })
          .catch(err => console.error('[RTC] ICE restart failed:', err))
        return
      }

      if (pc.connectionState === 'failed' && internal && internal.iceRestartAttempts >= ICE_RESTART_MAX_ATTEMPTS) {
        this.emit('peer-failed', remotePeerId)
      }

      if (pc.connectionState === 'connected' && internal) {
        internal.iceRestartAttempts = 0
      }

      this.emit('peer-connection-state', remotePeerId, pc.connectionState)
    }

    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'stable') {
        const pending = this.pendingTrackReplacements.get(remotePeerId)
        if (pending) {
          this.pendingTrackReplacements.delete(remotePeerId)
          const peerSenders = this.sendersMap.get(remotePeerId) ?? []
          const sender = peerSenders.find(s => s.track?.kind === pending.kind)
          if (sender) {
            sender.replaceTrack(pending.track).catch(err => {
              console.warn(`[RTC] Deferred replaceTrack failed for peer ${remotePeerId}:`, err)
            })
          }
        }
      }
    }

    pc.ondatachannel = event => {
      const internal = this.peers.get(remotePeerId)
      if (internal) {
        this.setupDataChannel(remotePeerId, event.channel)
        internal.dataChannel = event.channel
      }
    }

    pc.ontrack = event => {
      const internal = this.peers.get(remotePeerId)
      if (!internal) return

      // Use event.streams[0] if available (required for Safari compatibility)
      if (event.streams.length > 0) {
        internal.remoteStream = event.streams[0]
      } else {
        if (!internal.remoteStream) {
          internal.remoteStream = new MediaStream()
        }
        internal.remoteStream.addTrack(event.track)
      }

      this.emit('peer-stream', remotePeerId, internal.remoteStream!)

      event.track.onended = () => {
        if (internal.remoteStream) {
          internal.remoteStream.removeTrack(event.track)
          if (internal.remoteStream.getTracks().length === 0) {
            this.emit('peer-stream-removed', remotePeerId)
          }
        }
      }
    }

    return pc
  }

  // ── Private: Add Local Tracks ─────────────────────────

  private addLocalTracks(pc: RTCPeerConnection): RTCRtpSender[] {
    const localMedia = this.mediaManager.getLocalTracks()
    const peerSenders: RTCRtpSender[] = []

    if (localMedia) {
      for (const track of localMedia.tracks) {
        const sender = pc.addTrack(track, localMedia.stream)
        if (track.kind === 'video') {
          applyCodecPreference(pc, sender, this.codec)
        }
        applyBitrateParams(sender, track.kind)
        peerSenders.push(sender)
      }
    }

    return peerSenders
  }

  // ── Private: Data Channel Setup ───────────────────────

  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer'

    channel.onopen = () => {
      const internal = this.peers.get(peerId)
      if (internal && internal.pendingMessages.length > 0) {
        for (const msg of internal.pendingMessages) {
          channel.send(JSON.stringify(msg))
        }
        internal.pendingMessages = []
      }
    }

    channel.onmessage = (event: MessageEvent) => {
      try {
        const msg: DataChannelMessage = JSON.parse(event.data as string)

        if (msg.type === 'media-state') {
          const payload = msg.payload as { audioEnabled: boolean; videoEnabled: boolean; screenSharing?: boolean }
          const internal = this.peers.get(peerId)
          if (internal) {
            internal.audioEnabled = payload.audioEnabled
            internal.videoEnabled = payload.videoEnabled
            internal.screenSharing = payload.screenSharing ?? false
          }
          this.emit('peer-media-state', peerId, {
            isMicEnabled: payload.audioEnabled,
            isCamEnabled: payload.videoEnabled,
            isScreenSharing: payload.screenSharing ?? false,
          })
          return
        }

        if (msg.type === 'chat') {
          this.emit('message', peerId, msg)
        }
      } catch (err) {
        console.warn('[RTC] Failed to parse DataChannel message:', err)
      }
    }

    channel.onerror = () => {
      console.warn(`[RTC] DataChannel error for peer ${peerId}`)
    }
  }

  // ── Private: Adaptive Bitrate ─────────────────────────

  private startAdaptiveBitrate(): void {
    this.statsInterval = setInterval(() => {
      this.pollStats()
    }, STATS_POLL_INTERVAL)
  }

  private stopAdaptiveBitrate(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
  }

  private async pollStats(): Promise<void> {
    for (const [peerId, internal] of this.peers) {
      const pc = internal.connection
      if (pc.connectionState !== 'connected') continue

      try {
        const stats = await pc.getStats()
        let packetsLost = 0
        let packetsReceived = 0
        let jitter = 0
        let rtt = 0

        stats.forEach((report: Record<string, unknown>) => {
          if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
            packetsLost = (report.packetsLost as number) ?? 0
            jitter = (report.jitter as number) ?? 0
            rtt = (report.roundTripTime as number) ?? 0
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            packetsReceived = (report.packetsReceived as number) ?? 0
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime) {
            rtt = report.currentRoundTripTime as number
          }
        })

        const prev = this.previousStats.get(peerId)
        const now: StatsSnapshot = { packetsLost, packetsReceived, jitter, rtt, timestamp: Date.now() }
        this.previousStats.set(peerId, now)

        if (!prev) continue

        const lostDelta = packetsLost - prev.packetsLost
        const receivedDelta = packetsReceived - prev.packetsReceived
        const totalDelta = lostDelta + receivedDelta
        const lossRate = totalDelta > 0 ? lostDelta / totalDelta : 0

        this.lossHistory.push(lossRate)
        if (this.lossHistory.length > SMOOTHING_WINDOW) {
          this.lossHistory.shift()
        }
        const avgLoss = this.lossHistory.reduce((a, b) => a + b, 0) / this.lossHistory.length

        const congested = avgLoss > PACKET_LOSS_THRESHOLD || jitter > JITTER_THRESHOLD || rtt > RTT_THRESHOLD

        const videoSenders = pc.getSenders().filter(s => s.track?.kind === 'video')

        for (const sender of videoSenders) {
          const params = sender.getParameters()
          if (!params.encodings || params.encodings.length === 0) continue

          const current = params.encodings[0].maxBitrate ?? VIDEO_MAX_BITRATE

          if (congested) {
            const newBitrate = Math.max(current * BITRATE_RAMP_DOWN, 100_000)
            params.encodings[0].maxBitrate = Math.round(newBitrate)
          } else if (current < VIDEO_MAX_BITRATE) {
            const newBitrate = Math.min(current * BITRATE_RAMP_UP, VIDEO_MAX_BITRATE)
            params.encodings[0].maxBitrate = Math.round(newBitrate)
          }

          sender.setParameters(params).catch(() => {})
        }
      } catch {
        // getStats can fail if connection is closing
      }
    }
  }
}
