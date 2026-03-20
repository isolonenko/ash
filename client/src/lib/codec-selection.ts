const CODEC_PRIORITY = ["video/VP9", "video/H264", "video/VP8"] as const;

// "webrtc" is a valid MediaEncodingType per W3C spec but not yet in TypeScript DOM lib
const WEBRTC_ENCODING_TYPE = "webrtc" as MediaEncodingType;

interface CodecResult {
  mimeType: string;
  powerEfficient: boolean;
}

let cachedResult: CodecResult | null = null;

function buildEncodingConfig(codec: string): MediaEncodingConfiguration {
  return {
    type: WEBRTC_ENCODING_TYPE,
    video: {
      contentType: codec,
      width: 1280,
      height: 720,
      bitrate: 2_500_000,
      framerate: 30,
    },
  };
}

export async function selectOptimalCodec(): Promise<CodecResult> {
  if (cachedResult) return cachedResult;

  if (!navigator.mediaCapabilities) {
    cachedResult = { mimeType: "video/VP9", powerEfficient: false };
    return cachedResult;
  }

  for (const codec of CODEC_PRIORITY) {
    try {
      const result = await navigator.mediaCapabilities.encodingInfo(
        buildEncodingConfig(codec),
      );

      if (result.supported && result.powerEfficient) {
        cachedResult = { mimeType: codec, powerEfficient: true };
        return cachedResult;
      }
    } catch {
      // Codec check not supported for this type
    }
  }

  for (const codec of CODEC_PRIORITY) {
    try {
      const result = await navigator.mediaCapabilities.encodingInfo(
        buildEncodingConfig(codec),
      );

      if (result.supported) {
        cachedResult = { mimeType: codec, powerEfficient: false };
        return cachedResult;
      }
    } catch {
      continue;
    }
  }

  cachedResult = { mimeType: "video/VP9", powerEfficient: false };
  return cachedResult;
}

export function applyCodecPreference(
  pc: RTCPeerConnection,
  sender: RTCRtpSender,
  preferredMimeType: string,
): void {
  const transceiver = pc.getTransceivers().find((t) => t.sender === sender);
  if (!transceiver || typeof transceiver.setCodecPreferences !== "function")
    return;

  const capabilities = RTCRtpReceiver.getCapabilities("video");
  if (!capabilities) return;

  const preferred = capabilities.codecs.filter(
    (c) => c.mimeType.toLowerCase() === preferredMimeType.toLowerCase(),
  );
  const rest = capabilities.codecs.filter(
    (c) => c.mimeType.toLowerCase() !== preferredMimeType.toLowerCase(),
  );

  if (preferred.length > 0) {
    transceiver.setCodecPreferences([...preferred, ...rest]);
  }
}
