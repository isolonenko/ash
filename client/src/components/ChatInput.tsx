import {
  useState,
  useRef,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { Contact } from "@/types";
import { useConnectionContext } from "@/context/connection-context";
import type { UseMessagesResult } from "@/hooks/useMessages";
import { TYPING_DEBOUNCE_MS } from "@/lib/constants";
import styles from "./ChatWindow.module.scss";

interface ChatInputProps {
  contact: Contact;
  messagesHook: UseMessagesResult;
}

export const ChatInput = ({ contact, messagesHook }: ChatInputProps) => {
  const { connectionState, connectedPeerKey, sendChat, sendTyping, sendFile } =
    useConnectionContext();

  const [inputText, setInputText] = useState("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { sendMessage } = messagesHook;

  const isConnectedToThisContact =
    connectionState === "connected" && connectedPeerKey === contact.publicKey;

  const handleSend = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const text = inputText.trim();
      if (!text) return;

      const msg = await sendMessage(text);
      sendChat(msg.id, text);
      setInputText("");
      sendTyping(false);
    },
    [inputText, sendMessage, sendChat, sendTyping],
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

      sendTyping(true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false);
      }, TYPING_DEBOUNCE_MS);
    },
    [sendTyping],
  );

  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    await sendFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [sendFile]);

  return (
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
  );
};
