import type { MediaManagerEvents, RTCClientError } from './types';
import { TypedEventEmitter } from './event-emitter';
import { getNetworkTier, onNetworkTierChange } from './network-quality';
import { BITRATE_TIERS } from '@/lib/constants';

export class MediaManager extends TypedEventEmitter<MediaManagerEvents> {
  private _stream: MediaStream | null = null;
  private _isMicEnabled = true;
  private _isCamEnabled = true;
  private connectionId = 0;
  private unsubNetworkChange: (() => void) | null = null;
  private beforeUnloadHandler: (() => void) | null = null;

  get stream(): MediaStream | null {
    return this._stream;
  }

  get isMicEnabled(): boolean {
    return this._isMicEnabled;
  }

  get isCamEnabled(): boolean {
    return this._isCamEnabled;
  }

  async acquire(): Promise<MediaStream> {
    const capturedId = ++this.connectionId;
    const tier = BITRATE_TIERS[getNetworkTier()];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: tier.width },
          height: { ideal: tier.height },
          frameRate: { ideal: tier.fps },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (this.connectionId !== capturedId) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error('Stale acquire call');
      }

      this._stream = stream;
      this._isMicEnabled = true;
      this._isCamEnabled = true;

      this.setupBeforeUnload();

      this.unsubNetworkChange?.();
      this.unsubNetworkChange = onNetworkTierChange((newTier) => {
        this.applyNetworkConstraints(newTier);
      });

      this.emit('acquired', stream);
      return stream;
    } catch (err) {
      if (this.connectionId !== capturedId) {
        throw new Error('Stale acquire call');
      }

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          const error: RTCClientError = {
            type: 'media-denied',
            message: 'Camera/mic access denied. Check browser permissions.',
          };
          this.emit('error', error);
          throw err;
        }
        if (err.name === 'NotFoundError') {
          const error: RTCClientError = {
            type: 'media-not-found',
            message: 'No camera or microphone found.',
          };
          this.emit('error', error);
          throw err;
        }
      }

      throw err;
    }
  }

  toggleMic(): void {
    if (!this._stream) return;

    const audioTrack = this._stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const newEnabled = !audioTrack.enabled;
    audioTrack.enabled = newEnabled;
    this._isMicEnabled = newEnabled;
    this.emit('changed', { isMicEnabled: this._isMicEnabled, isCamEnabled: this._isCamEnabled });
  }

  toggleCam(): void {
    if (!this._stream) return;

    const videoTrack = this._stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const newEnabled = !videoTrack.enabled;
    videoTrack.enabled = newEnabled;
    this._isCamEnabled = newEnabled;
    this.emit('changed', { isMicEnabled: this._isMicEnabled, isCamEnabled: this._isCamEnabled });
  }

  getLocalTracks(): { tracks: MediaStreamTrack[]; stream: MediaStream } | null {
    if (!this._stream) return null;
    return { tracks: this._stream.getTracks(), stream: this._stream };
  }

  release(): void {
    if (!this._stream) return;

    this._stream.getTracks().forEach(t => t.stop());
    this._stream = null;
    this._isMicEnabled = true;
    this._isCamEnabled = true;
    this.emit('released');
  }

  destroy(): void {
    this.release();
    this.unsubNetworkChange?.();
    this.unsubNetworkChange = null;
    this.removeBeforeUnload();
    this.removeAllListeners();
  }

  private setupBeforeUnload(): void {
    this.removeBeforeUnload();
    this.beforeUnloadHandler = () => {
      this._stream?.getTracks().forEach(t => t.stop());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }
  }

  private removeBeforeUnload(): void {
    if (this.beforeUnloadHandler) {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      }
      this.beforeUnloadHandler = null;
    }
  }

  private applyNetworkConstraints(tier: import('@/types').NetworkTier): void {
    if (!this._stream) return;

    const videoTrack = this._stream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') return;

    const config = BITRATE_TIERS[tier];
    videoTrack.applyConstraints({
      width: { ideal: config.width },
      height: { ideal: config.height },
      frameRate: { ideal: config.fps },
    }).catch(() => {});
  }
}
