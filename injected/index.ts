import cssContent from './styles.css';
import { Titlebar } from './titlebar';
import { SettingsModal } from './settings-modal';
import { DarkThemeManager } from './dark-theme';
import { AdBlocker } from './adblocker';
import { Scraper } from './scraper';

(function initSoundCloudDesktop() {
  // Mask WebView2 brand in navigator.userAgentData for OAuth providers
  try {
    const uaData = (navigator as any).userAgentData;
    if (uaData && Array.isArray(uaData.brands)) {
      const cleanBrands = uaData.brands.filter(
        (b: { brand?: string }) => !String(b.brand || '').toLowerCase().includes('webview')
      );
      Object.defineProperty(navigator, 'userAgentData', {
        value: new Proxy(uaData, {
          get(target, prop) {
            if (prop === 'brands') return cleanBrands;
            const val = Reflect.get(target, prop);
            return typeof val === 'function' ? val.bind(target) : val;
          },
        }),
        configurable: true,
      });
    }
  } catch {}

  // Prevent injection inside iframes
  if (window.top !== window.self) {
    return;
  }

  // Handle OAuth popup windows (Google, Apple, Facebook): bridge window.close() to Tauri
  if (window.opener !== null) {
    const nativeClose = window.close.bind(window);
    window.close = function () {
      try {
        window.location.href = 'https://close.scdesktop.invalid/';
      } catch {}
      try {
        nativeClose();
      } catch {}
    };
    return;
  }

  // Prevent duplicate initialization
  if ((window as any).__SC_DESKTOP_INITIALIZED__) {
    return;
  }
  (window as any).__SC_DESKTOP_INITIALIZED__ = true;

  console.log('[SC-Desktop] Bootstrapping native desktop wrapper...');

  function injectStyles() {
    if (document.getElementById('sc-desktop-custom-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'sc-desktop-custom-styles';
    styleEl.textContent = cssContent;
    const target = document.head || document.documentElement;
    target.appendChild(styleEl);
  }

  function start() {
    injectStyles();

    let titlebar: Titlebar;
    let modal: SettingsModal;
    let darkTheme: DarkThemeManager;
    let adBlocker: AdBlocker;
    let scraper: Scraper;

    titlebar = new Titlebar({
      onOpenSettings: () => {
        modal.open();
        titlebar.setSettingsActive(true);
      },
      onOpenUpdate: () => {
        modal.open();
        titlebar.setSettingsActive(true);
      },
    });

    modal = new SettingsModal({
      onSettingsChanged: (settings) => {
        titlebar.updateProxyBadge(!!(settings.proxy_enabled && settings.proxy_active));
        titlebar.updateDiscordBadge(settings.discord_rpc_enabled);
        darkTheme.setEnabled(settings.dark_theme_enabled);
        adBlocker.setEnabled(settings.adblock_enabled);
        scraper.setEnabled(settings.discord_rpc_enabled);
      },
      onClose: () => {
        titlebar.setSettingsActive(false);
      },
      onUpdateAvailable: (version) => {
        titlebar.updateAvailableBadge(version);
      },
    });

    // Mount titlebar immediately
    titlebar.mount();

    // Initialize with default settings immediately, then update as backend resolves
    const initialSettings = modal.getSettings();
    darkTheme = new DarkThemeManager(initialSettings.dark_theme_enabled);
    adBlocker = new AdBlocker(initialSettings.adblock_enabled, {
      onAdMutedChanged: (muted) => {
        titlebar.updateAdMutedBadge(muted);
      },
    });
    scraper = new Scraper(initialSettings.discord_rpc_enabled);
    titlebar.updateProxyBadge(!!(initialSettings.proxy_enabled && initialSettings.proxy_active));
    titlebar.updateDiscordBadge(initialSettings.discord_rpc_enabled);

    // Run silent background update check 5 seconds after launch
    window.setTimeout(() => {
      modal.checkForUpdates(true).catch(console.error);
    }, 5000);

    console.log('[SC-Desktop] Client initialization completed.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();