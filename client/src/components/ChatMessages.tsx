import { useRef, useEffect } from "react";
import type { Contact } from "@/types";
import { useConnectionContext } from "@/context/connection-context";
import { useCallContext } from "@/context/call-context";
import { useMessages } from "@/hooks/useMessages";
import { shortenKey } from "@/lib/crypto";
import { MessageBubble } from "./MessageBubble";
import { CallOverlay } from "./CallOverlay";
import styles from "./ChatWindow.module.scss";

interface ChatMessagesProps {
  contact: Contact;
}

export const ChatMessages = ({ contact }: ChatMessagesProps) => {
  const { connectedPeerKey, incomingChat, peerTyping, connectionState } =
    useConnectionContext();

  const {
    callState,
    localStream,
    remoteStream,
    currentCallType,
    isAudioEnabled,
    isVideoEnabled,
    endCall,
    toggleAudio,
    toggleVideo,
  } = useCallContext();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedIncomingRef = useRef<string | null>(null);

  const { messages, receiveMessage } = useMessages(contact.publicKey);

  const isConnectedToThisContact =
    connectionState === "connected" && connectedPeerKey === contact.publicKey;

  useEffect(() => {
    if (!incomingChat) return;
    if (processedIncomingRef.current === incomingChat.id) return;
    if (connectedPeerKey !== contact.publicKey) return;

    processedIncomingRef.current = incomingChat.id;
    receiveMessage(incomingChat.text, incomingChat.id);
  }, [incomingChat, contact.publicKey, connectedPeerKey, receiveMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className={styles.messages}>
      {callState !== "idle" && callState !== "ended" && (
        <CallOverlay
          localStream={localStream}
          remoteStream={remoteStream}
          callState={callState}
          callType={currentCallType ?? "audio"}
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          callerName={contact.name || shortenKey(contact.publicKey)}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onEndCall={endCall}
        />
      )}
      {messages.length === 0 ? (
        <div className={styles.empty}>No messages yet</div>
      ) : (
        messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
      )}
      {peerTyping && isConnectedToThisContact && (
        <div className={styles.typingIndicator}>typing...</div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
