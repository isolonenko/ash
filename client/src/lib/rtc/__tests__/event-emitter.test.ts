import { describe, it, expect, vi } from 'vitest';
import { TypedEventEmitter } from '../event-emitter';

interface TestEvents {
  'hello': (name: string) => void;
  'count': (n: number) => void;
  'empty': () => void;
}

describe('TypedEventEmitter', () => {
  it('calls handler when event is emitted', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler = vi.fn();

    emitter.on('hello', handler);
    emitter.emit('hello', 'world');

    expect(handler).toHaveBeenCalledWith('world');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports multiple handlers for the same event', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('hello', handler1);
    emitter.on('hello', handler2);
    emitter.emit('hello', 'test');

    expect(handler1).toHaveBeenCalledWith('test');
    expect(handler2).toHaveBeenCalledWith('test');
  });

  it('returns unsubscribe function from on()', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler = vi.fn();

    const unsub = emitter.on('hello', handler);
    emitter.emit('hello', 'first');
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    emitter.emit('hello', 'second');
    expect(handler).toHaveBeenCalledTimes(1); // not called again
  });

  it('does not affect other handlers when one unsubscribes', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const unsub1 = emitter.on('hello', handler1);
    emitter.on('hello', handler2);

    unsub1();
    emitter.emit('hello', 'after-unsub');

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledWith('after-unsub');
  });

  it('handles events with no handlers gracefully', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    // Should not throw
    emitter.emit('hello', 'nobody listening');
  });

  it('supports events with no arguments', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler = vi.fn();

    emitter.on('empty', handler);
    emitter.emit('empty');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removeAllListeners clears all handlers for all events', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();

    emitter.on('hello', h1);
    emitter.on('count', h2);

    emitter.removeAllListeners();

    emitter.emit('hello', 'gone');
    emitter.emit('count', 42);

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('double unsubscribe does not throw', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler = vi.fn();

    const unsub = emitter.on('hello', handler);
    unsub();
    unsub(); // second call should be safe
  });
});
