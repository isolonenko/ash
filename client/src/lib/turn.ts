import { API_URL } from '@/lib/config'

interface TurnConfig {
  iceServers: RTCIceServer[]
  iceTransportPolicy: RTCIceTransportPolicy
  bundlePolicy: RTCBundlePolicy
  rtcpMuxPolicy: RTCRtcpMuxPolicy
  iceCandidatePoolSize: number
  degraded: boolean
}

const common: Omit<TurnConfig, 'iceServers'> = {
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 1,
  degraded: false,
}

export const fetchTurnCredentials = async (): Promise<TurnConfig> => {
  try {
    const res = await fetch(`${API_URL}/turn-credentials`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return {
      ...common,
      iceServers: [...data.iceServers, { urls: 'stun:stun.l.google.com:19302' }],
    }
  } catch (err) {
    console.warn('[TURN] Failed to fetch credentials — falling back to STUN only:', err)
    return {
      ...common,
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      degraded: true,
    }
  }
}
