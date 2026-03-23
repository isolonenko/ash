import { useCallback, useSyncExternalStore } from 'react'
import { useConnectedAt } from './useRTC'

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

let currentSecond = Math.floor(Date.now() / 1000)
const listeners = new Set<() => void>()

function getSnapshot(): number {
  return currentSecond
}

function subscribe(onStoreChange: () => void): () => void {
  if (listeners.size === 0) {
    startTicking()
  }
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
    if (listeners.size === 0) {
      stopTicking()
    }
  }
}

let tickInterval: ReturnType<typeof setInterval> | undefined

function startTicking(): void {
  tickInterval = setInterval(() => {
    const next = Math.floor(Date.now() / 1000)
    if (next !== currentSecond) {
      currentSecond = next
      for (const listener of listeners) {
        listener()
      }
    }
  }, 200)
}

function stopTicking(): void {
  clearInterval(tickInterval)
  tickInterval = undefined
}

export const useCallDuration = (): string | null => {
  const connectedAt = useConnectedAt()

  const snap = useCallback(() => getSnapshot(), [])
  const now = useSyncExternalStore(subscribe, snap)

  if (connectedAt === null) return null

  const elapsedMs = now * 1000 - connectedAt
  return formatElapsed(Math.max(0, elapsedMs))
}
