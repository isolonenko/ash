import type { NetworkTier } from '@/types';

interface NetworkConnection extends EventTarget {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

function getConnection(): NetworkConnection | null {
  const nav = navigator as unknown as { connection?: NetworkConnection };
  return nav.connection ?? null;
}

function classifyNetwork(conn: NetworkConnection | null): NetworkTier {
  if (!conn) return 'high'; // Can't detect — assume good

  if (conn.saveData) return 'low';

  switch (conn.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 'low';
    case '3g':
      return 'medium';
    case '4g':
    default:
      return conn.downlink < 1.5 ? 'medium' : 'high';
  }
}

/** Get current network tier. Pure function, no React dependency. */
export function getNetworkTier(): NetworkTier {
  return classifyNetwork(getConnection());
}

/**
 * Subscribe to network tier changes.
 * Returns unsubscribe function. No-ops if Network Information API is unavailable.
 */
export function onNetworkTierChange(callback: (tier: NetworkTier) => void): () => void {
  const conn = getConnection();
  if (!conn) return () => {};

  const handler = () => callback(classifyNetwork(conn));
  conn.addEventListener('change', handler);
  return () => conn.removeEventListener('change', handler);
}
