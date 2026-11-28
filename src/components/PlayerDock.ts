import { AudioEngine, toHighResArtwork } from '../player/AudioEngine.ts';
import { LikesStore } from '../state/LikesStore.ts';
import { AppNavigator } from '../state/AppNavigator.ts';
import { formatDuration } from '../utils/format.ts';

export class PlayerDock {
  private element: HTMLElement;
  private curtain: HTMLElement;
  private engine: AudioEngine;
  private likesStore: LikesStore;
  private onToggleQueue: () => void;

  private isDraggingScrubber: boolean = false;
  private volumePopupOpen: boolean = false;

  constructor(onToggleQueue: () => void) {
    this.engine = AudioEngine.getInstance();
    this.likesStore = LikesStore.getInstance();
    this.onToggleQueue = onToggleQueue;

    this.curtain = document.createElement('div');
    this.curtain.className = 'dock-curtain';

    this.element = document.createElement('div');
    this.element.className = 'player-dock';

    this.render();
    this.initEvents();

    this.engine.subscribe(() => {
      this.updateState();
    });

    this.likesStore.subscribe(() => {
      this.updateLikeIcon();
    });

    document.addEventListener('click', (e) => {
      if (this.volumePopupOpen && !this.element.querySelector('.volume-container')?.contains(e.target as Node)) {
        this.closeVolumePopup();
      }
    });
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getCurtain(): HTMLElement {
    return this.curtain;
  }

  private closeVolumePopup(): void {
    this.volumePopupOpen = false;
    const popup = this.element.querySelector('.volume-slider-popup');
    popup?.classList.remove('open');
  }

  private toggleVolumePopup(): void {
    this.volumePopupOpen = !this.volumePopupOpen;
    const popup = this.element.querySelector('.volume-slider-popup');
    if (this.volumePopupOpen) {
      popup?.classList.add('open');
    } else {
      popup?.classList.remove('open');
    }
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="dock-left-controls">
        <button class="player-btn" id="dock-btn-shuffle" title="Shuffle">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 3 21 3 21 8"></polyline>
            <line x1="4" y1="20" x2="21" y2="3"></line>
            <polyline points="21 16 21 21 16 21"></polyline>
            <line x1="15" y1="15" x2="21" y2="21"></line>
            <line x1="4" y1="4" x2="9" y2="9"></line>
          </svg>
        </button>
        <button class="player-btn" id="dock-btn-prev" title="Previous">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="19 20 9 12 19 4 19 20"></polygon>
            <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></line>
          </svg>
        </button>
        <button class="player-btn play-pause-btn" id="dock-btn-playpause" title="Play">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" id="playpause-icon">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        <button class="player-btn" id="dock-btn-next" title="Next">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 4 15 12 5 20 5 4"></polygon>
            <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></line>
          </svg>
        </button>
        <button class="player-btn" id="dock-btn-repeat" title="Repeat">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="17 1 21 5 17 9"></polyline>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
            <polyline points="7 23 3 19 7 15"></polyline>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
          </svg>
          <span class="repeat-badge" id="repeat-badge" style="display: none;">1</span>
        </button>
      </div>

      <div class="dock-center-card">
        <div class="dock-nowplaying-art" id="dock-art">
          <img src="https://a1.sndcdn.com/images/default_avatar_large.png" alt="Cover" />
        </div>
        <div class="dock-nowplaying-info">
          <div class="dock-meta-text">
            <span class="dock-track-title clickable-link" id="dock-title">Ready to Play</span>
            <span class="dock-track-artist clickable-link" id="dock-artist">SoundCloud Desktop</span>
          </div>
          <div class="dock-scrubber-row">
            <span class="scrubber-timestamp" id="scrubber-time-cur">0:00</span>
            <div class="scrubber-bar-container" id="scrubber-container">
              <div class="scrubber-track-bg">
                <div class="scrubber-progress" id="scrubber-fill"></div>
              </div>
            </div>
            <span class="scrubber-timestamp" id="scrubber-time-total">0:00</span>
          </div>
        </div>
      </div>

      <div class="dock-right-controls">
        <button class="player-btn" id="dock-btn-add-playlist" title="Add to Playlist">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 12H3"></path>
            <path d="M16 6H3"></path>
            <path d="M16 18H3"></path>
            <path d="M19 10v6"></path>
            <path d="M16 13h6"></path>
          </svg>
        </button>
        <button class="player-btn" id="dock-btn-like" title="Like">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="like-icon">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
          </svg>
        </button>
        <button class="player-btn" id="dock-btn-queue" title="Playing Queue">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
        </button>
        <div class="volume-container">
          <button class="player-btn" id="dock-btn-volume" title="Volume">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="volume-icon">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
          </button>
          <div class="volume-slider-popup">
            <input type="range" class="volume-range-vertical" id="dock-volume-slider" min="0" max="1" step="0.01" value="0.8" />
          </div>
        </div>
      </div>
    `;
  }

  private initEvents(): void {
    const playPauseBtn = this.element.querySelector('#dock-btn-playpause');
    const prevBtn = this.element.querySelector('#dock-btn-prev');
    const nextBtn = this.element.querySelector('#dock-btn-next');
    const shuffleBtn = this.element.querySelector('#dock-btn-shuffle');
    const repeatBtn = this.element.querySelector('#dock-btn-repeat');
    const addPlaylistBtn = this.element.querySelector('#dock-btn-add-playlist');
    const likeBtn = this.element.querySelector('#dock-btn-like');
    const titleEl = this.element.querySelector('#dock-title');
    const artistEl = this.element.querySelector('#dock-artist');
    const queueBtn = this.element.querySelector('#dock-btn-queue');
    const volumeBtn = this.element.querySelector('#dock-btn-volume');
    const volumeSlider = this.element.querySelector<HTMLInputElement>('#dock-volume-slider');
    const scrubber = this.element.querySelector('#scrubber-container');

    playPauseBtn?.addEventListener('click', () => this.engine.togglePlay());
    prevBtn?.addEventListener('click', () => this.engine.prev());
    nextBtn?.addEventListener('click', () => this.engine.next());
    shuffleBtn?.addEventListener('click', () => this.engine.toggleShuffle());
    repeatBtn?.addEventListener('click', () => this.engine.cycleRepeat());
    queueBtn?.addEventListener('click', () => this.onToggleQueue());

    addPlaylistBtn?.addEventListener('click', () => {
      const track = this.engine.currentTrack;
      if (track) AppNavigator.openAddToPlaylist(track);
    });

    titleEl?.addEventListener('click', () => {
      const track = this.engine.currentTrack;
      if (track?.id) AppNavigator.openTrack(track.id);
    });

    artistEl?.addEventListener('click', () => {
      const userId = this.engine.currentTrack?.user?.id;
      if (userId) AppNavigator.openProfile(userId);
    });

    likeBtn?.addEventListener('click', async () => {
      const track = this.engine.currentTrack;
      if (!track) return;
      likeBtn.classList.remove('sc-heart-pop');
      void (likeBtn as HTMLElement).offsetWidth;
      likeBtn.classList.add('sc-heart-pop');
      try {
        await this.likesStore.toggleLike(track);
      } catch (err) {
        console.error('Failed to toggle like in PlayerDock:', err);
      }
    });

    volumeBtn?.addEventListener('click', () => {
      this.toggleVolumePopup();
    });

    volumeSlider?.addEventListener('input', (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      this.engine.setVolume(v);
    });

    if (scrubber) {
      const seekFromEvent = (e: MouseEvent) => {
        const rect = scrubber.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (this.engine.duration > 0) {
          this.engine.seek(ratio * this.engine.duration);
        }
      };

      scrubber.addEventListener('mousedown', (e: Event) => {
        this.isDraggingScrubber = true;
        seekFromEvent(e as MouseEvent);
      });

      window.addEventListener('mousemove', (e) => {
        if (this.isDraggingScrubber) {
          seekFromEvent(e);
        }
      });

      window.addEventListener('mouseup', () => {
        this.isDraggingScrubber = false;
      });

      window.addEventListener('blur', () => {
        this.isDraggingScrubber = false;
      });
    }
  }

  private updateLikeIcon(): void {
    const likeBtn = this.element.querySelector('#dock-btn-like');
    const likeIcon = this.element.querySelector('#like-icon');
    const track = this.engine.currentTrack;
    const isLiked = track ? this.likesStore.isLiked(track.id) : false;

    if (isLiked) {
      likeBtn?.classList.add('active', 'liked');
      likeIcon?.setAttribute('fill', 'var(--accent)');
      likeIcon?.setAttribute('stroke', 'var(--accent)');
    } else {
      likeBtn?.classList.remove('active', 'liked');
      likeIcon?.setAttribute('fill', 'none');
      likeIcon?.setAttribute('stroke', 'currentColor');
    }
  }

  private updateState(): void {
    this.updateLikeIcon();
    const track = this.engine.currentTrack;
    const isPlaying = this.engine.isPlaying;
    const curTime = this.engine.currentTime;
    const duration = this.engine.duration;

    const playPauseIcon = this.element.querySelector('#playpause-icon');
    if (playPauseIcon) {
      if (isPlaying) {
        playPauseIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
      } else {
        playPauseIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
      }
    }

    const titleEl = this.element.querySelector('#dock-title');
    const artistEl = this.element.querySelector('#dock-artist');
    const artEl = this.element.querySelector('#dock-art img') as HTMLImageElement;

    if (track) {
      if (titleEl) titleEl.textContent = track.title;
      if (artistEl) artistEl.textContent = track.user?.username || 'Unknown Artist';
      if (artEl) {
        artEl.src = toHighResArtwork(track.artwork_url) || 'https://a1.sndcdn.com/images/default_avatar_large.png';
      }
    } else {
      if (titleEl) titleEl.textContent = 'Ready to Play';
      if (artistEl) artistEl.textContent = 'SoundCloud Desktop';
      if (artEl) artEl.src = 'https://a1.sndcdn.com/images/default_avatar_large.png';
    }

    const timeCur = this.element.querySelector('#scrubber-time-cur');
    const timeTotal = this.element.querySelector('#scrubber-time-total');
    const fill = this.element.querySelector<HTMLElement>('#scrubber-fill');

    if (timeCur) timeCur.textContent = formatDuration(curTime);
    if (timeTotal) timeTotal.textContent = formatDuration(duration);
    if (fill) {
      const pct = duration > 0 ? (curTime / duration) * 100 : 0;
      fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }

    const shuffleBtn = this.element.querySelector('#dock-btn-shuffle');
    if (this.engine.shuffle) {
      shuffleBtn?.classList.add('active');
    } else {
      shuffleBtn?.classList.remove('active');
    }

    const repeatBtn = this.element.querySelector('#dock-btn-repeat');
    const repeatBadge = this.element.querySelector<HTMLElement>('#repeat-badge');
    if (this.engine.repeat === 'all') {
      repeatBtn?.classList.add('active');
      if (repeatBadge) repeatBadge.style.display = 'none';
    } else if (this.engine.repeat === 'one') {
      repeatBtn?.classList.add('active');
      if (repeatBadge) repeatBadge.style.display = 'block';
    } else {
      repeatBtn?.classList.remove('active');
      if (repeatBadge) repeatBadge.style.display = 'none';
    }

    const volumeSlider = this.element.querySelector<HTMLInputElement>('#dock-volume-slider');
    if (volumeSlider) {
      volumeSlider.value = this.engine.volume.toString();
    }
  }
}
