import { useEffect, useRef } from "react";
import type { PeerState } from "@/types";
import {
  STATS_POLL_INTERVAL,
  BITRATE_RAMP_DOWN,
  BITRATE_RAMP_UP,
  PACKET_LOSS_THRESHOLD,
  JITTER_THRESHOLD,
  RTT_THRESHOLD,
  VIDEO_MAX_BITRATE,
} from "@/lib/constants";

interface StatsSnapshot {
  packetsLost: number;
  packetsReceived: number;
  jitter: number;
  rtt: number;
  timestamp: number;
}

const SMOOTHING_WINDOW = 5;

export function useAdaptiveBitrate(
  peers: Map<string, PeerState>,
  active: boolean,
): void {
  const previousStats = useRef<Map<string, StatsSnapshot>>(new Map());
  const lossHistory = useRef<number[]>([]);

  useEffect(() => {
    if (!active || peers.size === 0) return;
    const prevStats = previousStats.current;

    const interval = setInterval(async () => {
      for (const [peerId, peer] of peers) {
        const pc = peer.connection;
        if (pc.connectionState !== "connected") continue;

        try {
          const stats = await pc.getStats();
          let packetsLost = 0;
          let packetsReceived = 0;
          let jitter = 0;
          let rtt = 0;

          stats.forEach((report) => {
            if (
              report.type === "remote-inbound-rtp" &&
              report.kind === "video"
            ) {
              packetsLost = report.packetsLost ?? 0;
              jitter = report.jitter ?? 0;
              rtt = report.roundTripTime ?? 0;
            }
            if (report.type === "inbound-rtp" && report.kind === "video") {
              packetsReceived = report.packetsReceived ?? 0;
            }
            if (
              report.type === "candidate-pair" &&
              report.state === "succeeded" &&
              report.currentRoundTripTime
            ) {
              rtt = report.currentRoundTripTime;
            }
          });

          const prev = prevStats.get(peerId);
          const now: StatsSnapshot = {
            packetsLost,
            packetsReceived,
            jitter,
            rtt,
            timestamp: Date.now(),
          };
          prevStats.set(peerId, now);

          if (!prev) continue;

          // Calculate delta packet loss
          const lostDelta = packetsLost - prev.packetsLost;
          const receivedDelta = packetsReceived - prev.packetsReceived;
          const totalDelta = lostDelta + receivedDelta;
          const lossRate = totalDelta > 0 ? lostDelta / totalDelta : 0;

          // Smoothing
          lossHistory.current.push(lossRate);
          if (lossHistory.current.length > SMOOTHING_WINDOW) {
            lossHistory.current.shift();
          }
          const avgLoss =
            lossHistory.current.reduce((a, b) => a + b, 0) /
            lossHistory.current.length;

          // Decision
          const congested =
            avgLoss > PACKET_LOSS_THRESHOLD ||
            jitter > JITTER_THRESHOLD ||
            rtt > RTT_THRESHOLD;

          // Adjust video senders
          const videoSenders = pc
            .getSenders()
            .filter((s) => s.track?.kind === "video");

          for (const sender of videoSenders) {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) continue;

            const current = params.encodings[0].maxBitrate ?? VIDEO_MAX_BITRATE;

            if (congested) {
              const newBitrate = Math.max(
                current * BITRATE_RAMP_DOWN,
                100_000, // Floor at 100kbps
              );
              params.encodings[0].maxBitrate = Math.round(newBitrate);
            } else if (current < VIDEO_MAX_BITRATE) {
              const newBitrate = Math.min(
                current * BITRATE_RAMP_UP,
                VIDEO_MAX_BITRATE,
              );
              params.encodings[0].maxBitrate = Math.round(newBitrate);
            }

            sender.setParameters(params).catch(() => {});
          }
        } catch {
          // getStats can fail if connection is closing
        }
      }
    }, STATS_POLL_INTERVAL);

    return () => {
      clearInterval(interval);
      prevStats.clear();
      lossHistory.current = [];
    };
  }, [peers, active]);
}
