import { Titlebar } from './components/Titlebar.ts';
import { Sidebar } from './components/Sidebar.ts';
import { AccountBar } from './components/AccountBar.ts';
import { PlayerDock } from './components/PlayerDock.ts';
import { QueueDrawer } from './components/QueueDrawer.ts';
import { SettingsModal } from './components/SettingsModal.ts';
import { AddToPlaylistModal } from './components/AddToPlaylistModal.ts';
import { HomeView } from './views/HomeView.ts';
import { FeedView } from './views/FeedView.ts';
import { SearchView } from './views/SearchView.ts';
import { LibraryView } from './views/LibraryView.ts';
import { CollectionDetailView } from './views/CollectionDetailView.ts';
import { ProfileView } from './views/ProfileView.ts';
import { TrackDetailView } from './views/TrackDetailView.ts';
import { LikesStore } from './state/LikesStore.ts';
import { AppNavigator } from './state/AppNavigator.ts';
import { getSettings, onAuthUpdated, scFrontendReady } from './ipc.ts';
import type { ViewType } from './types.ts';

interface HistoryState {
  view: ViewType;
  subTab?: string;
  query?: string;
  playlistId?: number | string;
  trackId?: number;
  userId?: number;
}

interface ViewComponent {
  destroy?: () => void;
  getElement(): HTMLElement;
}

class App {
  private appRoot: HTMLElement;
  private viewport: HTMLElement;
  private titlebar!: Titlebar;
  private sidebar!: Sidebar;
  private accountBar!: AccountBar;
  private playerDock!: PlayerDock;
  private queueDrawer!: QueueDrawer;
  private settingsModal!: SettingsModal;
  private addToPlaylistModal!: AddToPlaylistModal;

  private currentViewType: ViewType = 'home';
  private currentState: HistoryState = { view: 'home' };
  private currentViewInstance: ViewComponent | null = null;
  private lastProxySignature: string = '';

  constructor() {
    this.appRoot = document.getElementById('app') as HTMLElement;
    this.viewport = document.createElement('main');
    this.viewport.className = 'main-viewport';

    this.init();
    this.initNavigationListeners();
  }

  private init(): void {
    this.settingsModal = new SettingsModal((updatedSettings) => {
      this.titlebar.updateSettings(updatedSettings);
      const nextSig = `${updatedSettings.proxy_enabled}|${updatedSettings.proxy_url}|${updatedSettings.proxy_active}`;
      if (this.lastProxySignature && nextSig !== this.lastProxySignature) {
        this.lastProxySignature = nextSig;
        this.accountBar.refreshUser().then(() => {
          LikesStore.getInstance().init(true).catch(() => {});
          this.refreshCurrentView();
        }).catch(() => {});
      } else {
        this.lastProxySignature = nextSig;
      }
    });

    this.addToPlaylistModal = new AddToPlaylistModal();

    AppNavigator.register({
      onOpenTrack: (trackId) => this.openTrack(trackId, true),
      onOpenProfile: (userId) => this.openProfile(userId, true),
      onOpenAddToPlaylist: (track) => this.addToPlaylistModal.open(track),
    });

    this.titlebar = new Titlebar(
      () => {
        this.settingsModal.open();
      },
      () => {
        if (this.currentViewType !== 'search') {
          this.navigateTo('search', undefined, true);
        }
      },
      (query, immediate) => {
        this.performSearch(query, immediate);
      }
    );

    this.sidebar = new Sidebar((view, subTab) => {
      this.navigateTo(view, subTab, true);
    });

    this.accountBar = new AccountBar(
      (user) => {
        if (user) {
          LikesStore.getInstance().init(true).catch(() => {});
        } else {
          LikesStore.getInstance().clear();
        }
        this.refreshCurrentView();
      },
      () => {
        this.openProfile(undefined, true);
      }
    );

    this.titlebar.mountAccountBar(this.accountBar.getElement());

    this.queueDrawer = new QueueDrawer();

    this.playerDock = new PlayerDock(() => {
      this.queueDrawer.toggle();
    });

    this.appRoot.appendChild(this.titlebar.getElement());
    this.appRoot.appendChild(this.sidebar.getElement());
    this.appRoot.appendChild(this.viewport);
    this.appRoot.appendChild(this.queueDrawer.getElement());
    this.appRoot.appendChild(this.playerDock.getCurtain());
    this.appRoot.appendChild(this.playerDock.getElement());
    this.appRoot.appendChild(this.settingsModal.getElement());
    this.appRoot.appendChild(this.addToPlaylistModal.getElement());

    const initialState: HistoryState = { view: 'home' };
    window.history.replaceState(initialState, '', '');
    this.renderState(initialState);

    scFrontendReady().catch(() => {});

    getSettings()
      .then((settings) => {
        this.lastProxySignature = `${settings.proxy_enabled}|${settings.proxy_url}|${settings.proxy_active}`;
        if (settings.dark_theme_enabled) {
          document.documentElement.classList.add('sc-dark-theme');
        } else {
          document.documentElement.classList.remove('sc-dark-theme');
        }
        this.titlebar.updateSettings(settings);
        if (settings.oauth_token) {
          LikesStore.getInstance().init().catch(() => {});
        }
      })
      .catch(() => {});

    onAuthUpdated(async (token) => {
      await this.accountBar.refreshUser(false);
      if (token && token.trim().length > 0) {
        await LikesStore.getInstance().init(true);
      } else {
        LikesStore.getInstance().clear();
      }
      this.refreshCurrentView();
    });
  }

