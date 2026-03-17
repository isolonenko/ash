import type { Contact } from "@/types";
import { useMessages } from "@/hooks/useMessages";
import { ChatHeader } from "./ChatHeader";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import styles from "./ChatWindow.module.sass";
interface ChatWindowProps {
  contact: Contact | null;
  onBack?: () => void;
}

export const ChatWindow = ({ contact, onBack }: ChatWindowProps) => {
  const messagesHook = useMessages(contact?.publicKey ?? null);

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

  return (
    <div className={styles.container}>
      <ChatHeader contact={contact} onBack={onBack} />
      <ChatMessages contact={contact} messagesHook={messagesHook} />
      <ChatInput contact={contact} messagesHook={messagesHook} />
    </div>
  );
};
