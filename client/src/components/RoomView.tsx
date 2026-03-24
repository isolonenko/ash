import { useState, useCallback, useMemo, useEffect } from 'react'
import type { Participant, ChatMessage } from '@/types'
import { useRoomContext } from '@/context/room-context'
import { useConnectionState, useConnectSubState, useLocalMedia, usePeers, useMessages, useRTCActions } from '@/hooks/useRTC'
import { useSpeakingIndicator } from '@/hooks/useSpeakingIndicator'
import { useWakeLock } from '@/hooks/useWakeLock'
import { usePictureInPicture } from '@/hooks/usePictureInPicture'
import { useCallDuration } from '@/hooks/useCallDuration'
import { VideoGrid } from './VideoGrid'
import { ChatPanel } from './ChatPanel'
import { RoomControls } from './RoomControls'
import { ConnectionStatus } from './ConnectionStatus'
import styles from './App.module.sass'

interface RoomViewProps {
  roomId: string
}

export const RoomView = ({ roomId }: RoomViewProps) => {
  const [chatOpen, setChatOpen] = useState(false)

  const { state: roomState, leaveRoom } = useRoomContext()
  const localUserId = roomState.peerId ?? ''
  const displayName = roomState.displayName ?? 'Anonymous'

  // Zustand selectors
  const connectionState = useConnectionState()
  const connectSubState = useConnectSubState()
  const { stream: localStream, isMicEnabled, isCamEnabled, isScreenSharing } = useLocalMedia()
  const peers = usePeers()
  const messages = useMessages()
  const { connect, disconnect, toggleMic, toggleCam, startScreenShare, stopScreenShare, sendMessage } = useRTCActions()
  const pip = usePictureInPicture()
  const callDuration = useCallDuration()

  useWakeLock(true)

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (localUserId && roomId) {
      connect(
        roomId,
        localUserId,
        displayName,
        roomState.initialAudioEnabled ?? true,
        roomState.initialVideoEnabled ?? true,
      )
    }

    return () => {
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run once on mount
  }, [])

  // Derive remote streams for speaking indicator
  const remoteStreams = useMemo(() => {
    const map = new Map<string, MediaStream>()
    for (const [peerId, peer] of peers) {
      if (peer.stream) {
        map.set(peerId, peer.stream)
      }
    }
    return map
  }, [peers])

  const speakingMap = useSpeakingIndicator(localStream, remoteStreams)

  const participants: Participant[] = useMemo(() => {
    const result: Participant[] = []

    if (localUserId) {
      result.push({
        peerId: localUserId,
        displayName,
        audioEnabled: isMicEnabled,
        videoEnabled: isCamEnabled,
        screenSharing: isScreenSharing,
        stream: localStream,
        isSpeaking: speakingMap.get('local') ?? false,
      })
    }

    for (const [peerId, peer] of peers) {
      result.push({
        peerId,
        displayName: peer.displayName,
        audioEnabled: peer.audioEnabled,
        videoEnabled: peer.videoEnabled,
        screenSharing: peer.screenSharing,
        stream: peer.stream,
        isSpeaking: speakingMap.get(peerId) ?? false,
      })
    }

    return result
  }, [localUserId, displayName, isMicEnabled, isCamEnabled, localStream, peers, speakingMap])

  const displayNames = useMemo(() => {
    const map = new Map<string, string>()
    if (localUserId) map.set(localUserId, displayName)
    for (const [peerId, peer] of peers) {
      map.set(peerId, peer.displayName)
    }
    return map
  }, [localUserId, displayName, peers])

  const handleLeaveRoom = useCallback(() => {
    disconnect()
    leaveRoom()
  }, [disconnect, leaveRoom])

  const handleToggleChat = useCallback(() => {
    setChatOpen(prev => !prev)
  }, [])

  const pipVideoRef = useCallback(
    (id: string, node: HTMLVideoElement | null) => {
      if (node && id !== localUserId) {
        pip.setVideoElement(node)
      }
    },
    [localUserId, pip],
  )

  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/#/room/${roomId}/preview`
    void navigator.clipboard.writeText(link)
  }, [roomId])

  const screenShareSupported = typeof navigator.mediaDevices?.getDisplayMedia === 'function'

  const handleToggleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      void stopScreenShare()
    } else {
      void startScreenShare()
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare])

  const handleRetry = useCallback(() => {
    if (localUserId && roomId) {
      connect(
        roomId,
        localUserId,
        displayName,
        roomState.initialAudioEnabled ?? true,
        roomState.initialVideoEnabled ?? true,
      )
    }
  }, [localUserId, roomId, displayName, roomState.initialAudioEnabled, roomState.initialVideoEnabled, connect])

  const handleSendMessage = useCallback((text: string) => sendMessage(text), [sendMessage])

  return (
    <div className={styles.roomView}>
      <ConnectionStatus
        connectionState={connectionState}
        connectSubState={connectSubState}
        signalingConnected={connectionState === 'connected'}
        peers={peers}
        localPeerId={localUserId}
        onRetry={handleRetry}
      />
      <VideoGrid
        participants={participants}
        localStream={localStream}
        speakingMap={speakingMap}
        localUserId={localUserId}
        displayNames={displayNames}
        provideMediaRef={pipVideoRef}
      />
      <ChatPanel
        messages={messages as ChatMessage[]}
        onSendMessage={handleSendMessage}
        isOpen={chatOpen}
        onClose={handleToggleChat}
        currentUserId={localUserId}
      />
      <RoomControls
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleChat={handleToggleChat}
        onLeaveRoom={handleLeaveRoom}
        onCopyLink={handleCopyLink}
        onTogglePip={pip.toggle}
        onToggleScreenShare={handleToggleScreenShare}
        micEnabled={isMicEnabled}
        camEnabled={isCamEnabled}
        chatOpen={chatOpen}
        pipActive={pip.isActive}
        pipSupported={pip.isSupported}
        screenSharing={isScreenSharing}
        screenShareSupported={screenShareSupported}
        roomCode={roomId}
        callDuration={callDuration}
      />
    </div>
  )
}
