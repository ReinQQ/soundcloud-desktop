import { scLogin, scLogout, scGetMe, onAuthUpdated } from '../ipc.ts';
import { LikesStore } from '../state/LikesStore.ts';
import type { User, ViewType } from '../types.ts';

export class AccountBar {
  private element: HTMLElement;
  private currentUser: User | null = null;
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

    onAuthUpdated(() => {
      this.refreshUser();
    });

    document.addEventListener('click', (e) => {
      if (!this.element.contains(e.target as Node)) {
        this.closeMenu();
      }
    });
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public async refreshUser(): Promise<void> {
    try {
      this.currentUser = await scGetMe();
    } catch (_) {
      this.currentUser = null;
    }
    this.render();
    if (this.onUserChanged) {
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
      this.element.innerHTML = `
        <button class="account-signin-btn" id="account-btn-signin" data-tauri-drag-region="false">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff" style="flex-shrink: 0;">
            <path d="M1.175 12.222c-.324 0-.588.263-.588.587v3.63c0 .325.264.588.588.588s.588-.263.588-.588v-3.63c0-.324-.264-.587-.588-.587zm2.35-1.175c-.324 0-.588.263-.588.587v4.805c0 .325.264.588.588.588s.588-.263.588-.588v-4.805c0-.324-.264-.587-.588-.587zm2.35-1.763c-.324 0-.587.264-.587.588v6.568c0 .325.263.588.587.588.325 0 .588-.263.588-.588V9.872c0-.324-.263-.588-.588-.588zm2.352-.587c-.325 0-.588.263-.588.587v7.155c0 .325.263.588.588.588.324 0 .587-.263.587-.588V9.284c0-.324-.263-.587-.587-.587zm2.35-1.176c-.324 0-.587.263-.587.588v8.33c0 .325.263.588.587.588.325 0 .588-.263.588-.588V8.11c0-.325-.263-.588-.588-.588zm8.613 2.518c-.44 0-.865.084-1.258.236-.268-2.617-2.478-4.663-5.168-4.663-.648 0-1.274.122-1.855.344-.223.085-.285.174-.285.348v10.22c0 .18.14.327.318.345h8.248c1.79 0 3.243-1.452 3.243-3.243s-1.453-3.242-3.243-3.242z"/>
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
      await this.refreshUser();
    });
  }
}
