import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { Participant, DataChannelMessage, ChatMessage } from "@/types";
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
    toggleAudio,
    toggleVideo,
  } = useMediaControls();

  // Acquire camera/mic on mount
  useEffect(() => {
    getPreviewStream().catch(() => {
      // Camera unavailable — participant tile shows initial placeholder
    });
  }, [getPreviewStream]);

  // ── Ref for receiving DC messages (solves circular dep) ─
  const receiveDcMessageRef = useRef<
    ((data: string, senderPeerId: string) => void) | null
  >(null);

  // ── useMesh ──────────────────────────────────────────
  const handleDataChannelMessage = useCallback(
    (_peerId: string, msg: DataChannelMessage) => {
      receiveDcMessageRef.current?.(JSON.stringify(msg), _peerId);
    },
    [],
  );

  const { peers, sendToAll } = useMesh({
    peerId: localUserId,
    displayName,
    roomId,
    onMessage: handleDataChannelMessage,
  });

  // ── useMessages ──────────────────────────────────────
  // useMesh.sendToAll expects DataChannelMessage, useMessages passes JSON string
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
      result.push({
        peerId,
        displayName: peerId,
        audioEnabled: true,
        videoEnabled: true,
        stream: peer.remoteStream,
        isSpeaking: speakingMap.get(peerId) ?? false,
      });
    }

    return result;
  }, [localUserId, displayName, audioEnabled, videoEnabled, localStream, peers, speakingMap]);

  // ── Build display names map ──────────────────────────
  const displayNames = useMemo(() => {
    const map = new Map<string, string>();
    if (localUserId) {
      map.set(localUserId, displayName);
    }
    for (const [peerId] of peers) {
      map.set(peerId, peerId);
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
