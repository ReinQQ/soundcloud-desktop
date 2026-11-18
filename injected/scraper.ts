import { TrackMetadata } from './types';
import { clearDiscordPresence, sendTrackToDiscord } from './ipc';

export class Scraper {
  private lastSentTrack: TrackMetadata | null = null;
  private observer: MutationObserver | null = null;
  private observedPlayer: HTMLElement | null = null;
  private attachObserverRetryTimer: number | null = null;
  private syncTimer: number | null = null;
  private immediateDebounceTimer: number | null = null;
  private lastSentTime: number = 0;
  private isEnabled: boolean = true;

  constructor(initialEnabled: boolean) {
    this.setEnabled(initialEnabled);
    this.registerGlobalControls();
    this.initAudioListeners();
    this.initObserver();
    this.startInterval();
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!this.isEnabled) {
      this.lastSentTrack = null;
      clearDiscordPresence().catch(() => {});
    } else {
      this.triggerImmediate();
    }
  }

  private registerGlobalControls(): void {
    (window as any).__sc_toggle_playback = () => {
      const player = document.querySelector<HTMLElement>('.playControls');
      const playBtn = player?.querySelector<HTMLButtonElement>(
        '.playControls__play, button.playControl'
      );
      if (playBtn) {
        playBtn.click();
      }
    };

    (window as any).__sc_next_track = () => {
      const player = document.querySelector<HTMLElement>('.playControls');
      const nextBtn = player?.querySelector<HTMLButtonElement>(
        '.skipControl__next, button.skipControl__next'
      );
      if (nextBtn) {
        nextBtn.click();
      }
    };
  }

  private initAudioListeners(): void {
    const handleAudioEvent = () => {
      this.triggerImmediate();
    };

    // Capture phase listeners catch all <audio> events immediately anywhere in the DOM
    document.addEventListener('play', handleAudioEvent, true);
    document.addEventListener('pause', handleAudioEvent, true);
    document.addEventListener('seeked', handleAudioEvent, true);
    document.addEventListener('loadedmetadata', handleAudioEvent, true);
    document.addEventListener('ended', handleAudioEvent, true);
  }

  private initObserver(): void {
    const tryAttach = () => {
      const player = document.querySelector<HTMLElement>('.playControls');
      if (!player) {
        if (this.attachObserverRetryTimer === null) {
          this.attachObserverRetryTimer = window.setInterval(() => {
            const el = document.querySelector<HTMLElement>('.playControls');
            if (el) {
              if (this.attachObserverRetryTimer !== null) {
                window.clearInterval(this.attachObserverRetryTimer);
                this.attachObserverRetryTimer = null;
              }
              this.observePlayer(el);
            }
          }, 500);
        }
        return;
      }

      if (this.attachObserverRetryTimer !== null) {
        window.clearInterval(this.attachObserverRetryTimer);
        this.attachObserverRetryTimer = null;
      }
      this.observePlayer(player);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAttach);
    } else {
      tryAttach();
    }
  }

  private observePlayer(player: HTMLElement): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observedPlayer = player;

    this.observer = new MutationObserver((mutations) => {
      let relevantMutation = false;
      for (const m of mutations) {
        if (
          m.type === 'childList' ||
          (m.type === 'attributes' &&
            (m.attributeName === 'class' ||
              m.attributeName === 'title' ||
              m.attributeName === 'aria-label' ||
              m.attributeName === 'href'))
        ) {
          relevantMutation = true;
          break;
        }
      }

      if (relevantMutation) {
        this.triggerImmediate();
      }
    });

    this.observer.observe(player, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'class',
        'style',
        'title',
        'aria-label',
        'aria-valuenow',
        'aria-valuemax',
        'href',
      ],
    });

    this.triggerImmediate();
  }

  private startInterval(): void {
    if (this.syncTimer) {
      window.clearInterval(this.syncTimer);
    }
    // Lightweight 2000ms safety poll alongside MutationObserver
    this.syncTimer = window.setInterval(() => {
      const player = document.querySelector<HTMLElement>('.playControls');
      if (player && (!this.observedPlayer || !this.observedPlayer.isConnected || this.observedPlayer !== player)) {
        this.observePlayer(player);
      }
      this.syncNow(false);
    }, 2000);
  }

  /**
   * Fast debounce (<50ms) to coalesce synchronous DOM mutations into a single immediate IPC call.
   */
  public triggerImmediate(): void {
    if (!this.isEnabled) return;

    if (this.immediateDebounceTimer) {
      window.clearTimeout(this.immediateDebounceTimer);
    }

    this.immediateDebounceTimer = window.setTimeout(() => {
      this.immediateDebounceTimer = null;
      this.syncNow(true);
    }, 40);
  }

  public syncNow(forceOrImmediate: boolean = false): void {
    if (!this.isEnabled) return;

    const track = this.scrapeCurrentTrack();

    if (!track || !track.title) {
      if (this.lastSentTrack !== null) {
        this.lastSentTrack = null;
        clearDiscordPresence().catch(() => {});
      }
      return;
    }

    // Check if track identity or play state changed
    const identityOrStateChanged =
      !this.lastSentTrack ||
      track.title !== this.lastSentTrack.title ||
      track.artist !== this.lastSentTrack.artist ||
      track.is_playing !== this.lastSentTrack.is_playing ||
      track.cover_url !== this.lastSentTrack.cover_url ||
      track.track_url !== this.lastSentTrack.track_url;

    if (identityOrStateChanged) {
      // Immediate track switch or play/pause toggle: NEVER throttle!
      this.lastSentTrack = { ...track };
      this.lastSentTime = Date.now();
      sendTrackToDiscord(track).catch((err) => {
        console.warn('[SC-Desktop] Error updating Discord RPC:', err);
      });
      return;
    }

    // Routine timestamp sync:
    // Discord interpolates progress bar based on start and end timestamps.
    // Only send timestamp adjustments if forced (e.g. user seeked) or drift >= 4s after 4.5s.
    const now = Date.now();
    const timeSinceLastSend = now - this.lastSentTime;
    const elapsedDrift = Math.abs(track.elapsed_sec - this.lastSentTrack.elapsed_sec);

    if (
      (forceOrImmediate && elapsedDrift >= 2) ||
      (timeSinceLastSend >= 4500 && elapsedDrift >= 4)
    ) {
      this.lastSentTrack = { ...track };
      this.lastSentTime = now;
      sendTrackToDiscord(track).catch((err) => {
        console.warn('[SC-Desktop] Error updating Discord RPC:', err);
      });
    }
  }

  private scrapeCurrentTrack(): TrackMetadata | null {
    // Strictly scope all queries inside the bottom player bar
    const player = document.querySelector<HTMLElement>('.playControls');
    if (!player) return null;

    // 1. Title: read title attribute or text fallback, stripping "Current track:" screen-reader prefixes
    const titleLink = player.querySelector<HTMLAnchorElement>('.playbackSoundBadge__titleLink');
    if (!titleLink) return null;

    let rawTitle =
      titleLink.getAttribute('title') ||
      titleLink.querySelector('span[aria-hidden="true"]')?.textContent ||
      titleLink.textContent ||
      '';

    let title = rawTitle.replace(/^current\s*track:?\s*/i, '').trim();
    if (!title) return null;

    // 2. Artist: read title attribute or textContent from .playbackSoundBadge__lightLink
    const artistLink = player.querySelector<HTMLElement>('.playbackSoundBadge__lightLink');
    let artist = (
      artistLink?.getAttribute('title') ||
      artistLink?.textContent ||
      'SoundCloud'
    ).trim();

    // 3. Play state: check .playControls__play contains class 'playing' or aria-label
    const playBtn = player.querySelector<HTMLElement>(
      '.playControls__play, button.playControl'
    );
    const is_playing = playBtn
      ? playBtn.classList.contains('playing') ||
        playBtn.getAttribute('aria-label')?.toLowerCase().includes('pause') === true
      : false;

    // 4. Timestamps: read aria-valuenow and aria-valuemax from .playbackTimeline__progressWrapper
    const progressWrapper = player.querySelector<HTMLElement>(
      '.playbackTimeline__progressWrapper'
    );
    const elapsed_sec = Math.floor(
      parseFloat(progressWrapper?.getAttribute('aria-valuenow') || '0')
    );
    const duration_sec = Math.floor(
      parseFloat(progressWrapper?.getAttribute('aria-valuemax') || '0')
    );

    // 5. Cover URL: inspect all span elements inside .playbackSoundBadge__avatar
    let cover_url: string | null = null;
    const avatarSpans = player.querySelectorAll<HTMLElement>(
      '.playbackSoundBadge__avatar span, .playbackSoundBadge__avatar div'
    );
    for (const el of Array.from(avatarSpans)) {
      const bg = el.style.backgroundImage || window.getComputedStyle(el).backgroundImage || '';
      const match = bg.match(/url\(["']?(https:\/\/[^"')]+)["']?\)/i);
      if (match && match[1]) {
        let rawUrl = match[1];
        // Upgrade low-res thumbnails (-t50x50, -t120x120, -t200x200) to 500x500 high-res artwork
        rawUrl = rawUrl.replace(/-t(50|120|200)x\1\./, '-t500x500.');
        if (rawUrl.startsWith('https://')) {
          cover_url = rawUrl;
          break;
        }
      }
    }

    // 6. Track URL: read href from titleLink and prepend soundcloud.com if relative
    let track_url: string | null = null;
    const relHref = titleLink.getAttribute('href');
    if (relHref) {
      if (relHref.startsWith('https://soundcloud.com/')) {
        track_url = relHref;
      } else if (relHref.startsWith('/')) {
        track_url = `https://soundcloud.com${relHref}`;
      }
    }

    return {
      title,
      artist,
      cover_url,
      track_url,
      is_playing,
      elapsed_sec,
      duration_sec,
    };
  }
}
