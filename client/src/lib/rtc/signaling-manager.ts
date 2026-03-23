import type { SignalingMessage } from '@/types';
import type { SignalingManagerEvents } from './types';
import { TypedEventEmitter } from './event-emitter';
import { createSignalingClient } from '@/lib/signaling';

export class SignalingManager extends TypedEventEmitter<SignalingManagerEvents> {
  private client: ReturnType<typeof createSignalingClient>;

  constructor(peerId: string, displayName: string) {
    super();

    this.client = createSignalingClient({
      peerId,
      displayName,
      onMessage: (msg: SignalingMessage) => {
        this.emit('message', msg);
      },
      onConnectionChange: (connected: boolean) => {
        this.emit('connection-change', connected);
      },
      onError: (error: 'room-full' | 'unknown') => {
        this.emit('error', error);
      },
      onReconnected: () => {
        this.emit('reconnected');
      },
    });
  }

  connect(roomId: string): void {
    this.client.connect(roomId);
  }

  send(msg: SignalingMessage, targetPeerId?: string): void {
    this.client.send(msg, targetPeerId);
  }

  disconnect(): void {
    this.client.disconnect();
  }

  destroy(): void {
    this.disconnect();
    this.removeAllListeners();
  }
}
