import cssContent from './styles.css';
import { Titlebar } from './titlebar';
import { SettingsModal } from './settings-modal';
import { DarkThemeManager } from './dark-theme';
import { AdBlocker } from './adblocker';
import { Scraper } from './scraper';

(function initSoundCloudDesktop() {
  // Prevent injection inside iframes (e.g. SoundCloud auth or tracking iframes)
  if (window.top !== window.self) {
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
