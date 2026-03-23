import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand';
import { RTCClient } from '@/lib/rtc';
import { mediaManager } from '@/lib/rtc/media-manager-instance';
import type { RTCClientState, RTCClientError, PeerSnapshot, ChatMessage, MediaToggleState } from '@/lib/rtc';

function storageKey(roomId: string): string {
  return `messages-${roomId}`;
}

function loadMessages(roomId: string): ChatMessage[] {
  const stored = sessionStorage.getItem(storageKey(roomId));
  return stored ? (JSON.parse(stored) as ChatMessage[]) : [];
}

function persistMessages(roomId: string, msgs: ChatMessage[]): void {
  sessionStorage.setItem(storageKey(roomId), JSON.stringify(msgs));
}

function clearMessages(roomId: string): void {
  sessionStorage.removeItem(storageKey(roomId));
}

export interface RTCState {
  connectionState: RTCClientState;
  connectedAt: number | null;
  localStream: MediaStream | null;
  isMicEnabled: boolean;
  isCamEnabled: boolean;
  isScreenSharing: boolean;
  peers: Map<string, PeerSnapshot>;
  messages: ChatMessage[];
  lastError: RTCClientError | null;
}

export interface RTCActions {
  connect: (
    roomId: string,
    peerId: string,
    displayName: string,
    initialAudioEnabled: boolean,
    initialVideoEnabled: boolean,
  ) => Promise<void>;
  disconnect: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  sendMessage: (text: string) => void;
}

export type RTCStore = RTCState & RTCActions;

function updatePeer(
  peers: Map<string, PeerSnapshot>,
  peerId: string,
  updater: (peer: PeerSnapshot) => PeerSnapshot,
): Map<string, PeerSnapshot> {
  const existing = peers.get(peerId);
  if (!existing) return peers;
  const next = new Map(peers);
  next.set(peerId, updater(existing));
  return next;
}

export function createRTCStore(): StoreApi<RTCStore> {
  let client: RTCClient | null = null;
  let currentRoomId: string | null = null;

  return createStore<RTCStore>((set) => ({
    connectionState: 'idle',
    connectedAt: null,
    localStream: null,
    isMicEnabled: true,
    isCamEnabled: true,
    isScreenSharing: false,
    peers: new Map(),
    messages: [],
    lastError: null,

    connect: async (roomId, peerId, displayName, initialAudioEnabled, initialVideoEnabled) => {
      if (client) return;

      client = new RTCClient({ roomId, peerId, displayName, mediaManager });
      currentRoomId = roomId;

      const persisted = loadMessages(roomId);
      if (persisted.length > 0) {
        set({ messages: persisted });
      }

      client.on('connection-state', (state: RTCClientState) => {
        set((s) => ({
          connectionState: state,
          connectedAt: state === 'connected' && s.connectedAt === null ? Date.now() : state === 'connected' ? s.connectedAt : null,
        }));
      });

      client.on('media-acquired', (stream: MediaStream) => {
        set({ localStream: stream });
      });

      client.on('media-changed', (info: MediaToggleState) => {
        set({
          isMicEnabled: info.isMicEnabled,
          isCamEnabled: info.isCamEnabled,
          isScreenSharing: info.isScreenSharing,
        });
      });

      client.on('media-released', () => {
        set({ localStream: null });
      });

      client.on('peer-added', (peerId: string, displayName: string) => {
        set((s) => {
          const next = new Map(s.peers);
          next.set(peerId, {
            displayName,
            stream: null,
            connectionState: 'new',
            audioEnabled: true,
            videoEnabled: true,
          });
          return { peers: next };
        });
      });

      client.on('peer-removed', (peerId: string) => {
        set((s) => {
          const next = new Map(s.peers);
          next.delete(peerId);
          return { peers: next };
        });
      });

      client.on('peer-stream', (peerId: string, stream: MediaStream) => {
        set((s) => ({ peers: updatePeer(s.peers, peerId, (p) => ({ ...p, stream })) }));
      });

      client.on('peer-stream-removed', (peerId: string) => {
        set((s) => ({ peers: updatePeer(s.peers, peerId, (p) => ({ ...p, stream: null })) }));
      });

      client.on('peer-connection-state', (peerId: string, state: RTCPeerConnectionState) => {
        set((s) => ({
          peers: updatePeer(s.peers, peerId, (p) => ({ ...p, connectionState: state })),
        }));
      });

      client.on('peer-media-state', (peerId: string, state: MediaToggleState) => {
        set((s) => ({
          peers: updatePeer(s.peers, peerId, (p) => ({
            ...p,
            audioEnabled: state.isMicEnabled,
            videoEnabled: state.isCamEnabled,
          })),
        }));
      });

      client.on('message', (msg: ChatMessage) => {
        set((s) => {
          if (s.messages.some((m) => m.id === msg.id)) return s;
          const next = [...s.messages, msg];
          if (currentRoomId) persistMessages(currentRoomId, next);
          return { messages: next };
        });
      });

      client.on('error', (error: RTCClientError) => {
        set({ lastError: error });
      });

      await client.connect();

      if (!initialAudioEnabled) client.toggleMic();
      if (!initialVideoEnabled) client.toggleCam();
    },

    disconnect: () => {
      if (client) {
        client.destroy();
        client = null;
      }
      mediaManager.release();
      if (currentRoomId) {
        clearMessages(currentRoomId);
        currentRoomId = null;
      }
      set({
        connectionState: 'idle',
        connectedAt: null,
        localStream: null,
        isMicEnabled: true,
        isCamEnabled: true,
        isScreenSharing: false,
        peers: new Map(),
        messages: [],
        lastError: null,
      });
    },

    toggleMic: () => {
      client?.toggleMic();
    },

    toggleCam: () => {
      client?.toggleCam();
    },

    startScreenShare: async () => {
      await client?.startScreenShare();
    },

    stopScreenShare: async () => {
      await client?.stopScreenShare();
    },

    sendMessage: (text: string) => {
      client?.sendMessage(text);
    },
  }));
}
