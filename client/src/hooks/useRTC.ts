import { useStore } from 'zustand'
import { useShallow } from 'zustand/shallow'
import { createRTCStore } from '@/stores/rtc-store'

/**
 * Singleton RTCStore instance shared across all components
 * @internal
 */
const rtcStore = createRTCStore()

/**
 * Export rtcStore for non-React contexts (tests, error boundary)
 */
export { rtcStore }

/**
 * Hook: Get current connection state
 * @returns RTCClientState - 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
 */
export const useConnectionState = () => useStore(rtcStore, s => s.connectionState)

/**
 * Hook: Get local media stream and toggle states
 * @returns Object with stream, isMicEnabled, isCamEnabled
 */
export const useLocalMedia = () =>
  useStore(
    rtcStore,
    useShallow(s => ({
      stream: s.localStream,
      isMicEnabled: s.isMicEnabled,
      isCamEnabled: s.isCamEnabled,
      isScreenSharing: s.isScreenSharing,
    })),
  )

/**
 * Hook: Get all connected peers
 * @returns Map<string, PeerSnapshot>
 */
export const usePeers = () => useStore(rtcStore, s => s.peers)

/**
 * Hook: Get all chat messages
 * @returns ChatMessage[]
 */
export const useMessages = () => useStore(rtcStore, s => s.messages)

/**
 * Hook: Get last error if any
 * @returns RTCClientError | null
 */
export const useLastError = () => useStore(rtcStore, s => s.lastError)

/**
 * Hook: Get timestamp when call connected (null if not connected)
 * @returns number | null
 */
export const useConnectedAt = () => useStore(rtcStore, s => s.connectedAt)

/**
 * Hook: Get all action methods
 * @returns Object with connect, disconnect, toggleMic, toggleCam, startScreenShare, stopScreenShare, sendMessage
 */
export const useRTCActions = () =>
  useStore(
    rtcStore,
    useShallow(s => ({
      connect: s.connect,
      disconnect: s.disconnect,
      toggleMic: s.toggleMic,
      toggleCam: s.toggleCam,
      startScreenShare: s.startScreenShare,
      stopScreenShare: s.stopScreenShare,
      sendMessage: s.sendMessage,
    })),
  )
