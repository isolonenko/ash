import { useEffect, useState } from 'react'
import { useConnectedAt } from './useRTC'

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

export const useCallDuration = (): string | null => {
  const connectedAt = useConnectedAt()
  const [elapsed, setElapsed] = useState<string | null>(null)

  useEffect(() => {
    if (connectedAt === null) {
      setElapsed(null)
      return
    }

    setElapsed(formatElapsed(Date.now() - connectedAt))

    const id = setInterval(() => {
      setElapsed(formatElapsed(Date.now() - connectedAt))
    }, 1000)

    return () => clearInterval(id)
  }, [connectedAt])

  return elapsed
}
