import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import type { ChatMessage } from "@/types";
import styles from "./ChatPanel.module.sass";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const ChatPanel = ({
  messages,
  onSendMessage,
  isOpen,
  onClose,
  currentUserId,
}: ChatPanelProps) => {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const text = inputText.trim();
      if (!text) return;

      onSendMessage(text);
      setInputText("");
    },
    [inputText, onSendMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <>
      <div
        className={`${styles.overlay} ${isOpen ? styles.overlayVisible : ""}`}
        onClick={onClose}
      />
      <div className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}>
        <div className={styles.header}>
          <div className={styles.title}>CHAT PANEL</div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close chat panel"
          >
            ×
          </button>
        </div>

        <div className={styles.messages}>
          {messages.length === 0 ? (
            <div className={styles.empty}>No messages yet</div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.senderId === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={isOwn ? styles.messageOwn : styles.messageOther}
                >
                  <div className={styles.messageSender}>{msg.senderName}</div>
                  <div className={styles.messageText}>{msg.text}</div>
                  <div className={styles.messageTime}>
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className={styles.inputArea} onSubmit={handleSend}>
          <input
            className={styles.input}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={!inputText.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
};
