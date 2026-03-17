import type { ChatMessage } from "@/types";
import styles from "./MessageBubble.module.sass";

interface MessageBubbleProps {
  message: ChatMessage;
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  return (
    <div className={message.fromMe ? styles.mine : styles.theirs}>
      <div className={styles.text}>{message.text}</div>
      <div className={styles.meta}>
        <span className={styles.time}>{formatTime(message.timestamp)}</span>
        {message.fromMe && (
          <span className={message.read ? styles.read : styles.readStatus}>
            {message.read ? "//read" : "//sent"}
          </span>
        )}
      </div>
    </div>
  );
};
