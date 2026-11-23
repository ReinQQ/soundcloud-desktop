import { AudioEngine } from '../player/AudioEngine.ts';
import { AppNavigator } from '../state/AppNavigator.ts';
import { PLAYLIST_ADD_ICON } from './TrackRow.ts';
import type { Track } from '../types.ts';

function formatDuration(sec: number): string {
  if (isNaN(sec) || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export class QueueDrawer {
  private element: HTMLElement;
  private engine: AudioEngine;
  private isOpen: boolean = false;

  constructor() {
    this.engine = AudioEngine.getInstance();
    this.element = document.createElement('div');
    this.element.className = 'queue-drawer';

    this.render();
    this.engine.subscribe(() => {
      if (this.isOpen) {
        this.renderList();
      }
    });

    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.element.contains(e.target as Node) && !(e.target as Element).closest('#dock-btn-queue')) {
        this.close();
      }
    });
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public open(): void {
    this.isOpen = true;
    this.element.classList.add('open');
    this.renderList();
  }

  public close(): void {
    this.isOpen = false;
    this.element.classList.remove('open');
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="queue-drawer-header">
        <span class="queue-drawer-title">Playing Queue</span>
        <button class="queue-clear-btn" id="queue-btn-clear">Clear</button>
      </div>
      <div class="queue-items-list" id="queue-items-container"></div>
    `;

    this.element.querySelector('#queue-btn-clear')?.addEventListener('click', () => {
      this.engine.clearQueue();
    });

    this.renderList();
  }

  private renderList(): void {
    const container = this.element.querySelector('#queue-items-container');
    if (!container) return;

    if (this.engine.queue.length === 0) {
      container.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">Queue is empty</div>`;
      return;
    }

    container.innerHTML = '';
    this.engine.queue.forEach((track: Track, idx: number) => {
      const isCurrent = idx === this.engine.queueIndex;
      const row = document.createElement('div');
      row.className = `queue-item-row ${isCurrent ? 'active' : ''}`;
      row.innerHTML = `
        <span style="min-width: 20px; color: var(--text-tertiary); font-size: 11px;">${idx + 1}</span>
        <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 2px;">
          <span class="queue-track-title clickable-link" style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${track.title}</span>
          <span class="queue-track-artist ${track.user?.id ? 'clickable-link' : ''}" style="font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${track.user?.username || ''}</span>
        </div>
        <span style="font-size: 11px; color: var(--text-tertiary);">${formatDuration(track.duration ? track.duration / 1000 : 0)}</span>
        <button class="track-row-action-btn queue-add-pl-btn" title="Add to playlist">${PLAYLIST_ADD_ICON}</button>
        <button class="track-row-action-btn queue-remove-btn" title="Remove from queue">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      `;

      row.querySelector('.queue-track-title')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
        AppNavigator.openTrack(track.id);
      });

      if (track.user?.id) {
        row.querySelector('.queue-track-artist')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.close();
          AppNavigator.openProfile(track.user.id);
        });
      }

      row.querySelector('.queue-add-pl-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        AppNavigator.openAddToPlaylist(track);
      });

      row.addEventListener('click', (e) => {
        if ((e.target as Element).closest('.queue-remove-btn')) {
          e.stopPropagation();
          this.engine.removeFromQueue(idx);
          return;
        }
        this.engine.queueIndex = idx;
        this.engine.playTrack(track);
      });

      container.appendChild(row);
    });
  }
}
