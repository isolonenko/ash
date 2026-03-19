import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { Participant, DataChannelMessage, ChatMessage, MediaStatePayload } from "@/types";
import { useRoomContext } from "@/context/room-context";
import { useMesh } from "@/hooks/useMesh";
import { useMessages } from "@/hooks/useMessages";
import { useMediaControls } from "@/hooks/useMediaControls";
import { useSpeakingIndicator } from "@/hooks/useSpeakingIndicator";
import { VideoGrid } from "./VideoGrid";
import { ChatPanel } from "./ChatPanel";
import { RoomControls } from "./RoomControls";
import styles from "./App.module.sass";

// ── Props ────────────────────────────────────────────────

interface RoomViewProps {
  roomId: string;
}

// ── Component ────────────────────────────────────────────

export const RoomView = ({ roomId }: RoomViewProps) => {
  const [chatOpen, setChatOpen] = useState(false);

  // ── useRoom ──────────────────────────────────────────
  const { state: roomState, leaveRoom } = useRoomContext();
  const localUserId = roomState.peerId ?? "";
  const displayName = roomState.displayName ?? "Anonymous";

  // ── useMediaControls ─────────────────────────────────
  const {
    localStream,
    audioEnabled,
    videoEnabled,
    getPreviewStream,
    getLocalTracks,
    toggleAudio,
    toggleVideo,
    setBroadcastSend,
  } = useMediaControls();

  // ── Acquire camera/mic on mount ──────────────────────
  const [mediaReady, setMediaReady] = useState(false);

  useEffect(() => {
    getPreviewStream()
      .then(() => {
        if (!roomState.initialAudioEnabled) toggleAudio();
        if (!roomState.initialVideoEnabled) toggleVideo();
      })
      .catch(() => {})
      .finally(() => {
        setMediaReady(true);
      });
  }, [getPreviewStream, toggleAudio, toggleVideo, roomState.initialAudioEnabled, roomState.initialVideoEnabled]);

  // ── Remote media state tracking ─────────────────────
  const [remoteMediaState, setRemoteMediaState] = useState<
    Map<string, { audioEnabled: boolean; videoEnabled: boolean }>
  >(() => new Map());

  // ── Ref for receiving DC messages (solves circular dep) ─
  const receiveDcMessageRef = useRef<
    ((data: string, senderPeerId: string) => void) | null
  >(null);

  // ── useMesh ──────────────────────────────────────────
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

  const { peers, sendToAll } = useMesh({
    peerId: localUserId,
    displayName,
    roomId,
    streamReady: mediaReady,
    onMessage: handleDataChannelMessage,
    getLocalTracks,
  });

  // Wire broadcast channel for media state messages
  const sendToAllString = useCallback(
    (msg: string) => {
      try {
        const parsed = JSON.parse(msg) as DataChannelMessage;
        sendToAll(parsed);
      } catch {
        // Shouldn't happen with well-formed messages
      }
    },
    [sendToAll],
  );

  useEffect(() => {
    setBroadcastSend(sendToAllString);
    return () => setBroadcastSend(null);
  }, [sendToAllString, setBroadcastSend]);

  // ── useMessages ──────────────────────────────────────
  const { messages, sendMessage, receiveDataChannelMessage } = useMessages(
    roomId,
    localUserId || null,
    displayName,
    sendToAllString,
  );

  // Wire up the ref after useMessages is initialized
  useEffect(() => {
    receiveDcMessageRef.current = receiveDataChannelMessage;
  }, [receiveDataChannelMessage]);

  // ── useSpeakingIndicator ─────────────────────────────
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

  // ── Build participants list for VideoGrid ────────────
  const participants: Participant[] = useMemo(() => {
    const result: Participant[] = [];

    // Local participant
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

    // Remote participants from mesh peers
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
  }, [localUserId, displayName, audioEnabled, videoEnabled, localStream, peers, speakingMap, remoteMediaState]);

  // ── Build display names map ──────────────────────────
  const displayNames = useMemo(() => {
    const map = new Map<string, string>();
    if (localUserId) {
      map.set(localUserId, displayName);
    }
    for (const [peerId, peer] of peers) {
      map.set(peerId, peer.displayName ?? peerId);
    }
    return map;
  }, [localUserId, displayName, peers]);

  // ── Event handlers ───────────────────────────────────

  const handleLeaveRoom = useCallback(() => {
    leaveRoom();
  }, [leaveRoom]);

  const handleToggleChat = useCallback(() => {
    setChatOpen((prev) => !prev);
  }, []);

  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/#/room/${roomId}/preview`;
    void navigator.clipboard.writeText(link);
  }, [roomId]);

  const handleSendMessage = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  // ── Render ───────────────────────────────────────────

  return (
    <div className={styles.roomView}>
      <VideoGrid
        participants={participants}
        localStream={localStream}
        speakingMap={speakingMap}
        localUserId={localUserId}
        displayNames={displayNames}
      />
      <ChatPanel
        messages={messages as ChatMessage[]}
        onSendMessage={handleSendMessage}
        isOpen={chatOpen}
        onClose={handleToggleChat}
        currentUserId={localUserId}
      />
      <RoomControls
        onToggleMic={toggleAudio}
        onToggleCam={toggleVideo}
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
