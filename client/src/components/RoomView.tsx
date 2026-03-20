import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type {
  Participant,
  DataChannelMessage,
  ChatMessage,
  MediaStatePayload,
} from "@/types";
import { useRoomContext } from "@/context/room-context";
import { useMedia } from "@/context/media-context";
import { useSignaling } from "@/context/signaling-context";
import { usePeerConnections } from "@/hooks/usePeerConnections";
import { useMessages } from "@/hooks/useMessages";
import { useSpeakingIndicator } from "@/hooks/useSpeakingIndicator";
import { VideoGrid } from "./VideoGrid";
import { ChatPanel } from "./ChatPanel";
import { RoomControls } from "./RoomControls";
import { ConnectionStatus } from "./ConnectionStatus";
import styles from "./App.module.sass";

interface RoomViewProps {
  roomId: string;
}

export const RoomView = ({ roomId }: RoomViewProps) => {
  const [chatOpen, setChatOpen] = useState(false);

  const { state: roomState, leaveRoom } = useRoomContext();
  const localUserId = roomState.peerId ?? "";
  const displayName = roomState.displayName ?? "Anonymous";
  const {
    ready: mediaReady,
    acquire: mediaAcquire,
    release: mediaRelease,
    localStream,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
  } = useMedia();
  const signaling = useSignaling();

  useEffect(() => {
    if (!mediaReady) {
      mediaAcquire().catch(() => {});
    }
  }, [mediaReady, mediaAcquire]);

  const appliedInitialRef = useRef(false);
  useEffect(() => {
    if (mediaReady && !appliedInitialRef.current) {
      appliedInitialRef.current = true;
      if (!roomState.initialAudioEnabled && audioEnabled) toggleAudio();
      if (!roomState.initialVideoEnabled && videoEnabled) toggleVideo();
    }
  }, [
    mediaReady,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
    roomState.initialAudioEnabled,
    roomState.initialVideoEnabled,
  ]);

  const [remoteMediaState, setRemoteMediaState] = useState<
    Map<string, { audioEnabled: boolean; videoEnabled: boolean }>
  >(() => new Map());

  const receiveDcMessageRef = useRef<
    ((data: string, senderPeerId: string) => void) | null
  >(null);

  const handleDataChannelMessage = useCallback(
    (peerId: string, msg: DataChannelMessage) => {
      if (msg.type === "media-state") {
        const payload = msg.payload as MediaStatePayload;
        setRemoteMediaState((prev) => {
          const next = new Map(prev);
          next.set(peerId, {
            audioEnabled: payload.audioEnabled,
            videoEnabled: payload.videoEnabled,
          });
          return next;
        });
        return;
      }

      receiveDcMessageRef.current?.(JSON.stringify(msg), peerId);
    },
    [],
  );

  const { peers, sendToAll, provideMediaRef } = usePeerConnections({
    peerId: localUserId,
    displayName,
    roomId,
    onMessage: handleDataChannelMessage,
  });

  const broadcastMediaState = useCallback(
    (audio: boolean, video: boolean) => {
      sendToAll({
        type: "media-state",
        payload: { audioEnabled: audio, videoEnabled: video },
      });
    },
    [sendToAll],
  );

  const handleToggleAudio = useCallback(() => {
    const newAudio = !audioEnabled;
    toggleAudio();
    broadcastMediaState(newAudio, videoEnabled);
  }, [audioEnabled, videoEnabled, toggleAudio, broadcastMediaState]);

  const handleToggleVideo = useCallback(() => {
    const newVideo = !videoEnabled;
    toggleVideo();
    broadcastMediaState(audioEnabled, newVideo);
  }, [audioEnabled, videoEnabled, toggleVideo, broadcastMediaState]);

  const sendToAllString = useCallback(
    (msg: string) => {
      try {
        const parsed = JSON.parse(msg) as DataChannelMessage;
        sendToAll(parsed);
      } catch {
        return;
      }
    },
    [sendToAll],
  );

  const { messages, sendMessage, receiveDataChannelMessage } = useMessages(
    roomId,
    localUserId || null,
    displayName,
    sendToAllString,
  );

  useEffect(() => {
    receiveDcMessageRef.current = receiveDataChannelMessage;
  }, [receiveDataChannelMessage]);

  const remoteStreams = useMemo(() => {
    const map = new Map<string, MediaStream>();
    for (const [peerId, peer] of peers) {
      if (peer.remoteStream) {
        map.set(peerId, peer.remoteStream);
      }
    }
    return map;
  }, [peers]);

  const speakingMap = useSpeakingIndicator(localStream, remoteStreams);

  const participants: Participant[] = useMemo(() => {
    const result: Participant[] = [];

    if (localUserId) {
      result.push({
        peerId: localUserId,
        displayName,
        audioEnabled,
        videoEnabled,
        stream: localStream,
        isSpeaking: speakingMap.get("local") ?? false,
      });
    }

    for (const [peerId, peer] of peers) {
      const mediaState = remoteMediaState.get(peerId);
      result.push({
        peerId,
        displayName: peer.displayName ?? peerId,
        audioEnabled: mediaState?.audioEnabled ?? true,
        videoEnabled: mediaState?.videoEnabled ?? true,
        stream: peer.remoteStream,
        isSpeaking: speakingMap.get(peerId) ?? false,
      });
    }

    return result;
  }, [
    localUserId,
    displayName,
    audioEnabled,
    videoEnabled,
    localStream,
    peers,
    speakingMap,
    remoteMediaState,
  ]);

  const displayNames = useMemo(() => {
    const map = new Map<string, string>();
    if (localUserId) map.set(localUserId, displayName);
    for (const [peerId, peer] of peers) {
      map.set(peerId, peer.displayName ?? peerId);
    }
    return map;
  }, [localUserId, displayName, peers]);

  const handleLeaveRoom = useCallback(() => {
    mediaRelease();
    leaveRoom();
  }, [mediaRelease, leaveRoom]);

  const handleToggleChat = useCallback(() => {
    setChatOpen((prev) => !prev);
  }, []);

  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/#/room/${roomId}/preview`;
    void navigator.clipboard.writeText(link);
  }, [roomId]);

  const handleSendMessage = useCallback(
    (text: string) => sendMessage(text),
    [sendMessage],
  );

  return (
    <div className={styles.roomView}>
      <VideoGrid
        participants={participants}
        localStream={localStream}
        speakingMap={speakingMap}
        localUserId={localUserId}
        displayNames={displayNames}
        provideMediaRef={provideMediaRef}
      />
      <ChatPanel
        messages={messages as ChatMessage[]}
        onSendMessage={handleSendMessage}
        isOpen={chatOpen}
        onClose={handleToggleChat}
        currentUserId={localUserId}
      />
      <ConnectionStatus
        signalingConnected={signaling.connected}
        peers={peers}
        localPeerId={localUserId}
      />
      <RoomControls
        onToggleMic={handleToggleAudio}
        onToggleCam={handleToggleVideo}
        onToggleChat={handleToggleChat}
        onLeaveRoom={handleLeaveRoom}
        onCopyLink={handleCopyLink}
        micEnabled={audioEnabled}
        camEnabled={videoEnabled}
        chatOpen={chatOpen}
        roomCode={roomId}
      />
    </div>
  );
};