  private initNavigationListeners(): void {
    window.addEventListener('popstate', (event: PopStateEvent) => {
      const state: HistoryState = event.state || { view: 'home' };
      this.renderState(state);
    });

    window.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
      }
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        window.history.back();
      } else if (e.button === 4) {
        e.preventDefault();
        window.history.forward();
      }
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        window.history.back();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        window.history.forward();
      }
    });
  }

  public navigateTo(view: ViewType, subTab?: string, pushHistory: boolean = true): void {
    const state: HistoryState = { view, subTab };
    if (pushHistory) {
      window.history.pushState(state, '', '');
    }
    this.renderState(state);
  }

  public performSearch(query: string, immediate: boolean = false): void {
    const trimmed = query.trim();
    if (this.currentViewType === 'search' && this.currentViewInstance instanceof SearchView) {
      if (this.currentState.query === trimmed && !immediate) {
        return;
      }
      this.currentState = { view: 'search', query: trimmed };
      window.history.replaceState(this.currentState, '', '');
      this.currentViewInstance.setQuery(trimmed);
      return;
    }

    if (!trimmed && !immediate) {
      return;
    }

    const state: HistoryState = { view: 'search', query: trimmed };
    window.history.pushState(state, '', '');
    this.renderState(state);
  }

  public openPlaylist(playlistId: number | string, pushHistory: boolean = true): void {
    const state: HistoryState = { view: 'collection', playlistId };
    if (pushHistory) {
      window.history.pushState(state, '', '');
    }
    this.renderState(state);
  }

  public openTrack(trackId: number, pushHistory: boolean = true): void {
    const state: HistoryState = { view: 'track', trackId };
    if (pushHistory) {
      window.history.pushState(state, '', '');
    }
    this.renderState(state);
  }

  public openProfile(userId?: number, pushHistory: boolean = true): void {
    const state: HistoryState = { view: 'profile', userId };
    if (pushHistory) {
      window.history.pushState(state, '', '');
    }
    this.renderState(state);
  }

  public refreshCurrentView(): void {
    if (this.currentViewInstance && typeof this.currentViewInstance.destroy === 'function') {
      this.currentViewInstance.destroy();
      this.currentViewInstance = null;
    }
    this.renderState(this.currentState);
  }

  private renderState(state: HistoryState): void {
    if (this.currentViewInstance && typeof this.currentViewInstance.destroy === 'function') {
      this.currentViewInstance.destroy();
      this.currentViewInstance = null;
    }

    this.currentState = state;
    this.currentViewType = state.view;
    this.viewport.innerHTML = '';

    switch (state.view) {
      case 'home': {
        this.sidebar.setActive('home');
        const home = new HomeView((playlistId) => this.openPlaylist(playlistId, true));
        this.currentViewInstance = home;
        this.viewport.appendChild(home.getElement());
        break;
      }
      case 'feed': {
        this.sidebar.setActive('feed');
        const feed = new FeedView();
        this.currentViewInstance = feed;
        this.viewport.appendChild(feed.getElement());
        break;
      }
      case 'library': {
        const tab = state.subTab === 'playlists' ? 'playlists' : 'likes';
        this.sidebar.setActive('library', tab);
        const libraryView = new LibraryView((playlistId) => this.openPlaylist(playlistId, true), tab);
        this.currentViewInstance = libraryView;
        this.viewport.appendChild(libraryView.getElement());
        break;
      }
      case 'search': {
        this.sidebar.clearActive();
        this.titlebar.setSearchQuery(state.query || '');
        const searchView = new SearchView(
          (playlistId) => this.openPlaylist(playlistId, true),
          (selectedQuery) => {
            this.titlebar.setSearchQuery(selectedQuery);
            this.performSearch(selectedQuery, true);
          }
        );
        this.currentViewInstance = searchView;
        this.viewport.appendChild(searchView.getElement());
        if (state.query) {
          searchView.setQuery(state.query);
        }
        break;
      }
      case 'collection': {
        this.sidebar.clearActive();
        if (state.playlistId !== undefined) {
          const detailView = new CollectionDetailView(state.playlistId);
          this.currentViewInstance = detailView;
          this.viewport.appendChild(detailView.getElement());
        }
        break;
      }
      case 'profile': {
        this.sidebar.clearActive();
        const profileView = new ProfileView(
          (playlistId) => this.openPlaylist(playlistId, true),
          state.userId
        );
        this.currentViewInstance = profileView;
        this.viewport.appendChild(profileView.getElement());
        break;
      }
      case 'track': {
        this.sidebar.clearActive();
        if (state.trackId !== undefined) {
          const trackView = new TrackDetailView(state.trackId);
          this.currentViewInstance = trackView;
          this.viewport.appendChild(trackView.getElement());
        }
        break;
      }
    }

    this.viewport.scrollTop = 0;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new App();
  });
} else {
  new App();
}
