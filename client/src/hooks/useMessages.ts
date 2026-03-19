import { useState, useCallback } from "react";
import type { ChatMessage, DataChannelMessage, ChatPayload } from "@/types";

export interface UseMessagesResult {
  messages: readonly ChatMessage[];
  sendMessage: (text: string) => void;
  receiveDataChannelMessage: (data: string, senderPeerId: string) => void;
  clearMessages: () => void;
}

function storageKey(roomId: string): string {
  return `messages-${roomId}`;
}

function loadMessages(roomId: string): ChatMessage[] {
  const stored = sessionStorage.getItem(storageKey(roomId));
  return stored ? (JSON.parse(stored) as ChatMessage[]) : [];
}

function persistMessages(roomId: string, msgs: readonly ChatMessage[]): void {
  sessionStorage.setItem(storageKey(roomId), JSON.stringify(msgs));
}

export function useMessages(
  roomId: string | null,
  localPeerId: string | null,
  localDisplayName: string,
  sendToAll?: (msg: string) => void,
): UseMessagesResult {
  const [messages, setMessages] = useState<readonly ChatMessage[]>(() =>
    roomId ? loadMessages(roomId) : [],
  );

  // Auto-load/clear messages when room changes
  const [prevRoomId, setPrevRoomId] = useState<string | null>(roomId);
  if (prevRoomId !== roomId) {
    setPrevRoomId(roomId);
    if (roomId) {
      setMessages(loadMessages(roomId));
    } else {
      setMessages([]);
    }
  }

  const sendMessage = useCallback(
    (text: string): void => {
      if (!roomId || !localPeerId) return;

      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        senderId: localPeerId,
        senderName: localDisplayName,
        text,
        timestamp: Date.now(),
        fromMe: true,
      };

      setMessages((prev) => {
        const next = [...prev, msg];
        persistMessages(roomId, next);
        return next;
      });

      // Broadcast via mesh DataChannel
      const dcMessage: DataChannelMessage = {
        type: "chat",
        payload: {
          id: msg.id,
          senderName: msg.senderName,
          text: msg.text,
          timestamp: msg.timestamp,
        } satisfies ChatPayload,
      };
      sendToAll?.(JSON.stringify(dcMessage));
    },
    [roomId, localPeerId, localDisplayName, sendToAll],
  );

  const receiveDataChannelMessage = useCallback(
    (data: string, senderPeerId: string): void => {
      if (!roomId) return;

      let parsed: DataChannelMessage;
      try {
        parsed = JSON.parse(data) as DataChannelMessage;
      } catch {
        return;
      }

      // Type discrimination: only handle chat messages
      if (parsed.type !== "chat") return;

      const payload = parsed.payload as ChatPayload;
      const msg: ChatMessage = {
        id: payload.id,
        senderId: senderPeerId,
        senderName: payload.senderName,
        text: payload.text,
        timestamp: payload.timestamp,
        fromMe: false,
      };

      setMessages((prev) => {
        // Deduplicate by id
        if (prev.some((m) => m.id === msg.id)) return prev;
        const next = [...prev, msg];
        persistMessages(roomId, next);
        return next;
      });
    },
    [roomId],
  );

  const clearMessages = useCallback((): void => {
    if (roomId) {
      sessionStorage.removeItem(storageKey(roomId));
    }
    setMessages([]);
  }, [roomId]);

  return { messages, sendMessage, receiveDataChannelMessage, clearMessages };
}
