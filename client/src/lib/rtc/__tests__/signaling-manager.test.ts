import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalingManager } from '../signaling-manager';

// Mock createSignalingClient
const mockClient = {
  connect: vi.fn(),
  send: vi.fn(),
  disconnect: vi.fn(),
  isConnected: vi.fn(() => false),
};

vi.mock('@/lib/signaling', () => ({
  createSignalingClient: vi.fn((options: Record<string, unknown>) => {
    // Store the callbacks so tests can invoke them
    (mockClient as Record<string, unknown>)._options = options;
    return mockClient;
  }),
}));

describe('SignalingManager', () => {
  let manager: SignalingManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SignalingManager('peer-1', 'Alice');
  });

  it('creates signaling client with correct peerId and displayName', async () => {
    const { createSignalingClient } = await import('@/lib/signaling');
    expect(createSignalingClient).toHaveBeenCalledWith(
      expect.objectContaining({
        peerId: 'peer-1',
        displayName: 'Alice',
      }),
    );
  });

  it('connect delegates to underlying client', () => {
    manager.connect('room-123');
    expect(mockClient.connect).toHaveBeenCalledWith('room-123');
  });

  it('send delegates to underlying client', () => {
    const msg = { type: 'sdp-offer' as const, roomId: 'room-123', peerId: 'peer-1', payload: {} };
    manager.send(msg, 'peer-2');
    expect(mockClient.send).toHaveBeenCalledWith(msg, 'peer-2');
  });

  it('disconnect delegates to underlying client', () => {
    manager.disconnect();
    expect(mockClient.disconnect).toHaveBeenCalled();
  });

  it('emits message event when signaling client receives message', () => {
    const handler = vi.fn();
    manager.on('message', handler);

    // Simulate the client receiving a message
    const options = (mockClient as Record<string, unknown>)._options as Record<string, (msg: unknown) => void>;
    const testMsg = { type: 'peer-joined', roomId: 'room-123', peerId: 'peer-2' };
    options.onMessage(testMsg);

    expect(handler).toHaveBeenCalledWith(testMsg);
  });

  it('emits connection-change event', () => {
    const handler = vi.fn();
    manager.on('connection-change', handler);

    const options = (mockClient as Record<string, unknown>)._options as Record<string, (val: boolean) => void>;
    options.onConnectionChange(true);

    expect(handler).toHaveBeenCalledWith(true);
  });

  it('emits error event for room-full', () => {
    const handler = vi.fn();
    manager.on('error', handler);

    const options = (mockClient as Record<string, unknown>)._options as Record<string, (err: string) => void>;
    options.onError('room-full');

    expect(handler).toHaveBeenCalledWith('room-full');
  });

  it('emits reconnected event', () => {
    const handler = vi.fn();
    manager.on('reconnected', handler);

    const options = (mockClient as Record<string, unknown>)._options as Record<string, () => void>;
    options.onReconnected();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('cleans up listeners on destroy', () => {
    const handler = vi.fn();
    manager.on('message', handler);
    manager.destroy();

    expect(mockClient.disconnect).toHaveBeenCalled();

    // After destroy, emitting should not call handler
    // (removeAllListeners was called internally)
    const options = (mockClient as Record<string, unknown>)._options as Record<string, (msg: unknown) => void>;
    const testMsg = { type: 'peer-joined', roomId: 'room-123', peerId: 'peer-3' };
    options.onMessage(testMsg);

    expect(handler).not.toHaveBeenCalled();
  });
});
