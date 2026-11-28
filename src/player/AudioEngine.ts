import Hls, { type HlsConfig } from 'hls.js';
import type { Track, Playlist, StreamResolution } from '../types.ts';
import { scResolveStream, scClearStreamCache, updateDiscordRpc, clearDiscordRpc, onTrayPlayPause, onTrayNextTrack, logFrontendError } from '../ipc.ts';
import { showToast } from '../components/Toast.ts';

declare global {
  interface Window {
    __sc_audio_engine?: AudioEngine;
  }
}

export type RepeatMode = 'off' | 'all' | 'one';

export const DEFAULT_COVER_PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#18181b"/><stop offset="100%" stop-color="#27272a"/></linearGradient></defs><rect width="300" height="300" rx="14" fill="url(#g)"/><path d="M125 195a20 20 0 1 1-20-20c2.7 0 5.2.5 7.5 1.5V110a5 5 0 0 1 3.8-4.9l70-17.5a5 5 0 0 1 6.2 4.9v72.5a20 20 0 1 1-20-20c2.7 0 5.2.5 7.5 1.5v-51.4l-55 13.8V195z" fill="#ffffff" fill-opacity="0.18"/></svg>`
)}`;

export function toHighResArtwork(url?: string | null): string | null {
  if (!url) return null;
  if (url.includes('default_avatar')) return DEFAULT_COVER_PLACEHOLDER;
  return url.replace(/-large\./, '-t500x500.').replace(/-badge\./, '-t500x500.').replace(/-small\./, '-t500x500.');
}

export function getPlaylistCover(pl?: (Partial<Playlist> & { computed_artwork_url?: string | null; calculated_artwork_url?: string | null }) | null): string {
  if (!pl) return DEFAULT_COVER_PLACEHOLDER;
  const directArt = toHighResArtwork(pl.artwork_url);
  if (directArt && directArt !== DEFAULT_COVER_PLACEHOLDER) return directArt;

  const computedArt = toHighResArtwork(pl.computed_artwork_url || pl.calculated_artwork_url);
  if (computedArt && computedArt !== DEFAULT_COVER_PLACEHOLDER) return computedArt;

  if (Array.isArray(pl.tracks) && pl.tracks.length > 0) {
    for (const t of pl.tracks) {
      const trackArt = toHighResArtwork(t?.artwork_url) || toHighResArtwork(t?.user?.avatar_url);
      if (trackArt && trackArt !== DEFAULT_COVER_PLACEHOLDER) return trackArt;
    }
  }

  const userAvatar = toHighResArtwork(pl.user?.avatar_url);
  if (userAvatar && userAvatar !== DEFAULT_COVER_PLACEHOLDER) return userAvatar;

  return DEFAULT_COVER_PLACEHOLDER;
}

type AudioListener = () => void;

export class AudioEngine {
  private static instance: AudioEngine;
  private static trayListenersInitialized = false;

  private audio: HTMLAudioElement;
  private hls: Hls | null = null;

  public currentTrack: Track | null = null;
  public currentCollectionId: number | string | null = null;
  public queue: Track[] = [];
  public originalQueue: Track[] = [];
  public queueIndex: number = -1;

  public isPlaying: boolean = false;
  public currentTime: number = 0;
  public duration: number = 0;
  public volume: number = 0.8;
  public isMuted: boolean = false;

  public shuffle: boolean = false;
  public repeat: RepeatMode = 'off';

  private listeners: Set<AudioListener> = new Set();
  private lastRpcSyncTime: number = 0;
  private startupWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveSkipCount: number = 0;
  private playSeq: number = 0;
  private activeMediaSeq: number = 0;
  private streamRefreshAttemptedSeq: number = 0;

  private constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = null;

    const savedVol = localStorage.getItem('sc_volume');
    if (savedVol !== null) {
      const v = parseFloat(savedVol);
      if (!isNaN(v) && v >= 0 && v <= 1) {
        this.volume = v;
      }
    }
    this.audio.volume = this.volume;
    this.audio.muted = false;

    this.initAudioEvents();
    this.initMediaSession();
    this.initTrayListeners();

    window.__sc_audio_engine = this;
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      if (window.__sc_audio_engine) {
        AudioEngine.instance = window.__sc_audio_engine;
      } else {
        AudioEngine.instance = new AudioEngine();
      }
    }
    return AudioEngine.instance;
  }

  public subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private initAudioEvents(): void {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.syncDiscordRpc();
      this.notify();
    });

    this.audio.addEventListener('playing', () => {
      this.clearStartupWatchdog();
      this.consecutiveSkipCount = 0;
      this.isPlaying = true;
      this.syncDiscordRpc();
      this.notify();
    });

    this.audio.addEventListener('pause', () => {
      this.clearStartupWatchdog();
      this.isPlaying = false;
      this.syncDiscordRpc();
      this.notify();
    });

    this.audio.addEventListener('seeked', () => {
      this.currentTime = this.audio.currentTime;
      this.syncDiscordRpc();
      this.notify();
    });

    let lastVerifiedTrackId: number | null = null;
    this.audio.addEventListener('timeupdate', () => {
      if (this.audio.currentTime > 0.2) {
        this.clearStartupWatchdog();
        this.consecutiveSkipCount = 0;
        if (this.currentTrack && lastVerifiedTrackId !== this.currentTrack.id) {
          lastVerifiedTrackId = this.currentTrack.id;
          logFrontendError('info', `[AudioEngine] Track ${this.currentTrack.id} ("${this.currentTrack.title}") audio playback verified running (currentTime=${this.audio.currentTime.toFixed(2)}s)`).catch(() => {});
        }
      }
      this.currentTime = this.audio.currentTime;
      this.notify();

      const now = Date.now();
      if (now - this.lastRpcSyncTime > 15000) {
        this.syncDiscordRpc();
      }
    });

    this.audio.addEventListener('durationchange', () => {
      if (this.audio.duration && !isNaN(this.audio.duration) && isFinite(this.audio.duration)) {
        this.duration = this.audio.duration;
      }
      this.notify();
    });

    this.audio.addEventListener('ended', () => {
      this.clearStartupWatchdog();
      if (this.repeat === 'off' && this.queueIndex + 1 >= this.queue.length) {
        this.isPlaying = false;
        this.syncDiscordRpc();
      }
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', () => {
      const seq = this.activeMediaSeq;
      if (seq === 0 || seq !== this.playSeq) {
        return;
      }
      const err = this.audio.error;
      const msg = `Audio element error: code=${err?.code}, message=${err?.message}, current src=${this.audio.src}`;
      console.error(msg);
      logFrontendError('error', msg).catch(() => {});
      if (this.currentTrack) {
        if (this.streamRefreshAttemptedSeq !== seq) {
          this.streamRefreshAttemptedSeq = seq;
          this.refreshAndReloadStream(this.currentTrack.id, seq);
          return;
        }
        scClearStreamCache(this.currentTrack.id).catch(() => {});
        this.handlePlaybackFailure(this.currentTrack.id, 'Audio element error', seq);
      }
    });
  }

  private initMediaSession(): void {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.resume());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        this.seek(details.seekTime);
      }
    });
  }

  private initTrayListeners(): void {
    if (AudioEngine.trayListenersInitialized) return;
    AudioEngine.trayListenersInitialized = true;
    onTrayPlayPause(() => this.togglePlay()).catch(() => {});
    onTrayNextTrack(() => this.next()).catch(() => {});
  }

  private clearStartupWatchdog(): void {
    if (this.startupWatchdogTimer !== null) {
      clearTimeout(this.startupWatchdogTimer);
      this.startupWatchdogTimer = null;
    }
  }

  private handlePlaybackFailure(trackId: number, message: string, seq: number): void {
    if (seq !== this.playSeq) {
      return;
    }

    this.clearStartupWatchdog();
    this.activeMediaSeq = 0;
    scClearStreamCache(trackId).catch(() => {});

    if (!this.currentTrack || this.currentTrack.id !== trackId) {
      return;
    }

    console.warn(`Playback failed for track ${trackId}: ${message}`);
    logFrontendError('warn', `Playback failed for track ${trackId}: ${message}`).catch(() => {});

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.audio.pause();
    this.audio.removeAttribute('src');

    const isProxyError =
      message.includes('HTTP 407') ||
      message.includes('Proxy authentication failed') ||
      message.includes('Proxy relay error');
    if (isProxyError) {
      showToast('Proxy connection failed. Check proxy settings.');
      this.isPlaying = false;
      this.consecutiveSkipCount = 0;
      this.notify();
      return;
    }

    const isProtected = message.includes('Protected stream') || message.includes('DRM not supported');
    const isGoPlus = message.toLowerCase().includes('go+');
    const toastMsg = isProtected
      ? 'Protected stream (DRM not supported in WebView2)'
      : isGoPlus
        ? 'SoundCloud Go+ track (subscription required)'
        : 'Track unavailable, skipping...';

    const MAX_AUTO_SKIPS = 2;
    if (this.queue.length > 1 && this.consecutiveSkipCount < MAX_AUTO_SKIPS) {
      if (this.consecutiveSkipCount === 0 || isGoPlus || isProtected) {
        showToast(toastMsg);
      }
      this.consecutiveSkipCount++;

      const nextIndex = this.queueIndex + 1;
      if (nextIndex < this.queue.length) {
        this.queueIndex = nextIndex;
        this.playTrack(this.queue[this.queueIndex], undefined, undefined, this.currentCollectionId ?? undefined, true);
      } else if (this.repeat === 'all') {
        this.queueIndex = 0;
        this.playTrack(this.queue[0], undefined, undefined, this.currentCollectionId ?? undefined, true);
      } else {
        this.isPlaying = false;
        this.consecutiveSkipCount = 0;
        this.notify();
      }
    } else {
      showToast(isProtected ? 'Protected stream (DRM not supported in WebView2)' : isGoPlus ? 'SoundCloud Go+ track (subscription required)' : 'Unable to play tracks from this selection');
      this.isPlaying = false;
      this.consecutiveSkipCount = 0;
      this.notify();
    }
  }

  public async playTrack(
    track: Track,
    newQueue?: Track[],
    index?: number,
    collectionId?: number | string,
    isAutoSkip?: boolean
  ): Promise<void> {
    const seq = ++this.playSeq;
    this.activeMediaSeq = 0;
    this.clearStartupWatchdog();

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.audio.pause();

    if (!isAutoSkip) {
      this.consecutiveSkipCount = 0;
    }

    if (collectionId !== undefined) {
      this.currentCollectionId = collectionId;
    } else if (newQueue) {
      this.currentCollectionId = null;
    }

    if (newQueue && newQueue.length > 0) {
      this.originalQueue = [...newQueue];
      if (this.shuffle) {
        this.queue = this.createShuffledQueue(newQueue, track);
        this.queueIndex = 0;
      } else {
        this.queue = [...newQueue];
        this.queueIndex = index !== undefined && index >= 0 ? index : this.queue.findIndex(t => t.id === track.id);
        if (this.queueIndex < 0) this.queueIndex = 0;
      }
    } else if (this.queue.length === 0) {
      this.queue = [track];
      this.originalQueue = [track];
      this.queueIndex = 0;
    }

    this.currentTrack = track;
    this.currentTime = 0;
    this.duration = track.duration ? track.duration / 1000 : 0;
    this.isPlaying = true;
    this.notify();

    if ('mediaSession' in navigator) {
      const highResArt = toHighResArtwork(track.artwork_url);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.user?.username || 'SoundCloud',
        artwork: highResArt ? [{ src: highResArt, sizes: '500x500', type: 'image/jpeg' }] : [],
      });
    }

    const trackIdToWatch = track.id;
    this.startupWatchdogTimer = setTimeout(() => {
      if (seq === this.playSeq && this.currentTrack?.id === trackIdToWatch && (this.currentTime === 0 || this.audio.readyState < 3)) {
        console.warn(`Startup watchdog timeout (6s) on track ${trackIdToWatch}: readyState=${this.audio.readyState}, currentTime=${this.currentTime}`);
        this.handlePlaybackFailure(trackIdToWatch, 'Startup watchdog timeout (6s)', seq);
      }
    }, 6000);

    try {
      const resolution: StreamResolution = await scResolveStream(track.id);
      if (seq !== this.playSeq) {
        return;
      }
      await this.loadStreamSource(resolution, seq);
      if (seq !== this.playSeq) {
        return;
      }

      const nextIdx = this.queueIndex + 1;
      if (nextIdx < this.queue.length && this.queue[nextIdx]) {
        scResolveStream(this.queue[nextIdx].id).catch(() => {});
      }
    } catch (err: unknown) {
      if (seq !== this.playSeq) {
        return;
      }
      console.error('Failed to resolve stream for track:', track.id, err);
      const errMsg = err instanceof Error ? err.message : String(err || 'Stream resolution failed');
      logFrontendError('warn', `Failed to resolve stream for track ${track.id}: ${errMsg}`).catch(() => {});
      this.handlePlaybackFailure(trackIdToWatch, errMsg, seq);
    }
  }

  public async playCollection(collectionId: number | string, tracks: Track[], startIndex: number = 0): Promise<void> {
    this.consecutiveSkipCount = 0;
    this.currentCollectionId = collectionId;
    if (tracks.length === 0) return;
    const startIdx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    await this.playTrack(tracks[startIdx], tracks, startIdx, collectionId);
  }

  public isCollectionPlaying(collectionId: number | string): boolean {
    return this.currentCollectionId !== null && String(this.currentCollectionId) === String(collectionId) && this.isPlaying;
  }

  public isTrackPlaying(trackId: number): boolean {
    return this.currentTrack?.id === trackId && this.isPlaying;
  }

  private async checkWidevineSupport(): Promise<boolean> {
    if (!('requestMediaKeySystemAccess' in navigator)) {
      return false;
    }
    const config: MediaKeySystemConfiguration[] = [
      {
        initDataTypes: ['cenc'],
        audioCapabilities: [
          { contentType: 'audio/mp4;codecs="mp4a.40.2"' },
          { contentType: 'audio/mp4' },
        ],
      },
    ];
    try {
      await navigator.requestMediaKeySystemAccess('com.widevine.alpha', config);
      return true;
    } catch (e: unknown) {
      console.warn('Widevine EME check rejected:', e);
      return false;
    }
  }

  private async refreshAndReloadStream(trackId: number, seq: number): Promise<void> {
    try {
      await scClearStreamCache(trackId).catch(() => {});
      if (seq !== this.playSeq) return;
      const fresh: StreamResolution = await scResolveStream(trackId);
      if (seq !== this.playSeq) return;
      await this.loadStreamSource(fresh, seq);
    } catch (err: unknown) {
      if (seq !== this.playSeq) return;
      const errMsg = err instanceof Error ? err.message : String(err || 'Stream refresh failed');
      this.handlePlaybackFailure(trackId, errMsg, seq);
    }
  }

  private async loadStreamSource(resolution: StreamResolution, seq: number): Promise<void> {
    if (seq !== this.playSeq) {
      return;
    }

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    const { stream_url: streamUrl, protocol, encrypted, license_url } = resolution;
    let isEmeSupported = false;

    if (encrypted) {
      isEmeSupported = await this.checkWidevineSupport();
      if (seq !== this.playSeq) {
        return;
      }
      logFrontendError('info', `Track ${this.currentTrack?.id} is encrypted. Widevine EME check: supported=${isEmeSupported}, license_url=${license_url || 'none'}`).catch(() => {});
      if (!isEmeSupported) {
        const msg = 'Protected stream (DRM not supported in WebView2)';
        logFrontendError('warn', `Track ${this.currentTrack?.id}: ${msg}`).catch(() => {});
        if (this.currentTrack) {
          this.handlePlaybackFailure(this.currentTrack.id, msg, seq);
        }
        return;
      }
    }

    const isHls = protocol === 'hls' || streamUrl.includes('.m3u8');
    if (isHls && Hls.isSupported()) {
      this.audio.removeAttribute('src');
      const hlsConfig: Partial<HlsConfig> & Record<string, unknown> = {
        enableWorker: true,
        lowLatencyMode: true,
        xhrSetup: (xhr: XMLHttpRequest) => {
          xhr.withCredentials = false;
        },
      };

      if (encrypted && isEmeSupported && license_url) {
        hlsConfig.emeEnabled = true;
        hlsConfig.widevineLicenseUrl = license_url;
        hlsConfig.drmSystems = {
          'com.widevine.alpha': {
            licenseUrl: license_url,
          },
        };
        hlsConfig.requestMediaKeySystemAccessFunc = (keySystem: string, supportedConfigurations: MediaKeySystemConfiguration[]) => {
          logFrontendError('info', `requestMediaKeySystemAccessFunc called for ${keySystem}`).catch(() => {});
          const cleanedConfigs: MediaKeySystemConfiguration[] = supportedConfigurations.map((cfg) => {
            const audioCaps = (cfg.audioCapabilities && cfg.audioCapabilities.length > 0)
              ? cfg.audioCapabilities
              : [
                  { contentType: 'audio/mp4; codecs="mp4a.40.2"' },
                  { contentType: 'audio/mp4' },
                ];
            return {
              initDataTypes: (cfg.initDataTypes && cfg.initDataTypes.length > 0) ? cfg.initDataTypes : ['cenc'],
              audioCapabilities: audioCaps,
            };
          });
          return navigator.requestMediaKeySystemAccess(keySystem, cleanedConfigs);
        };
        hlsConfig.licenseXhrSetup = (xhr: XMLHttpRequest, url: string) => {
          logFrontendError('info', `hls.js licenseXhrSetup: sending license request to ${url}`).catch(() => {});
          xhr.responseType = 'arraybuffer';
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        };
        hlsConfig.licenseResponseCallback = (xhr: XMLHttpRequest, url: string) => {
          const len = xhr.response ? (xhr.response.byteLength ?? 'ok') : 0;
          logFrontendError('info', `hls.js licenseResponseCallback: received license from ${url} (${len} bytes)`).catch(() => {});
          return xhr.response;
        };
      }

      const hls = new Hls(hlsConfig);
      this.hls = hls;
      this.activeMediaSeq = seq;
      let networkRetryCount = 0;
      let mediaRetryCount = 0;
      const MAX_HLS_RETRIES = 2;

      hls.on(Hls.Events.KEY_LOADED, () => {
        if (seq !== this.playSeq) return;
        logFrontendError('info', `HLS decryption key successfully loaded for track ${this.currentTrack?.id}`).catch(() => {});
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (seq !== this.playSeq) return;
        this.audio.play().catch(e => {
          if (seq !== this.playSeq) return;
          const msg = `Audio play() failed on MANIFEST_PARSED: ${e?.message || e}`;
          console.error(msg);
          logFrontendError('error', msg).catch(() => {});
        });
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (seq !== this.playSeq || this.hls !== hls) {
          return;
        }
        const errObj = data as {
          type: string;
          details: string;
          fatal: boolean;
          reason?: string;
          error?: Error;
          context?: { url?: string };
          response?: { code?: number };
        };
        const reason = errObj.reason || errObj.error?.message || 'none';
        const errDesc = `HLS error: type=${data.type}, details=${data.details}, fatal=${data.fatal}, url=${errObj.context?.url || streamUrl}, responseCode=${errObj.response?.code}, reason=${reason}`;
        console.error(errDesc);
        if (data.fatal) {
          logFrontendError('error', errDesc).catch(() => {});
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR: {
              const statusCode = errObj.response?.code;
              if (
                (statusCode === 403 || statusCode === 404 || statusCode === 410) &&
                this.currentTrack &&
                this.streamRefreshAttemptedSeq !== seq
              ) {
                this.streamRefreshAttemptedSeq = seq;
                const trackId = this.currentTrack.id;
                console.warn(`HLS HTTP ${statusCode} for track ${trackId}; clearing stream cache and re-resolving...`);
                hls.destroy();
                this.hls = null;
                void this.refreshAndReloadStream(trackId, seq);
                break;
              }
              if (networkRetryCount < MAX_HLS_RETRIES) {
                networkRetryCount++;
                console.warn(`HLS fatal network error, attempting recovery (attempt ${networkRetryCount}/${MAX_HLS_RETRIES})...`);
                hls.startLoad();
              } else {
                console.error(`HLS fatal network error exceeded max retries (${MAX_HLS_RETRIES}), aborting.`);
                hls.destroy();
                this.hls = null;
                if (this.currentTrack) {
                  this.handlePlaybackFailure(this.currentTrack.id, `HLS fatal network error: ${data.details}`, seq);
                }
              }
              break;
            }
            case Hls.ErrorTypes.MEDIA_ERROR:
              if (mediaRetryCount < MAX_HLS_RETRIES) {
                mediaRetryCount++;
                console.warn(`HLS fatal media error, attempting recovery (attempt ${mediaRetryCount}/${MAX_HLS_RETRIES})...`);
                hls.recoverMediaError();
              } else {
                console.error(`HLS fatal media error exceeded max retries (${MAX_HLS_RETRIES}), aborting.`);
                hls.destroy();
                this.hls = null;
                if (this.currentTrack) {
                  this.handlePlaybackFailure(this.currentTrack.id, `HLS fatal media error: ${data.details}`, seq);
                }
              }
              break;
            default:
              console.error('HLS unrecoverable fatal error:', errDesc);
              hls.destroy();
              this.hls = null;
              if (this.currentTrack) {
                this.handlePlaybackFailure(this.currentTrack.id, `HLS fatal error: ${data.details}`, seq);
              }
              break;
          }
        } else {
          logFrontendError('warn', errDesc).catch(() => {});
        }
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(this.audio);
    } else {
      this.activeMediaSeq = seq;
      this.audio.src = streamUrl;
      this.audio.load();
      this.audio.play().catch(e => {
        if (seq !== this.playSeq) return;
        const msg = `Audio play() failed for progressive stream: ${e?.message || e}`;
        console.error(msg);
        logFrontendError('error', msg).catch(() => {});
      });
    }

    this.syncDiscordRpc();
  }

  public togglePlay(): void {
    this.consecutiveSkipCount = 0;
    if (!this.currentTrack) {
      if (this.queue.length > 0) {
        this.playTrack(this.queue[0]);
      }
      return;
    }

    if (this.isPlaying) {
      this.pause();
    } else {
      this.resume();
    }
  }

  public pause(): void {
    this.clearStartupWatchdog();
    this.audio.pause();
    this.isPlaying = false;
    this.notify();
    this.syncDiscordRpc();
  }

  public resume(): void {
    this.consecutiveSkipCount = 0;
    if (!this.currentTrack && this.queue.length > 0) {
      this.playTrack(this.queue[0]);
      return;
    }
    this.audio.play().catch(e => console.warn('Play prevented:', e));
    this.isPlaying = true;
    this.notify();
    this.syncDiscordRpc();
  }

  public next(): void {
    this.clearStartupWatchdog();
    this.consecutiveSkipCount = 0;
    if (this.queue.length === 0) return;

    if (this.repeat === 'one') {
      this.seek(0);
      this.resume();
      return;
    }

    const nextIndex = this.queueIndex + 1;
    if (nextIndex < this.queue.length) {
      this.queueIndex = nextIndex;
      this.playTrack(this.queue[this.queueIndex], undefined, undefined, this.currentCollectionId ?? undefined);
    } else if (this.repeat === 'all') {
      this.queueIndex = 0;
      this.playTrack(this.queue[0], undefined, undefined, this.currentCollectionId ?? undefined);
    } else {
      this.pause();
      this.seek(0);
    }
  }

  public prev(): void {
    this.clearStartupWatchdog();
    this.consecutiveSkipCount = 0;
    if (this.currentTime > 3) {
      this.seek(0);
      return;
    }

    if (this.queueIndex > 0) {
      this.queueIndex--;
      this.playTrack(this.queue[this.queueIndex], undefined, undefined, this.currentCollectionId ?? undefined);
    } else {
      this.seek(0);
    }
  }

  public seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.duration || 0));
    this.audio.currentTime = clamped;
    this.currentTime = clamped;
    this.notify();
    this.syncDiscordRpc();
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.volume = clamped;
    this.audio.volume = clamped;
    this.isMuted = clamped === 0;
    this.audio.muted = clamped === 0;
    localStorage.setItem('sc_volume', clamped.toString());
    this.notify();
  }

  public toggleShuffle(): void {
    this.shuffle = !this.shuffle;
    if (this.shuffle) {
      if (this.currentTrack) {
        this.queue = this.createShuffledQueue(this.originalQueue, this.currentTrack);
        this.queueIndex = 0;
      }
    } else {
      const curr = this.currentTrack;
      this.queue = [...this.originalQueue];
      this.queueIndex = curr ? this.queue.findIndex(t => t.id === curr.id) : 0;
      if (this.queueIndex < 0) this.queueIndex = 0;
    }
    this.notify();
  }

  private createShuffledQueue(list: Track[], firstTrack: Track): Track[] {
    const others = list.filter(t => t.id !== firstTrack.id);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    return [firstTrack, ...others];
  }

  public cycleRepeat(): void {
    if (this.repeat === 'off') {
      this.repeat = 'all';
    } else if (this.repeat === 'all') {
      this.repeat = 'one';
    } else {
      this.repeat = 'off';
    }
    this.notify();
  }

  private handleTrackEnded(): void {
    if (this.repeat === 'one') {
      this.seek(0);
      this.resume();
    } else {
      this.next();
    }
  }

  public removeFromQueue(index: number): void {
    if (index >= 0 && index < this.queue.length) {
      const removed = this.queue.splice(index, 1)[0];
      const origIdx = this.originalQueue.findIndex(t => t.id === removed.id);
      if (origIdx >= 0) this.originalQueue.splice(origIdx, 1);

      if (index < this.queueIndex) {
        this.queueIndex--;
      } else if (index === this.queueIndex) {
        if (this.queue.length > 0) {
          if (this.queueIndex >= this.queue.length) this.queueIndex = 0;
          this.playTrack(this.queue[this.queueIndex], undefined, undefined, this.currentCollectionId ?? undefined);
        } else {
          this.playSeq++;
          this.activeMediaSeq = 0;
          this.currentTrack = null;
          this.pause();
        }
      }
      this.notify();
    }
  }

  public clearQueue(): void {
    if (this.currentTrack) {
      this.queue = [this.currentTrack];
      this.originalQueue = [this.currentTrack];
      this.queueIndex = 0;
    } else {
      this.queue = [];
      this.originalQueue = [];
      this.queueIndex = -1;
    }
    this.notify();
  }

  private syncDiscordRpc(): void {
    this.lastRpcSyncTime = Date.now();
    if (!this.currentTrack) {
      clearDiscordRpc().catch(() => {});
      return;
    }

    updateDiscordRpc({
      title: this.currentTrack.title,
      artist: this.currentTrack.user?.username || 'SoundCloud',
      cover_url: toHighResArtwork(this.currentTrack.artwork_url),
      track_url: this.currentTrack.permalink_url || null,
      is_playing: this.isPlaying,
      elapsed_sec: Math.floor(this.currentTime),
      duration_sec: Math.floor(this.duration),
    }).catch(() => {});
  }
}
