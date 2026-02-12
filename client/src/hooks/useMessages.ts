import { useState, useEffect, useCallback } from "react";
import type { ChatMessage } from "@shared/types";
import {
  getMessages,
  saveMessage,
  markMessageRead as markRead,
} from "@/lib/storage";
import { generateId } from "@/lib/crypto";

interface UseMessagesResult {
  messages: readonly ChatMessage[];
  loading: boolean;
  sendMessage: (text: string) => Promise<ChatMessage>;
  receiveMessage: (text: string, messageId?: string) => Promise<ChatMessage>;
  markMessageRead: (messageId: string) => Promise<void>;
  reload: () => Promise<void>;
}

export const useMessages = (
  contactPublicKey: string | null,
): UseMessagesResult => {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!contactPublicKey) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const msgs = await getMessages(contactPublicKey);
    setMessages(msgs);
    setLoading(false);
  }, [contactPublicKey]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  const sendMessage = useCallback(
    async (text: string): Promise<ChatMessage> => {
      if (!contactPublicKey) throw new Error("No active contact");

      const msg: ChatMessage = {
        id: generateId(),
        contactPublicKey,
        type: "text",
        text,
        timestamp: Date.now(),
        fromMe: true,
        read: true,
      };
      await saveMessage(msg);
      setMessages((prev) => [...prev, msg]);
      return msg;
    },
    [contactPublicKey],
  );

  const receiveMessage = useCallback(
    async (text: string, messageId?: string): Promise<ChatMessage> => {
      if (!contactPublicKey) throw new Error("No active contact");

      const msg: ChatMessage = {
        id: messageId ?? generateId(),
        contactPublicKey,
        type: "text",
        text,
        timestamp: Date.now(),
        fromMe: false,
        read: false,
      };
      await saveMessage(msg);
      setMessages((prev) => [...prev, msg]);
      return msg;
    },
    [contactPublicKey],
  );

  const markMessageRead = useCallback(
    async (messageId: string) => {
      await markRead(messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, read: true } : m)),
      );
    },
    [],
  );

  return {
    messages,
    loading,
    sendMessage,
    receiveMessage,
    markMessageRead,
    reload,
  };
};
