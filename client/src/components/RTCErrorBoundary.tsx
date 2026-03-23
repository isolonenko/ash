/* eslint-disable react-refresh/only-export-components */
import { Component, useEffect, useRef } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useLastError, rtcStore } from '@/hooks/useRTC';
import type { RTCClientError } from '@/lib/rtc';
import styles from './App.module.sass';

// ── Error UI Helper ─────────────────────────────────────────────
/**
 * Maps RTCClientError to user-friendly message and action buttons.
 */
function getErrorUI(error: RTCClientError): {
  message: string;
  actions: Array<{ label: string; action: 'retry' | 'leave' }>;
} {
  switch (error.type) {
    case 'media-denied':
      return {
        message: 'Camera or microphone access denied. Please check permissions and try again.',
        actions: [
          { label: 'Retry', action: 'retry' },
          { label: 'Leave', action: 'leave' },
        ],
      };
    case 'media-not-found':
      return {
        message: 'No camera or microphone found. Please check your devices.',
        actions: [
          { label: 'Retry', action: 'retry' },
          { label: 'Leave', action: 'leave' },
        ],
      };
    case 'room-full':
      return {
        message: 'This room is full. No more participants can join.',
        actions: [{ label: 'Leave', action: 'leave' }],
      };
    case 'signaling-failed':
      return {
        message: 'Connection to signaling server failed. Check your network and try again.',
        actions: [
          { label: 'Retry', action: 'retry' },
          { label: 'Leave', action: 'leave' },
        ],
      };
    default:
      return {
        message: 'An unexpected error occurred. Please try again.',
        actions: [
          { label: 'Retry', action: 'retry' },
          { label: 'Leave', action: 'leave' },
        ],
      };
  }
}

// ── Error Display Component ─────────────────────────────────────
/**
 * Renders error message and action buttons.
 */
function ErrorDisplay({
  error,
  onRetry,
  onLeave,
}: {
  error: RTCClientError;
  onRetry: () => void;
  onLeave: () => void;
}): ReactNode {
  const ui = getErrorUI(error);

  return (
    <div
      className={styles.roomView}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          color: 'var(--text-primary, #e0e0e0)',
          fontSize: '1rem',
          maxWidth: '500px',
          lineHeight: 1.6,
        }}
      >
        {ui.message}
      </div>
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {ui.actions.map((action) => (
          <button
            key={action.label}
            onClick={action.action === 'retry' ? onRetry : onLeave}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--accent, #00ffff)',
              color: 'var(--bg-primary, #0a0a0f)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              fontFamily: 'monospace',
            }}
          >
            [{action.label.toUpperCase()}]
          </button>
        ))}
      </div>
    </div>
  );
}

// ── RTCErrorWatcher Component ───────────────────────────────────
/**
 * Function component that bridges Zustand store to class component setState.
 * Watches for new RTC errors and calls onRTCError callback when detected.
 */
function RTCErrorWatcher({
  children,
  onRTCError,
}: {
  children: ReactNode;
  onRTCError: (error: RTCClientError) => void;
}): ReactNode {
  const error = useLastError();
  const previousErrorRef = useRef<RTCClientError | null>(null);

  useEffect(() => {
    // Detect transition from null → error (ignore same error)
    if (error && error !== previousErrorRef.current) {
      previousErrorRef.current = error;
      onRTCError(error);
    }
  }, [error, onRTCError]);

  // If error is active, class component will render ErrorDisplay
  // Otherwise, render children normally
  if (error) {
    return null;
  }
  return children;
}

// ── RTCErrorBoundary Component ──────────────────────────────────
/**
 * Error boundary that catches both React render errors and RTC operation errors.
 * Uses getDerivedStateFromError for render errors and RTCErrorWatcher for RTC errors.
 */
interface RTCErrorBoundaryProps {
  children: ReactNode;
  onLeave: () => void;
  roomId: string;
  peerId: string;
  displayName: string;
  initialAudioEnabled: boolean;
  initialVideoEnabled: boolean;
}

interface RTCErrorBoundaryState {
  error: RTCClientError | null;
}

export class RTCErrorBoundary extends Component<RTCErrorBoundaryProps, RTCErrorBoundaryState> {
  constructor(props: RTCErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): RTCErrorBoundaryState {
    // Convert any render error to RTCClientError
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return {
      error: {
        type: 'unknown',
        message,
      },
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details for debugging
    console.error('RTCErrorBoundary caught error:', error);
    console.error('Error info:', errorInfo);
  }

  handleRetry = (): void => {
    // Reset error state and attempt reconnection
    this.setState({ error: null });

    // Disconnect and reconnect with same parameters
    const { roomId, peerId, displayName, initialAudioEnabled, initialVideoEnabled } = this.props;
    rtcStore.getState().disconnect();
    rtcStore.getState().connect(roomId, peerId, displayName, initialAudioEnabled, initialVideoEnabled);
  };

  handleLeave = (): void => {
    // Reset error state and exit room
    this.setState({ error: null });
    rtcStore.getState().disconnect();
    this.props.onLeave();
  };

  handleRTCError = (error: RTCClientError): void => {
    // Callback from RTCErrorWatcher when new error detected
    this.setState({ error });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children } = this.props;

    if (error) {
      return <ErrorDisplay error={error} onRetry={this.handleRetry} onLeave={this.handleLeave} />;
    }

    // Wrap children with RTCErrorWatcher to detect RTC errors
    return <RTCErrorWatcher onRTCError={this.handleRTCError}>{children}</RTCErrorWatcher>;
  }
}
