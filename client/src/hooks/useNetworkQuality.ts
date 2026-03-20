import { useState, useEffect } from "react";
import type { NetworkTier } from "@/types";

interface NetworkConnection extends EventTarget {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

function getConnection(): NetworkConnection | null {
  const nav = navigator as unknown as { connection?: NetworkConnection };
  return nav.connection ?? null;
}

function classifyNetwork(conn: NetworkConnection | null): NetworkTier {
  if (!conn) return "high"; // Can't detect — assume good

  if (conn.saveData) return "low";

  switch (conn.effectiveType) {
    case "slow-2g":
    case "2g":
      return "low";
    case "3g":
      return "medium";
    case "4g":
    default:
      return conn.downlink < 2 ? "medium" : "high";
  }
}

export function useNetworkQuality(): NetworkTier {
  const [tier, setTier] = useState<NetworkTier>(() =>
    classifyNetwork(getConnection()),
  );

  useEffect(() => {
    const conn = getConnection();
    if (!conn) return;

    const handler = () => setTier(classifyNetwork(conn));
    conn.addEventListener("change", handler);
    return () => conn.removeEventListener("change", handler);
  }, []);

  return tier;
}
