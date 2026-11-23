import type { ViewType } from '../types.ts';

export class Sidebar {
  private element: HTMLElement;
  private onNavigate: (view: ViewType, subTab?: string) => void;

  constructor(onNavigate: (view: ViewType, subTab?: string) => void) {
    this.onNavigate = onNavigate;
    this.element = document.createElement('div');
    this.element.className = 'floating-sidebar';

    this.element.innerHTML = `
      <div class="sidebar-item active" data-view="home">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span>Home</span>
      </div>
      <div class="sidebar-item" data-view="feed">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 11a9 9 0 0 1 9 9"></path>
          <path d="M4 4a16 16 0 0 1 16 16"></path>
          <circle cx="5" cy="19" r="1"></circle>
        </svg>
        <span>Feed</span>
      </div>
      <div class="sidebar-item" data-view="library">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m16 6 4 14"></path>
          <path d="M12 6v14"></path>
          <path d="M8 8v12"></path>
          <path d="M4 4v16"></path>
        </svg>
        <span>Library</span>
      </div>
      <div class="sidebar-item" data-view="library" data-subtab="likes">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
        </svg>
        <span>Likes</span>
      </div>
      <div class="sidebar-item" data-view="library" data-subtab="playlists">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
        <span>Playlists</span>
      </div>
    `;

    this.initEvents();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public setActive(view: ViewType, subTab?: string): void {
    const items = this.element.querySelectorAll<HTMLElement>('.sidebar-item');
    items.forEach((item) => {
      const itemView = item.getAttribute('data-view');
      const itemSub = item.getAttribute('data-subtab');

      if (view === 'library' && subTab) {
        if (itemView === 'library' && itemSub === subTab) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      } else {
        if (itemView === view && !itemSub) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      }
    });
  }

  public clearActive(): void {
    const items = this.element.querySelectorAll<HTMLElement>('.sidebar-item');
    items.forEach((item) => item.classList.remove('active'));
  }

  private initEvents(): void {
    const items = this.element.querySelectorAll<HTMLElement>('.sidebar-item');
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const view = item.getAttribute('data-view') as ViewType;
        const subTab = item.getAttribute('data-subtab') || undefined;
        this.setActive(view, subTab);
        this.onNavigate(view, subTab);
      });
    });
  }
}
