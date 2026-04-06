import { AUDIO_MAX_BITRATE } from '@/lib/constants'

/**
 * Enhance Opus codec parameters in SDP for voice-optimized audio.
 *
 * Modifies the Opus fmtp line to set:
 * - useinbandfec=1    Forward Error Correction (packet loss recovery without retransmission)
 * - usedtx=1          Discontinuous Transmission (comfort noise during silence, saves bandwidth)
 * - stereo=0          Mono output (voice chat doesn't need stereo)
 * - maxaveragebitrate  Opus-level bitrate cap matching AUDIO_MAX_BITRATE
 * - ptime:20          20ms packetization (standard for voice)
 */
export function enhanceOpusSdp(sdp: string): string {
  // SDP rtpmap format: a=rtpmap:<payload-type> opus/48000/2
  const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/)
  if (!opusMatch) return sdp

  const pt = opusMatch[1]

  const opusParams: Record<string, string> = {
    useinbandfec: '1',
    usedtx: '1',
    stereo: '0',
    'sprop-stereo': '0',
    maxaveragebitrate: String(AUDIO_MAX_BITRATE),
  }

  const fmtpRegex = new RegExp(`a=fmtp:${pt} (.+)`)
  const fmtpMatch = sdp.match(fmtpRegex)

  if (fmtpMatch) {
    const existing = Object.fromEntries(
      fmtpMatch[1].split(';').map(p => {
        const [k, ...v] = p.trim().split('=')
        return [k, v.join('=')]
      }),
    )

    const merged = { ...existing, ...opusParams }
    const paramStr = Object.entries(merged)
      .map(([k, v]) => `${k}=${v}`)
      .join(';')

    sdp = sdp.replace(fmtpRegex, `a=fmtp:${pt} ${paramStr}`)
  } else {
    const paramStr = Object.entries(opusParams)
      .map(([k, v]) => `${k}=${v}`)
      .join(';')

    sdp = sdp.replace(
      `a=rtpmap:${pt} opus/48000/2`,
      `a=rtpmap:${pt} opus/48000/2\r\na=fmtp:${pt} ${paramStr}`,
    )
  }

  // ptime=20ms is the voice standard; add if not already present
  if (!sdp.includes('a=ptime:')) {
    sdp = sdp.replace(
      `a=rtpmap:${pt} opus/48000/2`,
      `a=rtpmap:${pt} opus/48000/2\r\na=ptime:20`,
    )
  }

  return sdp
}
