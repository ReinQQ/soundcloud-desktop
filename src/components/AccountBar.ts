import { scLogin, scLogout, scGetMe } from '../ipc.ts';
import { LikesStore } from '../state/LikesStore.ts';
import type { User, ViewType } from '../types.ts';

export class AccountBar {
  private element: HTMLElement;
  private currentUser: User | null = null;
  private lastAuthError: string | null = null;
  private menuOpen: boolean = false;
  private onUserChanged?: (user: User | null) => void;
  private onNavigate?: (view: ViewType) => void;

  constructor(
    onUserChanged?: (user: User | null) => void,
    onNavigate?: (view: ViewType) => void
  ) {
    this.onUserChanged = onUserChanged;
    this.onNavigate = onNavigate;
    this.element = document.createElement('div');
    this.element.className = 'header-account-bar';
    this.element.setAttribute('data-tauri-drag-region', 'false');
    this.element.style.setProperty('-webkit-app-region', 'no-drag');

    this.render();
    this.refreshUser();

    document.addEventListener('click', (e) => {
      if (!this.element.contains(e.target as Node)) {
        this.closeMenu();
      }
    });
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public async refreshUser(notifyChange: boolean = false): Promise<void> {
    const prevUserId = this.currentUser?.id ?? null;
    try {
      this.currentUser = await scGetMe();
      this.lastAuthError = null;
    } catch (err: unknown) {
      // Transient proxy/network/DataDome error: keep existing currentUser instead of logging out.
      this.lastAuthError = err instanceof Error ? err.message : String(err);
      console.warn('Recoverable account refresh error (session preserved):', this.lastAuthError);
    }
    this.render();
    const nextUserId = this.currentUser?.id ?? null;
    if (this.onUserChanged && (notifyChange || prevUserId !== nextUserId)) {
      this.onUserChanged(this.currentUser);
    }
  }

  private closeMenu(): void {
    this.menuOpen = false;
    const menu = this.element.querySelector('.account-menu');
    menu?.classList.remove('open');
  }

  private toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
    const menu = this.element.querySelector('.account-menu');
    if (this.menuOpen) {
      menu?.classList.add('open');
    } else {
      menu?.classList.remove('open');
    }
  }

  private render(): void {
    if (!this.currentUser) {
      if (this.lastAuthError) {
        this.element.innerHTML = `
          <button class="account-signin-btn" id="account-btn-retry" data-tauri-drag-region="false" title="Session saved, connection failed: ${this.lastAuthError.replace(/"/g, '&quot;')}">
            <span>Reconnect</span>
          </button>
        `;
        this.element.querySelector('#account-btn-retry')?.addEventListener('click', () => {
          this.refreshUser(true);
        });
        return;
      }

      this.element.innerHTML = `
        <button class="account-signin-btn" id="account-btn-signin" data-tauri-drag-region="false">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="#ffffff" style="flex-shrink: 0;">
            <path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/>
          </svg>
          <span>Sign In</span>
        </button>
      `;
      this.element.querySelector('#account-btn-signin')?.addEventListener('click', () => {
        scLogin().catch(err => console.error('Sign in error:', err));
      });
      return;
    }

    const avatarUrl = this.currentUser.avatar_url || 'https://a1.sndcdn.com/images/default_avatar_large.png';
    const username = this.currentUser.username || 'User';

    this.element.innerHTML = `
      <div class="account-avatar-btn" id="account-avatar-toggle" title="${username}">
        <img src="${avatarUrl}" alt="${username}" />
      </div>
      <div class="account-menu">
        <div class="account-menu-header">
          <div class="account-user-name">${username}</div>
        </div>
        <div class="account-menu-item" id="account-menu-profile">View Profile</div>
        <div class="account-menu-item" id="account-menu-signout">Sign Out</div>
      </div>
    `;

    this.element.querySelector('#account-avatar-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });

    this.element.querySelector('#account-menu-profile')?.addEventListener('click', () => {
      this.closeMenu();
      if (this.onNavigate) {
        this.onNavigate('profile');
      }
    });

    this.element.querySelector('#account-menu-signout')?.addEventListener('click', async () => {
      this.closeMenu();
      await scLogout();
      LikesStore.getInstance().clear();
      this.currentUser = null;
      this.lastAuthError = null;
      await this.refreshUser(true);
    });
  }
}
