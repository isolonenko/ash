import type { Participant } from "@/types";
import { ParticipantTile } from "./ParticipantTile";
import styles from "./VideoGrid.module.sass";

interface VideoGridProps {
  participants: Participant[];
  localStream: MediaStream | null;
  speakingMap: Map<string, boolean>;
  localUserId: string;
  localScreenSharing?: boolean;
  displayNames: Map<string, string>;
  provideMediaRef?: (peerId: string, node: HTMLVideoElement | null) => void;
}

export const VideoGrid = ({
  participants,
  localStream,
  speakingMap,
  localUserId,
  localScreenSharing,
  displayNames,
  provideMediaRef,
}: VideoGridProps) => {
  // Separate local and remote participants
  const localParticipant = participants.find((p) => p.peerId === localUserId);
  const remoteParticipants = participants.filter(
    (p) => p.peerId !== localUserId,
  );

  // Build ordered list: remotes first, local last
  const orderedParticipants = [...remoteParticipants];
  if (localParticipant) {
    orderedParticipants.push(localParticipant);
  }

  const participantCount = orderedParticipants.length;

  return (
    <div className={styles.grid} data-count={participantCount}>
      {orderedParticipants.map((participant) => {
        const isLocal = participant.peerId === localUserId;
        const stream = isLocal ? localStream : participant.stream;
        const isSpeaking = isLocal
          ? (speakingMap.get("local") ?? false)
          : (speakingMap.get(participant.peerId) ?? false);
        const displayName =
          displayNames.get(participant.peerId) ?? participant.displayName;

        return (
          <ParticipantTile
            key={participant.peerId}
            stream={stream}
            displayName={displayName}
            isSpeaking={isSpeaking}
            isLocalUser={isLocal}
            isScreenSharing={isLocal ? localScreenSharing : undefined}
            userId={participant.peerId}
            audioEnabled={participant.audioEnabled}
            videoEnabled={participant.videoEnabled}
            provideMediaRef={provideMediaRef}
          />
        );
      })}
    </div>
  );
};
