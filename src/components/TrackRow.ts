import { AudioEngine, toHighResArtwork } from '../player/AudioEngine.ts';
import { LikesStore } from '../state/LikesStore.ts';
import { AppNavigator } from '../state/AppNavigator.ts';
import type { Track } from '../types.ts';

export const ROW_PLAY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
export const ROW_PAUSE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

export const PLAYLIST_ADD_ICON = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 12H3"></path>
    <path d="M16 6H3"></path>
    <path d="M16 18H3"></path>
    <path d="M19 10v6"></path>
    <path d="M16 13h6"></path>
  </svg>
`;

export const HEART_ICON = (liked: boolean): string => `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="${liked ? 'var(--accent)' : 'none'}" stroke="${liked ? 'var(--accent)' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
  </svg>
`;

export function formatTrackDuration(sec: number): string {
  if (isNaN(sec) || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function createTrackRow(options: {
  track: Track;
  index: number;
  queue: Track[];
  queueIndex?: number;
  collectionId?: number | string;
  fallbackCover?: string;
  fallbackArtist?: string;
}): HTMLElement {
  const { track, index, queue, collectionId, fallbackCover, fallbackArtist } = options;
  const playIdx = options.queueIndex ?? index;
  const engine = AudioEngine.getInstance();
  const likesStore = LikesStore.getInstance();

  const title = track.title;
  const artist = track.user?.username || fallbackArtist || 'SoundCloud';
  const artistId = track.user?.id;
  const durationSec = track.duration ? track.duration / 1000 : 0;
  const cover =
    toHighResArtwork(track.artwork_url) ||
    fallbackCover ||
    'https://a1.sndcdn.com/images/default_avatar_large.png';
  const isLiked = likesStore.isLiked(track.id);
  const isPlaying = engine.isTrackPlaying(track.id);

  const row = document.createElement('div');
  row.className = `track-row ${isPlaying ? 'playing' : ''}`;
  row.dataset.trackId = String(track.id);
  row.innerHTML = `
    <span class="track-row-idx">
      <span class="idx-text">${index + 1}</span>
      <span class="eq-bars"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></span>
    </span>
    <div class="track-row-cover">
      <img src="${cover}" alt="${title}" loading="lazy" decoding="async" />
    </div>
    <div class="track-row-info">
      <span class="track-row-title clickable-link" title="View track details">${title}</span>
      <span class="track-row-artist ${artistId ? 'clickable-link' : ''}" title="${artistId ? `View ${artist}'s profile` : artist}">${artist}</span>
    </div>
    <button class="track-row-action-btn row-add-playlist-btn" data-track-id="${track.id}" title="Add to playlist">
      ${PLAYLIST_ADD_ICON}
    </button>
    <button class="track-row-action-btn row-like-btn ${isLiked ? 'liked' : ''}" data-track-id="${track.id}" title="${isLiked ? 'Unlike' : 'Like'}">
      ${HEART_ICON(isLiked)}
    </button>
    <span class="track-row-duration">${formatTrackDuration(durationSec)}</span>
    <button class="track-row-action-btn row-play-btn" data-track-id="${track.id}" title="Play">
      ${isPlaying ? ROW_PAUSE_ICON : ROW_PLAY_ICON}
    </button>
  `;

  row.querySelector('.track-row-title')?.addEventListener('click', (e) => {
    e.stopPropagation();
    AppNavigator.openTrack(track.id);
  });

  if (artistId) {
    row.querySelector('.track-row-artist')?.addEventListener('click', (e) => {
      e.stopPropagation();
      AppNavigator.openProfile(artistId);
    });
  }

  row.querySelector('.row-add-playlist-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    AppNavigator.openAddToPlaylist(track);
  });

  const likeBtn = row.querySelector<HTMLElement>('.row-like-btn');
  likeBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    likeBtn.classList.remove('sc-heart-pop');
    void likeBtn.offsetWidth;
    likeBtn.classList.add('sc-heart-pop');
    try {
      await likesStore.toggleLike(track);
    } catch (err) {
      console.error('Failed to toggle like:', err);
    }
  });

  row.querySelector('.row-play-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (engine.currentTrack?.id === track.id) {
      engine.togglePlay();
    } else {
      engine.playTrack(track, queue, playIdx, collectionId);
    }
  });

  row.addEventListener('click', () => {
    engine.playTrack(track, queue, playIdx, collectionId);
  });

  return row;
}
