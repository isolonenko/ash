import { useSyncExternalStore, useCallback } from 'react'
import { mediaManager } from '@/lib/rtc/media-manager-instance'

function subscribeToMedia(callback: () => void): () => void {
  const unsubs = [
    mediaManager.on('acquired', callback),
    mediaManager.on('changed', callback),
    mediaManager.on('released', callback),
    mediaManager.on('devices-changed', callback),
    mediaManager.on('device-switched', callback),
  ]

  return () => {
    for (const unsub of unsubs) unsub()
  }
}

let cachedMediaState: { isMicEnabled: boolean; isCamEnabled: boolean } | null = null

function getMediaStateSnapshot(): { isMicEnabled: boolean; isCamEnabled: boolean } {
  const mic = mediaManager.isMicEnabled
  const cam = mediaManager.isCamEnabled
  if (cachedMediaState && cachedMediaState.isMicEnabled === mic && cachedMediaState.isCamEnabled === cam) {
    return cachedMediaState
  }
  cachedMediaState = { isMicEnabled: mic, isCamEnabled: cam }
  return cachedMediaState
}

let cachedDevices: { audio: readonly MediaDeviceInfo[]; video: readonly MediaDeviceInfo[] } | null = null

function getDevicesSnapshot(): { audio: readonly MediaDeviceInfo[]; video: readonly MediaDeviceInfo[] } {
  const devices = mediaManager.devices
  if (cachedDevices && cachedDevices.audio === devices.audio && cachedDevices.video === devices.video) {
    return cachedDevices
  }
  cachedDevices = devices
  return cachedDevices
}

let cachedSelectedDevices: { audioId: string | null; videoId: string | null } | null = null

function getSelectedDevicesSnapshot(): { audioId: string | null; videoId: string | null } {
  const audioId = mediaManager.selectedAudioId
  const videoId = mediaManager.selectedVideoId
  if (cachedSelectedDevices && cachedSelectedDevices.audioId === audioId && cachedSelectedDevices.videoId === videoId) {
    return cachedSelectedDevices
  }
  cachedSelectedDevices = { audioId, videoId }
  return cachedSelectedDevices
}

export function useLocalStream(): MediaStream | null {
  return useSyncExternalStore(subscribeToMedia, () => mediaManager.stream)
}

export function useMediaState(): { isMicEnabled: boolean; isCamEnabled: boolean } {
  return useSyncExternalStore(subscribeToMedia, getMediaStateSnapshot)
}

export function useDevices(): { audio: readonly MediaDeviceInfo[]; video: readonly MediaDeviceInfo[] } {
  return useSyncExternalStore(subscribeToMedia, getDevicesSnapshot)
}

export function useSelectedDevices(): { audioId: string | null; videoId: string | null } {
  return useSyncExternalStore(subscribeToMedia, getSelectedDevicesSnapshot)
}

export function useMediaActions() {
  const acquire = useCallback(
    (opts?: { audioDeviceId?: string; videoDeviceId?: string }) => mediaManager.acquire(opts),
    [],
  )
  const release = useCallback(() => mediaManager.release(), [])
  const enumerate = useCallback(() => mediaManager.enumerate(), [])
  const toggleMic = useCallback(() => mediaManager.toggleMic(), [])
  const toggleCam = useCallback(() => mediaManager.toggleCam(), [])
  const switchDevice = useCallback(
    (kind: 'audio' | 'video', deviceId: string) => mediaManager.switchDevice(kind, deviceId),
    [],
  )

  return { acquire, release, enumerate, toggleMic, toggleCam, switchDevice }
}
