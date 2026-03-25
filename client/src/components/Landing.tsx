import { useState } from 'react'
import { useRoomContext } from '@/context/room-context'
import { navigateTo } from '@/lib/router'
import styles from './Landing.module.sass'

export const Landing = () => {
  const { createRoom } = useRoomContext()
  const [roomCode, setRoomCode] = useState('')

  const handleCreateRoom = async () => {
    await createRoom()
  }

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (roomCode.trim()) {
      navigateTo({ page: 'preview', roomId: roomCode.trim() })
    }
  }

  const canJoin = roomCode.trim().length > 0

  return (
    <div className={styles.landing}>
      <div className={styles.container}>
        <div className={styles.header}>
          <img src="/favicon.svg" alt="Ash" className={styles.logo} />
          <h1 className={styles.title}>ash</h1>
          <p className={styles.tagline}>Talk freely.</p>
        </div>

        <div className={styles.actions}>
          <div className={styles.section}>
            <button className={styles.createButton} onClick={handleCreateRoom} type="button">
              Create Room
            </button>
          </div>

          <div className={styles.divider}>
            <span className={styles.dividerText}>or</span>
          </div>

          <div className={styles.section}>
            <form onSubmit={handleJoinSubmit} className={styles.joinForm}>
              <input
                type="text"
                className={styles.input}
                placeholder="Enter room code"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className={styles.joinButton} disabled={!canJoin}>
                Join Room
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
