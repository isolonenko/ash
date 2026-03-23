import type { Participant } from '@/types'
import { ParticipantTile } from './ParticipantTile'
import styles from './VideoGrid.module.sass'

interface VideoGridProps {
  participants: Participant[]
  localStream: MediaStream | null
  speakingMap: Map<string, boolean>
  localUserId: string
  displayNames: Map<string, string>
  provideMediaRef?: (peerId: string, node: HTMLVideoElement | null) => void
}

export const VideoGrid = ({
  participants,
  localStream,
  speakingMap,
  localUserId,
  displayNames,
  provideMediaRef,
}: VideoGridProps) => {
  // Separate local and remote participants
  const localParticipant = participants.find(p => p.peerId === localUserId)
  const remoteParticipants = participants.filter(p => p.peerId !== localUserId)

  // Build ordered list: remotes first, local last
  const orderedParticipants = [...remoteParticipants]
  if (localParticipant) {
    orderedParticipants.push(localParticipant)
  }

  const participantCount = orderedParticipants.length

  // Check if anyone is screensharing
  const screenshareParticipant = orderedParticipants.find(p => p.screenSharing)
  const isScreenshareActive = screenshareParticipant !== undefined

  // Separate screensharer from other participants
  const otherParticipants = isScreenshareActive
    ? orderedParticipants.filter(p => p.peerId !== screenshareParticipant.peerId)
    : orderedParticipants

  const renderParticipantTile = (participant: Participant) => {
    const isLocal = participant.peerId === localUserId
    const stream = isLocal ? localStream : participant.stream
    const isSpeaking = isLocal ? (speakingMap.get('local') ?? false) : (speakingMap.get(participant.peerId) ?? false)
    const displayName = displayNames.get(participant.peerId) ?? participant.displayName

    return (
      <ParticipantTile
        key={participant.peerId}
        stream={stream}
        displayName={displayName}
        isSpeaking={isSpeaking}
        isLocalUser={isLocal}
        isScreenSharing={participant.screenSharing}
        userId={participant.peerId}
        audioEnabled={participant.audioEnabled}
        videoEnabled={participant.videoEnabled}
        provideMediaRef={provideMediaRef}
      />
    )
  }

  if (isScreenshareActive) {
    return (
      <div className={styles.grid} data-count={participantCount} data-screenshare-active="true">
        <div className={styles.mainArea}>{renderParticipantTile(screenshareParticipant)}</div>
        <div className={styles.sidebar}>{otherParticipants.map(participant => renderParticipantTile(participant))}</div>
      </div>
    )
  }

  return (
    <div className={styles.grid} data-count={participantCount}>
      {orderedParticipants.map(participant => renderParticipantTile(participant))}
    </div>
  )
}
