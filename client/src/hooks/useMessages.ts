import { useState, useEffect, useCallback } from "react";
import type { ChatMessage } from "@/types";
import {
  getMessages,
  saveMessage,
  markMessageRead as markRead,
} from "@/lib/storage";
import { generateId } from "@/lib/crypto";

export interface UseMessagesResult {
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
  const [loadedKey, setLoadedKey] = useState<string | null | undefined>(
    undefined,
  );
  const loading = loadedKey !== contactPublicKey;

  const reload = useCallback(async () => {
    if (!contactPublicKey) {
      setMessages([]);
      setLoadedKey(contactPublicKey);
      return;
    }
    const msgs = await getMessages(contactPublicKey);
    setMessages(msgs);
    setLoadedKey(contactPublicKey);
  }, [contactPublicKey]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!contactPublicKey) {
        setMessages([]);
        setLoadedKey(contactPublicKey);
        return;
      }
      const msgs = await getMessages(contactPublicKey);
      if (!cancelled) {
        setMessages(msgs);
        setLoadedKey(contactPublicKey);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [contactPublicKey]);

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

  const markMessageRead = useCallback(async (messageId: string) => {
    await markRead(messageId);
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, read: true } : m)),
    );
  }, []);

  return {
    messages,
    loading,
    sendMessage,
    receiveMessage,
    markMessageRead,
    reload,
  };
};
