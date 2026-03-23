import type { MediaManagerEvents, RTCClientError } from './types';
import { TypedEventEmitter } from './event-emitter';
import { getNetworkTier, onNetworkTierChange } from './network-quality';
import { BITRATE_TIERS } from '@/lib/constants';

export class MediaManager extends TypedEventEmitter<MediaManagerEvents> {
  private _stream: MediaStream | null = null;
  private _isMicEnabled = true;
  private _isCamEnabled = true;
  private _devices: { audio: MediaDeviceInfo[], video: MediaDeviceInfo[] } = { audio: [], video: [] };
  private _selectedAudioId: string | null = null;
  private _selectedVideoId: string | null = null;
  private _hasPermission = false;
  private _onTrackReplaced: ((kind: string, track: MediaStreamTrack) => void) | null = null;
  private connectionId = 0;
  private unsubNetworkChange: (() => void) | null = null;
  private beforeUnloadHandler: (() => void) | null = null;
  private deviceChangeHandler: (() => void) | null = null;

  get stream(): MediaStream | null {
    return this._stream;
  }

  get isMicEnabled(): boolean {
    return this._isMicEnabled;
  }

  get isCamEnabled(): boolean {
    return this._isCamEnabled;
  }

  get devices(): { audio: readonly MediaDeviceInfo[], video: readonly MediaDeviceInfo[] } {
    return this._devices;
  }

  get selectedAudioId(): string | null {
    return this._selectedAudioId;
  }

  get selectedVideoId(): string | null {
    return this._selectedVideoId;
  }

  get hasPermission(): boolean {
    return this._hasPermission;
  }

  set onTrackReplaced(cb: ((kind: string, track: MediaStreamTrack) => void) | null) {
    this._onTrackReplaced = cb;
  }

  async enumerate(): Promise<void> {
    const allDevices = await navigator.mediaDevices.enumerateDevices();

    this._devices = {
      audio: allDevices.filter(d => d.kind === 'audioinput'),
      video: allDevices.filter(d => d.kind === 'videoinput'),
    };

    this._hasPermission = allDevices.some(d => d.label !== '');

    this.emit('devices-changed', this._devices);

    if (!this.deviceChangeHandler) {
      this.deviceChangeHandler = () => {
        void this.handleDeviceChange();
      };
      navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeHandler);
    }
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
    if (this.deviceChangeHandler) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
      this.deviceChangeHandler = null;
    }
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

  private async handleDeviceChange(): Promise<void> {
    const previousAudioIds = new Set(this._devices.audio.map(d => d.deviceId));
    const previousVideoIds = new Set(this._devices.video.map(d => d.deviceId));

    await this.enumerate();

    if (this._stream) {
      const currentAudioTrack = this._stream.getAudioTracks()[0];
      const currentVideoTrack = this._stream.getVideoTracks()[0];

      if (currentAudioTrack) {
        const audioSettings = currentAudioTrack.getSettings();
        const currentAudioDeviceId = audioSettings.deviceId;
        const audioStillExists = this._devices.audio.some(d => d.deviceId === currentAudioDeviceId);

        if (!audioStillExists && previousAudioIds.has(currentAudioDeviceId!)) {
          const fallback = this._devices.audio[0];
          if (fallback) {
            await this.switchDevice('audio', fallback.deviceId);
          } else {
            currentAudioTrack.enabled = false;
            this._isMicEnabled = false;
            this.emit('changed', { isMicEnabled: this._isMicEnabled, isCamEnabled: this._isCamEnabled });
          }
        }
      }

      if (currentVideoTrack) {
        const videoSettings = currentVideoTrack.getSettings();
        const currentVideoDeviceId = videoSettings.deviceId;
        const videoStillExists = this._devices.video.some(d => d.deviceId === currentVideoDeviceId);

        if (!videoStillExists && previousVideoIds.has(currentVideoDeviceId!)) {
          const fallback = this._devices.video[0];
          if (fallback) {
            await this.switchDevice('video', fallback.deviceId);
          } else {
            currentVideoTrack.enabled = false;
            this._isCamEnabled = false;
            this.emit('changed', { isMicEnabled: this._isMicEnabled, isCamEnabled: this._isCamEnabled });
          }
        }
      }
    }
  }
}
