import { scGetStream, scLogin } from '../ipc.ts';
import { AudioEngine } from '../player/AudioEngine.ts';
import { LikesStore } from '../state/LikesStore.ts';
import {
  createTrackRow,
  HEART_ICON,
  ROW_PLAY_ICON,
  ROW_PAUSE_ICON,
} from '../components/TrackRow.ts';
import type { Track, StreamResponse, StreamItem } from '../types.ts';

export class FeedView {
  private element: HTMLElement;
  private engine: AudioEngine;
  private likesStore: LikesStore;
  private unsubscribeAudio: (() => void) | null = null;
  private unsubscribeLikes: (() => void) | null = null;

  constructor() {
    this.engine = AudioEngine.getInstance();
    this.likesStore = LikesStore.getInstance();
    this.element = document.createElement('div');
    this.element.className = 'view-container';

    this.unsubscribeAudio = this.engine.subscribe(() => this.updatePlayButtons());
    this.unsubscribeLikes = this.likesStore.subscribe(() => this.updateLikeButtons());
    this.loadData();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public destroy(): void {
    if (this.unsubscribeAudio) {
      this.unsubscribeAudio();
      this.unsubscribeAudio = null;
    }
    if (this.unsubscribeLikes) {
      this.unsubscribeLikes();
      this.unsubscribeLikes = null;
    }
  }

  private async loadData(): Promise<void> {
    this.element.innerHTML = `
      <div class="view-section-header">
        <div>
          <div class="skeleton" style="width: 120px; height: 26px; margin-bottom: 8px;"></div>
          <div class="skeleton" style="width: 260px; height: 16px;"></div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md);"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.8;"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.6;"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.4;"></div>
        <div class="skeleton" style="height: 48px; border-radius: var(--radius-md); opacity: 0.2;"></div>
      </div>
    `;

    try {
      const data = await scGetStream();
      this.render(data);
    } catch (err) {
      this.element.innerHTML = `
        <div style="padding: 32px; text-align: center; max-width: 440px; margin: 40px auto; background: var(--bg-card); border-radius: var(--radius-xl); border: var(--border-subtle);">
          <h3 style="font-size: 18px; margin-bottom: 8px;">Sign in to see your Feed</h3>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">
            Follow artists and creators to get their newest releases and reposts directly in your stream.
          </p>
          <button class="btn-primary" id="feed-btn-signin" style="padding: 9px 24px;">Sign In</button>
        </div>
      `;
      this.element.querySelector('#feed-btn-signin')?.addEventListener('click', () => {
        scLogin();
      });
    }
  }

  private render(data: StreamResponse): void {
    this.element.innerHTML = '';

    const items = data.collection || [];
    if (items.length === 0) {
      this.element.innerHTML = `
        <div style="padding: 32px; color: var(--text-secondary);">
          <h3>Your stream is currently empty</h3>
          <p style="margin-top: 6px; font-size: 13px; color: var(--text-tertiary);">Follow more artists on SoundCloud to see their latest uploads here.</p>
        </div>
      `;
      return;
    }

    const secEl = document.createElement('div');
    secEl.className = 'view-section';
    secEl.innerHTML = `
      <div class="view-section-header">
        <div>
          <h2 class="view-section-title">Stream</h2>
          <p class="view-section-subtitle">Latest tracks and reposts from people you follow</p>
        </div>
      </div>
    `;

    const table = document.createElement('div');
    table.className = 'tracklist-table';

    const tracksList: Track[] = [];

    items.forEach((item: StreamItem, idx: number) => {
      const track = (item.track || item) as unknown as Track;
      if (!track || !track.title) return;

      tracksList.push(track);
      const trackIndex = tracksList.length - 1;
      table.appendChild(
        createTrackRow({
          track,
          index: idx,
          queue: tracksList,
          queueIndex: trackIndex,
        })
      );
    });

    secEl.appendChild(table);
    this.element.appendChild(secEl);
    this.updatePlayButtons();
  }

  private updateLikeButtons(): void {
    const likeButtons = this.element.querySelectorAll<HTMLElement>('.row-like-btn');
    likeButtons.forEach((btn) => {
      const id = Number(btn.dataset.trackId);
      if (!id) return;
      const isLiked = this.likesStore.isLiked(id);
      btn.classList.toggle('liked', isLiked);
      btn.innerHTML = HEART_ICON(isLiked);
      btn.title = isLiked ? 'Unlike' : 'Like';
    });
  }

  private updatePlayButtons(): void {
    const rowEls = this.element.querySelectorAll<HTMLElement>('.track-row');
    rowEls.forEach((row) => {
      const id = Number(row.dataset.trackId);
      if (!id) return;
      const isPlaying = this.engine.isTrackPlaying(id);
      row.classList.toggle('playing', isPlaying);
    });

    const rowButtons = this.element.querySelectorAll<HTMLElement>('.row-play-btn');
    rowButtons.forEach((btn) => {
      const id = Number(btn.dataset.trackId);
      if (!id) return;

      const isPlaying = this.engine.isTrackPlaying(id);
      btn.innerHTML = isPlaying ? ROW_PAUSE_ICON : ROW_PLAY_ICON;
    });
  }
}
