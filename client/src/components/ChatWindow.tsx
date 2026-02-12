import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  Contact,
  PeerConnectionState,
  ChatPayload,
} from "@shared/types";
import { useMessages } from "@/hooks/useMessages";
import { shortenKey } from "@/lib/crypto";
import { MessageBubble } from "./MessageBubble";
import styles from "./ChatWindow.module.scss";

interface ChatWindowProps {
  contact: Contact | null;
  connectionState: PeerConnectionState;
  connectedPeerKey: string | null;
  isConnecting: boolean;
  incomingChat: ChatPayload | null;
  peerTyping: boolean;
  onConnect: (peerPublicKey: string) => Promise<void>;
  onSendChat: (id: string, text: string) => void;
  onSendTyping: (isTyping: boolean) => void;
  onSendFile: (file: File) => Promise<string>;
  onDisconnect: () => void;
  onBack?: () => void;
}

export const ChatWindow = ({
  contact,
  connectionState,
  connectedPeerKey,
  isConnecting,
  incomingChat,
  peerTyping,
  onConnect,
  onSendChat,
  onSendTyping,
  onSendFile,
  onDisconnect,
  onBack,
}: ChatWindowProps) => {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track which incoming messages we've already processed
  const processedIncomingRef = useRef<string | null>(null);

  const { messages, sendMessage, receiveMessage } = useMessages(
    contact?.publicKey ?? null,
  );

  // ── Receive incoming messages from connection ──────────

  useEffect(() => {
    if (!incomingChat) return;
    if (!contact) return;
    // Only process if this message is new (different from last processed)
    if (processedIncomingRef.current === incomingChat.id) return;

    // Only receive messages for the currently active contact.
    // The peer sending us messages should be the connectedPeerKey,
    // which should match the active contact.
    if (connectedPeerKey !== contact.publicKey) return;

    processedIncomingRef.current = incomingChat.id;
    receiveMessage(incomingChat.text, incomingChat.id);
  }, [incomingChat, contact, connectedPeerKey, receiveMessage]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Connection is at App level — check if we're connected to this contact

  const isConnectedToThisContact =
    connectionState === "connected" && connectedPeerKey === contact?.publicKey;

  const isConnectingToThisContact =
    connectionState === "connecting" && connectedPeerKey === contact?.publicKey;

  const handleConnect = useCallback(async () => {
    if (!contact) return;
    await onConnect(contact.publicKey);
  }, [contact, onConnect]);

  const handleSend = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const text = inputText.trim();
      if (!text) return;

      const msg = await sendMessage(text);
      onSendChat(msg.id, text);
      setInputText("");
      onSendTyping(false);
    },
    [inputText, sendMessage, onSendChat, onSendTyping],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setInputText(value);

      // Typing indicator debounce
      onSendTyping(true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        onSendTyping(false);
      }, 2000);
    },
    [onSendTyping],
  );

  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    await onSendFile(file);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [onSendFile]);

  const getStatusLabel = (): { text: string; className: string } => {
    if (isConnectedToThisContact) {
      return { text: "connected", className: styles.connected };
    }
    if (isConnectingToThisContact) {
      return { text: "connecting", className: styles.connecting };
    }
    if (isConnecting) {
      return { text: "looking up peer...", className: styles.connecting };
    }
    // If connected to a different peer, show that
    if (connectionState === "connected" && connectedPeerKey !== contact?.publicKey) {
      return { text: "connected elsewhere", className: styles.disconnected };
    }
    return { text: "", className: "" };
  };

  if (!contact) {
    return (
      <div className={styles.noChat}>
        <div className={styles.noChatTitle}>TheChat</div>
        <div className={styles.noChatSubtitle}>
          Select a contact to start chatting
        </div>
      </div>
    );
  }

  const showConnectButton =
    !isConnectedToThisContact && !isConnectingToThisContact && !isConnecting;

  const status = getStatusLabel();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {onBack && (
          <button className={styles.backButton} onClick={onBack}>
            {"<"}
          </button>
        )}

        <span className={styles.contactName}>
          {contact.name || shortenKey(contact.publicKey)}
        </span>

        {showConnectButton ? (
          <button className={styles.connectButton} onClick={handleConnect}>
            Connect P2P
          </button>
        ) : (
          <>
            <span className={status.className}>{status.text}</span>
            {isConnectedToThisContact && (
              <button className={styles.connectButton} onClick={onDisconnect}>
                Disconnect
              </button>
            )}
          </>
        )}
      </div>

      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.empty}>No messages yet</div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        {peerTyping && isConnectedToThisContact && (
          <div className={styles.typingIndicator}>typing...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className={styles.inputArea} onSubmit={handleSend}>
        <button
          type="button"
          className={styles.fileButton}
          onClick={handleFileClick}
          disabled={!isConnectedToThisContact}
        >
          [F]
        </button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <input
          className={styles.input}
          value={inputText}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isConnectedToThisContact
              ? "Type a message..."
              : "Connect to send messages"
          }
          disabled={!isConnectedToThisContact}
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={!isConnectedToThisContact || !inputText.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
};
