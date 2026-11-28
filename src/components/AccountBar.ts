import { scLogin, scLogout, scGetMe } from '../ipc.ts';
import { LikesStore } from '../state/LikesStore.ts';
import { escapeHtml, soundcloudCloudSvg } from '../utils/format.ts';
import type { User, ViewType } from '../types.ts';

export class AccountBar {
  private element: HTMLElement;
  private currentUser: User | null = null;
  private lastAuthError: string | null = null;
  private menuOpen: boolean = false;
  private refreshSeq: number = 0;
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
    const seq = ++this.refreshSeq;
    const prevUserId = this.currentUser?.id ?? null;
    try {
      const user = await scGetMe();
      if (seq !== this.refreshSeq) return;
      this.currentUser = user;
      this.lastAuthError = null;
    } catch (err: unknown) {
      if (seq !== this.refreshSeq) return;
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
          <button class="account-signin-btn" id="account-btn-retry" data-tauri-drag-region="false" title="Session saved, connection failed: ${escapeHtml(this.lastAuthError)}">
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
          ${soundcloudCloudSvg(17, '#ffffff')}
          <span>Sign In</span>
        </button>
      `;
      this.element.querySelector('#account-btn-signin')?.addEventListener('click', () => {
        scLogin().catch(err => console.error('Sign in error:', err));
      });
      return;
    }

    const avatarUrl = escapeHtml(this.currentUser.avatar_url || 'https://a1.sndcdn.com/images/default_avatar_large.png');
    const username = escapeHtml(this.currentUser.username || 'User');

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
      this.refreshSeq++;
      await scLogout();
      LikesStore.getInstance().clear();
      this.currentUser = null;
      this.lastAuthError = null;
      this.render();
    });
  }
}
