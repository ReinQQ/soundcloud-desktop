(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // injected/styles.css
  var styles_default;
  var init_styles = __esm({
    "injected/styles.css"() {
      styles_default = '/* ==========================================================================\r\n   SoundCloud Native Desktop Client - Stylesheet\r\n   Crafted following frontend-design guidelines: intentional typography,\r\n   tailored palette, restrained micro-interactions & deep dark theme.\r\n   ========================================================================== */\r\n\r\n:root {\r\n  --sc-brand-orange: #ff5500;\r\n  --sc-brand-orange-hover: #ff6d24;\r\n  --sc-brand-orange-active: #e64d00;\r\n  --sc-brand-orange-dim: rgba(255, 85, 0, 0.15);\r\n  --sc-brand-orange-border: rgba(255, 85, 0, 0.35);\r\n\r\n  --sc-bg-chrome: #0d0d10;\r\n  --sc-bg-surface: #141418;\r\n  --sc-bg-surface-elevated: #1a1a20;\r\n  --sc-bg-surface-hover: #22222a;\r\n  --sc-bg-input: #111114;\r\n\r\n  --sc-border-subtle: rgba(255, 255, 255, 0.07);\r\n  --sc-border-medium: rgba(255, 255, 255, 0.12);\r\n  --sc-border-focus: #ff5500;\r\n\r\n  --sc-text-primary: #f4f4f6;\r\n  --sc-text-secondary: #a0a0ab;\r\n  --sc-text-muted: #6b6b78;\r\n\r\n  --sc-titlebar-height: 36px;\r\n  --sc-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;\r\n}\r\n\r\n/* ==========================================================================\r\n   Window & Header Layout Corrections\r\n   ========================================================================== */\r\n\r\nbody.sc-desktop-active {\r\n  padding-top: var(--sc-titlebar-height) !important;\r\n}\r\n\r\n/* Push SoundCloud fixed top navigation header down so nothing clips */\r\n.header,\r\n#header,\r\nheader.header,\r\n.sc-header {\r\n  top: var(--sc-titlebar-height) !important;\r\n  z-index: 1000 !important;\r\n}\r\n\r\n/* ==========================================================================\r\n   Custom Frameless Titlebar\r\n   ========================================================================== */\r\n\r\n#sc-desktop-titlebar {\r\n  position: fixed;\r\n  top: 0;\r\n  left: 0;\r\n  right: 0;\r\n  height: var(--sc-titlebar-height);\r\n  background: var(--sc-bg-chrome);\r\n  border-bottom: 1px solid var(--sc-border-subtle);\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  padding: 0 0 0 12px;\r\n  z-index: 999999;\r\n  user-select: none;\r\n  font-family: var(--sc-font-sans);\r\n  font-size: 12px;\r\n  color: var(--sc-text-primary);\r\n  box-sizing: border-box;\r\n}\r\n\r\n/* Non-draggable interactive controls inside titlebar */\r\n.sc-no-drag {\r\n  -webkit-app-region: no-drag !important;\r\n  app-region: no-drag !important;\r\n  pointer-events: auto !important;\r\n}\r\n\r\n/* Left: Branding */\r\n.sc-titlebar-left {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  height: 100%;\r\n}\r\n\r\n.sc-brand-icon {\r\n  width: 18px;\r\n  height: 18px;\r\n  fill: var(--sc-brand-orange);\r\n  display: block;\r\n}\r\n\r\n.sc-brand-title {\r\n  font-size: 12px;\r\n  font-weight: 600;\r\n  letter-spacing: -0.01em;\r\n  color: var(--sc-text-primary);\r\n}\r\n\r\n.sc-brand-sub {\r\n  font-size: 10px;\r\n  font-weight: 500;\r\n  color: var(--sc-text-muted);\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.04em;\r\n  margin-left: 2px;\r\n}\r\n\r\n/* Center / Status Badges */\r\n.sc-titlebar-center {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  height: 100%;\r\n}\r\n\r\n.sc-status-badge {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  padding: 2px 8px;\r\n  border-radius: 999px;\r\n  font-size: 11px;\r\n  font-weight: 500;\r\n  line-height: 1;\r\n  background: rgba(255, 255, 255, 0.04);\r\n  border: 1px solid var(--sc-border-subtle);\r\n  color: var(--sc-text-muted);\r\n  transition: all 0.15s ease;\r\n  user-select: none;\r\n}\r\n\r\n.sc-status-dot {\r\n  width: 6px;\r\n  height: 6px;\r\n  border-radius: 50%;\r\n  background: var(--sc-text-muted);\r\n  transition: background-color 0.2s ease, box-shadow 0.2s ease;\r\n}\r\n\r\n/* Proxy badge active */\r\n.sc-status-badge.proxy-active {\r\n  background: rgba(16, 185, 129, 0.1);\r\n  border-color: rgba(16, 185, 129, 0.25);\r\n  color: #34d399;\r\n}\r\n.sc-status-badge.proxy-active .sc-status-dot {\r\n  background: #10b981;\r\n  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);\r\n}\r\n\r\n/* Discord badge active */\r\n.sc-status-badge.discord-active {\r\n  background: rgba(88, 101, 242, 0.1);\r\n  border-color: rgba(88, 101, 242, 0.25);\r\n  color: #818cf8;\r\n}\r\n.sc-status-badge.discord-active .sc-status-dot {\r\n  background: #5865f2;\r\n  box-shadow: 0 0 6px rgba(88, 101, 242, 0.5);\r\n}\r\n\r\n/* Audio ad muted badge */\r\n.sc-status-badge.ad-muted {\r\n  background: rgba(239, 68, 68, 0.12);\r\n  border-color: rgba(239, 68, 68, 0.3);\r\n  color: #f87171;\r\n}\r\n.sc-status-badge.ad-muted .sc-status-dot {\r\n  background: #ef4444;\r\n  box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);\r\n}\r\n\r\n/* Update Available badge */\r\n.sc-status-badge.update-available {\r\n  background: rgba(255, 85, 0, 0.15);\r\n  border-color: var(--sc-brand-orange-border);\r\n  color: #ff9d66;\r\n  cursor: pointer;\r\n}\r\n.sc-status-badge.update-available:hover {\r\n  background: rgba(255, 85, 0, 0.25);\r\n  color: #ffffff;\r\n}\r\n.sc-status-badge.update-available .sc-status-dot {\r\n  background: var(--sc-brand-orange);\r\n  box-shadow: 0 0 6px rgba(255, 85, 0, 0.6);\r\n}\r\n\r\n/* Right: Settings and Window Controls */\r\n.sc-titlebar-right {\r\n  display: flex;\r\n  align-items: center;\r\n  height: 100%;\r\n}\r\n\r\n.sc-titlebar-btn {\r\n  background: transparent;\r\n  border: none;\r\n  outline: none;\r\n  color: var(--sc-text-secondary);\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  cursor: pointer;\r\n  transition: background-color 0.12s ease, color 0.12s ease;\r\n  height: 100%;\r\n  padding: 0 12px;\r\n  -webkit-app-region: no-drag !important;\r\n  app-region: no-drag !important;\r\n  pointer-events: auto !important;\r\n}\r\n\r\n.sc-titlebar-btn:hover {\r\n  background: rgba(255, 255, 255, 0.08);\r\n  color: var(--sc-text-primary);\r\n}\r\n\r\n.sc-titlebar-btn.active,\r\n.sc-titlebar-btn:focus-visible {\r\n  color: var(--sc-brand-orange);\r\n}\r\n\r\n.sc-titlebar-btn svg {\r\n  width: 14px;\r\n  height: 14px;\r\n  stroke: currentColor;\r\n  stroke-width: 1.5;\r\n  stroke-linecap: round;\r\n  stroke-linejoin: round;\r\n  fill: none;\r\n  pointer-events: none;\r\n}\r\n\r\n/* Window Minimize, Maximize, Close */\r\n.sc-win-btn {\r\n  width: 44px;\r\n  height: 100%;\r\n  padding: 0;\r\n  -webkit-app-region: no-drag !important;\r\n  app-region: no-drag !important;\r\n  pointer-events: auto !important;\r\n}\r\n\r\n.sc-win-close:hover {\r\n  background: #e81123 !important;\r\n  color: #ffffff !important;\r\n}\r\n\r\n.sc-win-close:active {\r\n  background: #bf0f1d !important;\r\n}\r\n\r\n/* ==========================================================================\r\n   Settings Modal Overlay\r\n   ========================================================================== */\r\n\r\n#sc-settings-overlay {\r\n  position: fixed;\r\n  inset: 0;\r\n  background: rgba(8, 8, 10, 0.65);\r\n  backdrop-filter: blur(14px);\r\n  -webkit-backdrop-filter: blur(14px);\r\n  z-index: 1000000;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  opacity: 0;\r\n  pointer-events: none;\r\n  transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1);\r\n  font-family: var(--sc-font-sans);\r\n}\r\n\r\n#sc-settings-overlay.visible {\r\n  opacity: 1;\r\n  pointer-events: auto;\r\n}\r\n\r\n.sc-settings-card {\r\n  width: 600px;\r\n  max-width: calc(100vw - 32px);\r\n  max-height: calc(100vh - 64px);\r\n  background: var(--sc-bg-surface);\r\n  border: 1px solid var(--sc-border-medium);\r\n  border-radius: 12px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.04);\r\n  transform: scale(0.97) translateY(4px);\r\n  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);\r\n  overflow: hidden;\r\n}\r\n\r\n#sc-settings-overlay.visible .sc-settings-card {\r\n  transform: scale(1) translateY(0);\r\n}\r\n\r\n/* Modal Header */\r\n.sc-modal-header {\r\n  padding: 18px 24px 14px 24px;\r\n  border-bottom: 1px solid var(--sc-border-subtle);\r\n  display: flex;\r\n  align-items: flex-start;\r\n  justify-content: space-between;\r\n  background: rgba(255, 255, 255, 0.015);\r\n}\r\n\r\n.sc-modal-title-group h2 {\r\n  margin: 0;\r\n  font-size: 16px;\r\n  font-weight: 600;\r\n  color: var(--sc-text-primary);\r\n  letter-spacing: -0.01em;\r\n}\r\n\r\n.sc-modal-title-group p {\r\n  margin: 4px 0 0 0;\r\n  font-size: 12px;\r\n  color: var(--sc-text-muted);\r\n}\r\n\r\n.sc-modal-close-btn {\r\n  background: transparent;\r\n  border: none;\r\n  color: var(--sc-text-muted);\r\n  cursor: pointer;\r\n  padding: 6px;\r\n  border-radius: 6px;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  transition: all 0.12s ease;\r\n}\r\n\r\n.sc-modal-close-btn:hover {\r\n  background: var(--sc-bg-surface-elevated);\r\n  color: var(--sc-text-primary);\r\n}\r\n\r\n/* Modal Scrollable Body */\r\n.sc-modal-body {\r\n  padding: 20px 24px;\r\n  overflow-y: auto;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 20px;\r\n}\r\n\r\n.sc-settings-section {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n}\r\n\r\n.sc-section-title {\r\n  font-size: 11px;\r\n  font-weight: 600;\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.05em;\r\n  color: var(--sc-text-muted);\r\n  margin: 0 0 2px 0;\r\n}\r\n\r\n/* Setting item row */\r\n.sc-setting-row {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  background: var(--sc-bg-surface-elevated);\r\n  border: 1px solid var(--sc-border-subtle);\r\n  border-radius: 8px;\r\n  padding: 12px 16px;\r\n  gap: 16px;\r\n  transition: border-color 0.15s ease;\r\n}\r\n\r\n.sc-setting-row:hover {\r\n  border-color: var(--sc-border-medium);\r\n}\r\n\r\n.sc-setting-info {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 3px;\r\n}\r\n\r\n.sc-setting-label {\r\n  font-size: 13px;\r\n  font-weight: 500;\r\n  color: var(--sc-text-primary);\r\n}\r\n\r\n.sc-setting-desc {\r\n  font-size: 11px;\r\n  color: var(--sc-text-muted);\r\n  line-height: 1.4;\r\n}\r\n\r\n/* Inputs within settings */\r\n.sc-input-group {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n  background: var(--sc-bg-surface-elevated);\r\n  border: 1px solid var(--sc-border-subtle);\r\n  border-radius: 8px;\r\n  padding: 12px 16px;\r\n}\r\n\r\n.sc-input-label-row {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n}\r\n\r\n.sc-input-label {\r\n  font-size: 12px;\r\n  font-weight: 500;\r\n  color: var(--sc-text-primary);\r\n}\r\n\r\n/* Proxy protocol pill selectors */\r\n.sc-protocol-pills {\r\n  display: flex;\r\n  gap: 4px;\r\n}\r\n\r\n.sc-protocol-pill {\r\n  font-size: 10px;\r\n  font-weight: 600;\r\n  padding: 2px 8px;\r\n  border-radius: 4px;\r\n  background: rgba(255, 255, 255, 0.05);\r\n  border: 1px solid var(--sc-border-subtle);\r\n  color: var(--sc-text-secondary);\r\n  cursor: pointer;\r\n  transition: all 0.12s ease;\r\n}\r\n\r\n.sc-protocol-pill:hover {\r\n  background: rgba(255, 255, 255, 0.1);\r\n  color: var(--sc-text-primary);\r\n}\r\n\r\n.sc-protocol-pill.active {\r\n  background: var(--sc-brand-orange-dim);\r\n  border-color: var(--sc-brand-orange);\r\n  color: #ff9d66;\r\n}\r\n\r\n.sc-text-input {\r\n  background: var(--sc-bg-input);\r\n  border: 1px solid var(--sc-border-subtle);\r\n  border-radius: 6px;\r\n  padding: 8px 12px;\r\n  font-size: 13px;\r\n  color: var(--sc-text-primary);\r\n  font-family: monospace, var(--sc-font-sans);\r\n  outline: none;\r\n  transition: border-color 0.15s ease, box-shadow 0.15s ease;\r\n}\r\n\r\n.sc-text-input:focus {\r\n  border-color: var(--sc-border-focus);\r\n  box-shadow: 0 0 0 2px var(--sc-brand-orange-dim);\r\n}\r\n\r\n.sc-input-hint {\r\n  font-size: 11px;\r\n  color: var(--sc-text-muted);\r\n}\r\n\r\n/* Switch Toggle Component */\r\n.sc-switch {\r\n  position: relative;\r\n  display: inline-block;\r\n  width: 40px;\r\n  height: 22px;\r\n  flex-shrink: 0;\r\n}\r\n\r\n.sc-switch input {\r\n  opacity: 0;\r\n  width: 0;\r\n  height: 0;\r\n}\r\n\r\n.sc-switch-slider {\r\n  position: absolute;\r\n  cursor: pointer;\r\n  inset: 0;\r\n  background-color: #27272e;\r\n  border-radius: 22px;\r\n  transition: background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1);\r\n  border: 1px solid var(--sc-border-subtle);\r\n}\r\n\r\n.sc-switch-slider::before {\r\n  position: absolute;\r\n  content: "";\r\n  height: 16px;\r\n  width: 16px;\r\n  left: 2px;\r\n  bottom: 2px;\r\n  background-color: #d1d1d8;\r\n  border-radius: 50%;\r\n  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease;\r\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);\r\n}\r\n\r\n.sc-switch input:checked + .sc-switch-slider {\r\n  background-color: var(--sc-brand-orange);\r\n  border-color: var(--sc-brand-orange-hover);\r\n}\r\n\r\n.sc-switch input:checked + .sc-switch-slider::before {\r\n  transform: translateX(18px);\r\n  background-color: #ffffff;\r\n}\r\n\r\n/* Notice box for proxy restart requirement */\r\n.sc-notice-banner {\r\n  background: rgba(255, 85, 0, 0.08);\r\n  border: 1px solid var(--sc-brand-orange-border);\r\n  border-radius: 8px;\r\n  padding: 10px 14px;\r\n  font-size: 11px;\r\n  color: #ff9d66;\r\n  line-height: 1.4;\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n/* Updater UI Row in Settings */\r\n.sc-updater-row {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  background: var(--sc-bg-surface-elevated);\r\n  border: 1px solid var(--sc-border-subtle);\r\n  border-radius: 8px;\r\n  padding: 12px 16px;\r\n  gap: 16px;\r\n}\r\n\r\n.sc-updater-status {\r\n  font-size: 11px;\r\n  color: var(--sc-text-muted);\r\n}\r\n\r\n.sc-updater-status.highlight {\r\n  color: #34d399;\r\n}\r\n\r\n/* Modal Footer */\r\n.sc-modal-footer {\r\n  padding: 14px 24px;\r\n  border-top: 1px solid var(--sc-border-subtle);\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  background: rgba(255, 255, 255, 0.015);\r\n}\r\n\r\n.sc-footer-actions {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n}\r\n\r\n.sc-btn {\r\n  padding: 8px 16px;\r\n  border-radius: 6px;\r\n  font-size: 13px;\r\n  font-weight: 500;\r\n  cursor: pointer;\r\n  border: none;\r\n  outline: none;\r\n  transition: all 0.15s ease;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 6px;\r\n}\r\n\r\n.sc-btn-sm {\r\n  padding: 4px 10px;\r\n  font-size: 11px;\r\n  border-radius: 4px;\r\n}\r\n\r\n.sc-btn-secondary {\r\n  background: var(--sc-bg-surface-elevated);\r\n  border: 1px solid var(--sc-border-medium);\r\n  color: var(--sc-text-secondary);\r\n}\r\n\r\n.sc-btn-secondary:hover {\r\n  background: var(--sc-bg-surface-hover);\r\n  color: var(--sc-text-primary);\r\n}\r\n\r\n.sc-btn-primary {\r\n  background: var(--sc-brand-orange);\r\n  color: #ffffff;\r\n  font-weight: 600;\r\n  box-shadow: 0 2px 8px rgba(255, 85, 0, 0.35);\r\n}\r\n\r\n.sc-btn-primary:hover {\r\n  background: var(--sc-brand-orange-hover);\r\n  box-shadow: 0 4px 12px rgba(255, 85, 0, 0.45);\r\n}\r\n\r\n.sc-btn-primary:active {\r\n  background: var(--sc-brand-orange-active);\r\n  transform: translateY(1px);\r\n}\r\n\r\n.sc-btn-restart {\r\n  background: transparent;\r\n  border: 1px solid var(--sc-brand-orange-border);\r\n  color: #ff7f36;\r\n}\r\n\r\n.sc-btn-restart:hover {\r\n  background: var(--sc-brand-orange-dim);\r\n  color: #ff9d66;\r\n}\r\n\r\n/* Toast feedback inside modal */\r\n.sc-toast {\r\n  position: absolute;\r\n  bottom: 20px;\r\n  left: 50%;\r\n  transform: translateX(-50%) translateY(20px);\r\n  background: #1e1e24;\r\n  border: 1px solid var(--sc-border-medium);\r\n  color: var(--sc-text-primary);\r\n  padding: 8px 16px;\r\n  border-radius: 20px;\r\n  font-size: 12px;\r\n  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5);\r\n  opacity: 0;\r\n  pointer-events: none;\r\n  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);\r\n  z-index: 1000001;\r\n}\r\n\r\n.sc-toast.visible {\r\n  opacity: 1;\r\n  transform: translateX(-50%) translateY(0);\r\n}\r\n\r\n/* ==========================================================================\r\n   SoundCloud AdBlocker Styling\r\n   ========================================================================== */\r\n\r\nbody.sc-adblock-enabled .soundBadge__promoted,\r\nbody.sc-adblock-enabled .soundBadge__ad,\r\nbody.sc-adblock-enabled .promotedSoundsModule,\r\nbody.sc-adblock-enabled .sidebarModule__ad,\r\nbody.sc-adblock-enabled .playControls__banner,\r\nbody.sc-adblock-enabled .header__upsell,\r\nbody.sc-adblock-enabled .modal__upsell,\r\nbody.sc-adblock-enabled .upsellBanner,\r\nbody.sc-adblock-enabled .trackUpsell,\r\nbody.sc-adblock-enabled .m-upsell,\r\nbody.sc-adblock-enabled .mobileAppsBanner,\r\nbody.sc-adblock-enabled .announcementBanner,\r\nbody.sc-adblock-enabled .streamSidebar__promoted,\r\nbody.sc-adblock-enabled div[data-testid="ad-item"],\r\nbody.sc-adblock-enabled div[data-testid="sidebar-ad"],\r\nbody.sc-adblock-enabled .nativeAudioAd {\r\n  display: none !important;\r\n  visibility: hidden !important;\r\n  height: 0 !important;\r\n  min-height: 0 !important;\r\n  padding: 0 !important;\r\n  margin: 0 !important;\r\n  opacity: 0 !important;\r\n  pointer-events: none !important;\r\n}\r\n\r\n/* ==========================================================================\r\n   SoundCloud Deep Dark Theme\r\n   High-contrast charcoal & midnight surfaces, preserving artwork and waveforms.\r\n   ========================================================================== */\r\n\r\nhtml.sc-dark-theme,\r\nbody.sc-dark-theme {\r\n  background-color: #0f0f11 !important;\r\n  color: #e4e4e7 !important;\r\n}\r\n\r\n/* Main background containers */\r\nbody.sc-dark-theme #content,\r\nbody.sc-dark-theme .l-container,\r\nbody.sc-dark-theme .l-listen-hero,\r\nbody.sc-dark-theme .listenDetails,\r\nbody.sc-dark-theme .l-fluid-content,\r\nbody.sc-dark-theme .sc-selection-content {\r\n  background-color: #0f0f11 !important;\r\n}\r\n\r\n/* Top SoundCloud header */\r\nbody.sc-dark-theme .header,\r\nbody.sc-dark-theme #header {\r\n  background: #141416 !important;\r\n  border-bottom: 1px solid #222226 !important;\r\n}\r\n\r\nbody.sc-dark-theme .header__navMenu a,\r\nbody.sc-dark-theme .header__link {\r\n  color: #a1a1aa !important;\r\n}\r\n\r\nbody.sc-dark-theme .header__navMenu a.selected,\r\nbody.sc-dark-theme .header__navMenu a:hover {\r\n  color: #ffffff !important;\r\n}\r\n\r\nbody.sc-dark-theme .headerSearch__input {\r\n  background: #1a1a1e !important;\r\n  border: 1px solid #2a2a30 !important;\r\n  color: #f4f4f5 !important;\r\n}\r\n\r\n/* Player bar at bottom */\r\nbody.sc-dark-theme .playControls,\r\nbody.sc-dark-theme .playControls__wrapper,\r\nbody.sc-dark-theme .playControls__bg {\r\n  background: #141417 !important;\r\n  border-top: 1px solid #242429 !important;\r\n}\r\n\r\nbody.sc-dark-theme .playbackSoundBadge__titleLink {\r\n  color: #f4f4f5 !important;\r\n}\r\n\r\nbody.sc-dark-theme .playbackSoundBadge__lightLink {\r\n  color: #a1a1aa !important;\r\n}\r\n\r\nbody.sc-dark-theme .playbackTimeline__timePassed,\r\nbody.sc-dark-theme .playbackTimeline__duration {\r\n  color: #71717a !important;\r\n}\r\n\r\n/* Track cards, rows, badges */\r\nbody.sc-dark-theme .sound__body,\r\nbody.sc-dark-theme .trackItem,\r\nbody.sc-dark-theme .trackList__item {\r\n  background-color: transparent !important;\r\n}\r\n\r\nbody.sc-dark-theme .soundList__item {\r\n  border-bottom: 1px solid #1c1c20 !important;\r\n}\r\n\r\nbody.sc-dark-theme .trackItem:hover,\r\nbody.sc-dark-theme .trackItem.active {\r\n  background-color: #18181c !important;\r\n}\r\n\r\nbody.sc-dark-theme .sidebarModule {\r\n  background-color: #141417 !important;\r\n  border: 1px solid #222226 !important;\r\n  border-radius: 8px !important;\r\n  padding: 14px !important;\r\n}\r\n\r\nbody.sc-dark-theme .sidebarModule .sidebarHeader {\r\n  border-bottom: 1px solid #222226 !important;\r\n}\r\n\r\n/* Comments, user rows, inputs */\r\nbody.sc-dark-theme .commentForm__wrapper,\r\nbody.sc-dark-theme .commentForm__input {\r\n  background-color: #18181c !important;\r\n  border-color: #27272a !important;\r\n  color: #f4f4f5 !important;\r\n}\r\n\r\n/* Buttons in dark theme */\r\nbody.sc-dark-theme .sc-button-medium,\r\nbody.sc-dark-theme .sc-button-small {\r\n  background-color: #1a1a1f !important;\r\n  border-color: #2a2a30 !important;\r\n  color: #e4e4e7 !important;\r\n}\r\n\r\nbody.sc-dark-theme .sc-button-medium:hover,\r\nbody.sc-dark-theme .sc-button-small:hover {\r\n  background-color: #24242a !important;\r\n  color: #ffffff !important;\r\n}\r\n\r\n/* Waveform Canvas & Artwork: MUST PRESERVE VISIBILITY & ORIGINAL COLORS */\r\nbody.sc-dark-theme .waveformCommentsNode,\r\nbody.sc-dark-theme .waveformCommentsNode canvas {\r\n  filter: none !important;\r\n  opacity: 0.95;\r\n}\r\n\r\nbody.sc-dark-theme .sc-artwork,\r\nbody.sc-dark-theme .image__light,\r\nbody.sc-dark-theme .visualSound__wrapper,\r\nbody.sc-dark-theme img {\r\n  filter: none !important;\r\n}\r\n\r\n/* Active states for Shuffle, Repeat and Like buttons in Deep Dark Theme */\r\nbody.sc-dark-theme .playControls .shuffleControl.m-shuffling,\r\nbody.sc-dark-theme .playControls .shuffleControl[aria-checked="true"],\r\nbody.sc-dark-theme .playControls .repeatControl.m-one,\r\nbody.sc-dark-theme .playControls .repeatControl.m-all,\r\nbody.sc-dark-theme .playbackSoundBadge__like.sc-button-selected,\r\nbody.sc-dark-theme .playbackSoundBadge__like[aria-pressed="true"],\r\nbody.sc-dark-theme .sc-button-like.sc-button-selected,\r\nbody.sc-dark-theme .sc-button-like[aria-pressed="true"] {\r\n  color: #ff5500 !important;\r\n  border-color: rgba(255, 85, 0, 0.45) !important;\r\n  background-color: rgba(255, 85, 0, 0.14) !important;\r\n}\r\n\r\nbody.sc-dark-theme .playControls .shuffleControl.m-shuffling svg,\r\nbody.sc-dark-theme .playControls .shuffleControl[aria-checked="true"] svg,\r\nbody.sc-dark-theme .playControls .repeatControl.m-one svg,\r\nbody.sc-dark-theme .playControls .repeatControl.m-all svg,\r\nbody.sc-dark-theme .playbackSoundBadge__like.sc-button-selected svg,\r\nbody.sc-dark-theme .playbackSoundBadge__like[aria-pressed="true"] svg,\r\nbody.sc-dark-theme .sc-button-like.sc-button-selected svg,\r\nbody.sc-dark-theme .sc-button-like[aria-pressed="true"] svg {\r\n  fill: #ff5500 !important;\r\n  color: #ff5500 !important;\r\n}\r\n';
    }
  });

  // injected/ipc.ts
  async function invokeTauri(cmd, args = {}) {
    const w = window;
    const invokeFn = w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke;
    if (typeof invokeFn === "function") {
      try {
        return await invokeFn(cmd, args);
      } catch (err2) {
        console.error(`[SC-Desktop IPC] Command '${cmd}' failed:`, err2);
        throw err2;
      }
    }
    const err = new Error(`[SC-Desktop IPC] Tauri invoke is unavailable for '${cmd}'. Verify withGlobalTauri and capability permissions.`);
    console.error(err);
    throw err;
  }
  async function fetchSettings() {
    return invokeTauri("get_settings");
  }
  async function persistSettings(newSettings) {
    return invokeTauri("save_settings", { newSettings });
  }
  async function sendTrackToDiscord(payload) {
    return invokeTauri("update_discord_rpc", { payload });
  }
  async function clearDiscordPresence() {
    return invokeTauri("clear_discord_rpc");
  }
  async function getDiscordRpcStatus() {
    return invokeTauri("get_discord_rpc_status");
  }
  async function sendWindowAction(action) {
    return invokeTauri("window_action", { action });
  }
  async function requestAppRestart() {
    return invokeTauri("restart_app");
  }
  async function checkUpdate() {
    return invokeTauri("check_update");
  }
  async function installUpdate() {
    return invokeTauri("install_update");
  }
  var init_ipc = __esm({
    "injected/ipc.ts"() {
    }
  });

  // injected/titlebar.ts
  var Titlebar;
  var init_titlebar = __esm({
    "injected/titlebar.ts"() {
      init_ipc();
      Titlebar = class {
        constructor(callbacks) {
          __publicField(this, "callbacks", callbacks);
          __publicField(this, "container", null);
          __publicField(this, "proxyBadge", null);
          __publicField(this, "discordBadge", null);
          __publicField(this, "adBadge", null);
          __publicField(this, "updateBadge", null);
          __publicField(this, "settingsBtn", null);
        }
        mount() {
          if (document.getElementById("sc-desktop-titlebar")) {
            return;
          }
          document.body.classList.add("sc-desktop-active");
          const bar = document.createElement("div");
          bar.id = "sc-desktop-titlebar";
          bar.setAttribute("data-tauri-drag-region", "true");
          const left = document.createElement("div");
          left.className = "sc-titlebar-left";
          left.setAttribute("data-tauri-drag-region", "true");
          const svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svgIcon.setAttribute("viewBox", "0 0 24 24");
          svgIcon.classList.add("sc-brand-icon");
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute(
            "d",
            "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
          );
          svgIcon.appendChild(path);
          const titleText = document.createElement("span");
          titleText.className = "sc-brand-title";
          titleText.textContent = "SoundCloud";
          const subText = document.createElement("span");
          subText.className = "sc-brand-sub";
          subText.textContent = "Desktop";
          left.appendChild(svgIcon);
          left.appendChild(titleText);
          left.appendChild(subText);
          const center = document.createElement("div");
          center.className = "sc-titlebar-center";
          center.setAttribute("data-tauri-drag-region", "true");
          const proxyBadge = document.createElement("span");
          proxyBadge.className = "sc-status-badge sc-no-drag";
          proxyBadge.setAttribute("data-tauri-drag-region", "false");
          const proxyDot = document.createElement("span");
          proxyDot.className = "sc-status-dot";
          const proxyText = document.createElement("span");
          proxyText.textContent = "Direct";
          proxyBadge.appendChild(proxyDot);
          proxyBadge.appendChild(proxyText);
          this.proxyBadge = proxyBadge;
          const discordBadge = document.createElement("span");
          discordBadge.className = "sc-status-badge sc-no-drag";
          discordBadge.setAttribute("data-tauri-drag-region", "false");
          const discordDot = document.createElement("span");
          discordDot.className = "sc-status-dot";
          const discordText = document.createElement("span");
          discordText.textContent = "Discord Off";
          discordBadge.appendChild(discordDot);
          discordBadge.appendChild(discordText);
          this.discordBadge = discordBadge;
          const adBadge = document.createElement("span");
          adBadge.className = "sc-status-badge sc-no-drag ad-muted";
          adBadge.setAttribute("data-tauri-drag-region", "false");
          adBadge.style.display = "none";
          const adDot = document.createElement("span");
          adDot.className = "sc-status-dot";
          const adText = document.createElement("span");
          adText.textContent = "Ad Muted";
          adBadge.appendChild(adDot);
          adBadge.appendChild(adText);
          this.adBadge = adBadge;
          const updateBadge = document.createElement("span");
          updateBadge.className = "sc-status-badge sc-no-drag update-available";
          updateBadge.setAttribute("data-tauri-drag-region", "false");
          updateBadge.style.display = "none";
          const updateDot = document.createElement("span");
          updateDot.className = "sc-status-dot";
          const updateText = document.createElement("span");
          updateText.textContent = "Update";
          updateBadge.appendChild(updateDot);
          updateBadge.appendChild(updateText);
          updateBadge.addEventListener("mousedown", (e) => e.stopPropagation());
          updateBadge.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.callbacks.onOpenUpdate) {
              this.callbacks.onOpenUpdate();
            } else {
              this.callbacks.onOpenSettings();
            }
          });
          this.updateBadge = updateBadge;
          center.appendChild(proxyBadge);
          center.appendChild(discordBadge);
          center.appendChild(adBadge);
          center.appendChild(updateBadge);
          const right = document.createElement("div");
          right.className = "sc-titlebar-right sc-no-drag";
          right.setAttribute("data-tauri-drag-region", "false");
          const settingsBtn = document.createElement("button");
          settingsBtn.className = "sc-titlebar-btn sc-no-drag";
          settingsBtn.title = "Settings (Ctrl+,)";
          settingsBtn.setAttribute("aria-label", "Open Settings");
          settingsBtn.setAttribute("data-tauri-drag-region", "false");
          const gearSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          gearSvg.setAttribute("viewBox", "0 0 24 24");
          const gearPath1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          gearPath1.setAttribute("cx", "12");
          gearPath1.setAttribute("cy", "12");
          gearPath1.setAttribute("r", "3");
          const gearPath2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
          gearPath2.setAttribute(
            "d",
            "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
          );
          gearSvg.appendChild(gearPath1);
          gearSvg.appendChild(gearPath2);
          settingsBtn.appendChild(gearSvg);
          settingsBtn.addEventListener("mousedown", (e) => e.stopPropagation());
          settingsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.callbacks.onOpenSettings();
          });
          this.settingsBtn = settingsBtn;
          const minBtn = document.createElement("button");
          minBtn.className = "sc-titlebar-btn sc-win-btn sc-no-drag";
          minBtn.title = "Minimize";
          minBtn.setAttribute("aria-label", "Minimize Window");
          minBtn.setAttribute("data-tauri-drag-region", "false");
          const minSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          minSvg.setAttribute("viewBox", "0 0 16 16");
          const minLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
          minLine.setAttribute("x1", "3");
          minLine.setAttribute("y1", "8");
          minLine.setAttribute("x2", "13");
          minLine.setAttribute("y2", "8");
          minSvg.appendChild(minLine);
          minBtn.appendChild(minSvg);
          minBtn.addEventListener("mousedown", (e) => e.stopPropagation());
          minBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            sendWindowAction("minimize").catch(console.error);
          });
          const maxBtn = document.createElement("button");
          maxBtn.className = "sc-titlebar-btn sc-win-btn sc-no-drag";
          maxBtn.title = "Maximize / Restore";
          maxBtn.setAttribute("aria-label", "Maximize or Restore Window");
          maxBtn.setAttribute("data-tauri-drag-region", "false");
          const maxSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          maxSvg.setAttribute("viewBox", "0 0 16 16");
          const maxRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          maxRect.setAttribute("x", "3.5");
          maxRect.setAttribute("y", "3.5");
          maxRect.setAttribute("width", "9");
          maxRect.setAttribute("height", "9");
          maxSvg.appendChild(maxRect);
          maxBtn.appendChild(maxSvg);
          maxBtn.addEventListener("mousedown", (e) => e.stopPropagation());
          maxBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            sendWindowAction("toggle_maximize").catch(console.error);
          });
          const closeBtn = document.createElement("button");
          closeBtn.className = "sc-titlebar-btn sc-win-btn sc-win-close sc-no-drag";
          closeBtn.title = "Close";
          closeBtn.setAttribute("aria-label", "Close Window");
          closeBtn.setAttribute("data-tauri-drag-region", "false");
          const closeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          closeSvg.setAttribute("viewBox", "0 0 16 16");
          const closeLine1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
          closeLine1.setAttribute("x1", "4");
          closeLine1.setAttribute("y1", "4");
          closeLine1.setAttribute("x2", "12");
          closeLine1.setAttribute("y2", "12");
          const closeLine2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
          closeLine2.setAttribute("x1", "12");
          closeLine2.setAttribute("y1", "4");
          closeLine2.setAttribute("x2", "4");
          closeLine2.setAttribute("y2", "12");
          closeSvg.appendChild(closeLine1);
          closeSvg.appendChild(closeLine2);
          closeBtn.appendChild(closeSvg);
          closeBtn.addEventListener("mousedown", (e) => e.stopPropagation());
          closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            sendWindowAction("close").catch(console.error);
          });
          right.appendChild(settingsBtn);
          right.appendChild(minBtn);
          right.appendChild(maxBtn);
          right.appendChild(closeBtn);
          bar.appendChild(left);
          bar.appendChild(center);
          bar.appendChild(right);
          document.body.prepend(bar);
          this.container = bar;
        }
        updateProxyBadge(enabled) {
          if (!this.proxyBadge) return;
          const textSpan = this.proxyBadge.querySelector("span:not(.sc-status-dot)");
          if (enabled) {
            this.proxyBadge.classList.add("proxy-active");
            if (textSpan) textSpan.textContent = "Proxy Active";
          } else {
            this.proxyBadge.classList.remove("proxy-active");
            if (textSpan) textSpan.textContent = "Direct";
          }
        }
        updateDiscordBadge(enabled) {
          if (!this.discordBadge) return;
          const textSpan = this.discordBadge.querySelector("span:not(.sc-status-dot)");
          if (enabled) {
            this.discordBadge.classList.add("discord-active");
            if (textSpan) textSpan.textContent = "Discord RPC";
          } else {
            this.discordBadge.classList.remove("discord-active");
            if (textSpan) textSpan.textContent = "Discord Off";
          }
        }
        updateAdMutedBadge(muted) {
          if (!this.adBadge) return;
          this.adBadge.style.display = muted ? "inline-flex" : "none";
        }
        updateAvailableBadge(version) {
          if (!this.updateBadge) return;
          const textSpan = this.updateBadge.querySelector("span:not(.sc-status-dot)");
          if (version) {
            this.updateBadge.style.display = "inline-flex";
            if (textSpan) textSpan.textContent = `Update v${version}`;
          } else {
            this.updateBadge.style.display = "none";
          }
        }
        setSettingsActive(active) {
          if (!this.settingsBtn) return;
          if (active) {
            this.settingsBtn.classList.add("active");
          } else {
            this.settingsBtn.classList.remove("active");
          }
        }
      };
    }
  });

  // injected/settings-modal.ts
  var DEFAULT_SETTINGS, SettingsModal;
  var init_settings_modal = __esm({
    "injected/settings-modal.ts"() {
      init_ipc();
      DEFAULT_SETTINGS = {
        proxy_enabled: false,
        proxy_url: "socks5://127.0.0.1:10808",
        discord_rpc_enabled: true,
        discord_app_id: "1572112482062045194",
        adblock_enabled: true,
        dark_theme_enabled: true,
        minimize_to_tray: true
      };
      SettingsModal = class {
        constructor(callbacks) {
          __publicField(this, "callbacks", callbacks);
          __publicField(this, "overlay", null);
          __publicField(this, "currentSettings", { ...DEFAULT_SETTINGS });
          __publicField(this, "toastTimer", null);
          __publicField(this, "isLoadedFromBackend", false);
          // Form controls
          __publicField(this, "proxyToggle");
          __publicField(this, "proxyUrlInput");
          __publicField(this, "selectedProtocol", "socks5");
          __publicField(this, "protocolPills", /* @__PURE__ */ new Map());
          __publicField(this, "discordToggle");
          __publicField(this, "discordStatusBadge");
          __publicField(this, "discordStatusDot");
          __publicField(this, "discordStatusText");
          __publicField(this, "discordStatusPollTimer", null);
          __publicField(this, "darkThemeToggle");
          __publicField(this, "adblockToggle");
          __publicField(this, "minimizeToTrayToggle");
          __publicField(this, "toastEl");
          // Updater elements
          __publicField(this, "updaterStatusText");
          __publicField(this, "updaterActionBtn");
          __publicField(this, "pendingUpdate", null);
          this.mount();
          this.bindShortcuts();
          this.loadBackendSettings().catch(console.error);
        }
        async loadBackendSettings() {
          try {
            const backendSettings = await fetchSettings();
            this.currentSettings = { ...backendSettings };
            this.isLoadedFromBackend = true;
            this.syncFormWithCurrent();
            this.callbacks.onSettingsChanged(this.currentSettings);
          } catch (err) {
            console.warn("[SC-Desktop] Using default settings, backend fetch failed:", err);
          }
          return this.currentSettings;
        }
        getSettings() {
          return this.currentSettings;
        }
        open() {
          if (!this.overlay) return;
          this.syncFormWithCurrent();
          this.overlay.classList.add("visible");
          if (!this.isLoadedFromBackend) {
            this.loadBackendSettings().catch(console.error);
          }
          this.pollDiscordRpcStatus();
          if (this.discordStatusPollTimer) {
            window.clearInterval(this.discordStatusPollTimer);
          }
          this.discordStatusPollTimer = window.setInterval(() => {
            this.pollDiscordRpcStatus();
          }, 2e3);
        }
        close() {
          if (!this.overlay) return;
          this.overlay.classList.remove("visible");
          if (this.discordStatusPollTimer) {
            window.clearInterval(this.discordStatusPollTimer);
            this.discordStatusPollTimer = null;
          }
          this.callbacks.onClose();
        }
        toggle() {
          if (!this.overlay) return;
          if (this.overlay.classList.contains("visible")) {
            this.close();
          } else {
            this.open();
          }
        }
        syncFormWithCurrent() {
          this.proxyToggle.checked = this.currentSettings.proxy_enabled;
          this.proxyUrlInput.value = this.currentSettings.proxy_url;
          this.updateActiveProtocolPill(this.currentSettings.proxy_url);
          this.discordToggle.checked = this.currentSettings.discord_rpc_enabled;
          this.darkThemeToggle.checked = this.currentSettings.dark_theme_enabled;
          this.adblockToggle.checked = this.currentSettings.adblock_enabled;
          this.minimizeToTrayToggle.checked = this.currentSettings.minimize_to_tray;
          if (!this.currentSettings.discord_rpc_enabled) {
            this.updateDiscordBadgeStatus("disabled");
          }
        }
        updateActiveProtocolPill(url) {
          const trimmed = url.trim().toLowerCase();
          let matched = "";
          if (trimmed.startsWith("https://")) matched = "https";
          else if (trimmed.startsWith("http://")) matched = "http";
          else if (trimmed.startsWith("socks4://") || trimmed.startsWith("socks4a://")) matched = "socks4";
          else if (trimmed.startsWith("socks5://") || trimmed.startsWith("socks5h://")) matched = "socks5";
          if (matched) {
            this.selectedProtocol = matched;
          }
          this.protocolPills.forEach((pill, proto) => {
            if (proto.toLowerCase() === this.selectedProtocol) {
              pill.classList.add("active");
            } else {
              pill.classList.remove("active");
            }
          });
        }
        normalizeProxyUrl(raw) {
          let trimmed = raw.trim();
          if (!trimmed) {
            return `${this.selectedProtocol}://127.0.0.1:10808`;
          }
          const schemeRegex = /^[a-zA-Z0-9+-]+:\/\//;
          if (schemeRegex.test(trimmed)) {
            return trimmed;
          }
          return `${this.selectedProtocol}://${trimmed}`;
        }
        setProtocol(newProto) {
          this.selectedProtocol = newProto.toLowerCase();
          let current = this.proxyUrlInput.value.trim();
          if (current) {
            const schemeRegex = /^[a-zA-Z0-9+-]+:\/\//;
            if (schemeRegex.test(current)) {
              current = current.replace(schemeRegex, `${this.selectedProtocol}://`);
            } else {
              current = `${this.selectedProtocol}://${current}`;
            }
            this.proxyUrlInput.value = current;
          }
          this.updateActiveProtocolPill(current);
        }
        mount() {
          if (document.getElementById("sc-settings-overlay")) return;
          const overlay = document.createElement("div");
          overlay.id = "sc-settings-overlay";
          overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
              this.close();
            }
          });
          const card = document.createElement("div");
          card.className = "sc-settings-card";
          const header = document.createElement("div");
          header.className = "sc-modal-header";
          const titleGroup = document.createElement("div");
          titleGroup.className = "sc-modal-title-group";
          const h2 = document.createElement("h2");
          h2.textContent = "Settings";
          const subtitle = document.createElement("p");
          subtitle.textContent = "Configure desktop client features, proxy, Discord presence, and updater";
          titleGroup.appendChild(h2);
          titleGroup.appendChild(subtitle);
          const closeBtn = document.createElement("button");
          closeBtn.className = "sc-modal-close-btn";
          closeBtn.title = "Close (Esc)";
          closeBtn.setAttribute("aria-label", "Close Settings");
          const closeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          closeSvg.setAttribute("viewBox", "0 0 16 16");
          closeSvg.style.width = "14px";
          closeSvg.style.height = "14px";
          closeSvg.style.stroke = "currentColor";
          closeSvg.style.strokeWidth = "1.5";
          const l1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
          l1.setAttribute("x1", "3");
          l1.setAttribute("y1", "3");
          l1.setAttribute("x2", "13");
          l1.setAttribute("y2", "13");
          const l2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
          l2.setAttribute("x1", "13");
          l2.setAttribute("y1", "3");
          l2.setAttribute("x2", "3");
          l2.setAttribute("y2", "13");
          closeSvg.appendChild(l1);
          closeSvg.appendChild(l2);
          closeBtn.appendChild(closeSvg);
          closeBtn.addEventListener("click", () => this.close());
          header.appendChild(titleGroup);
          header.appendChild(closeBtn);
          const body = document.createElement("div");
          body.className = "sc-modal-body";
          const netSection = document.createElement("div");
          netSection.className = "sc-settings-section";
          const netTitle = document.createElement("div");
          netTitle.className = "sc-section-title";
          netTitle.textContent = "Network & Proxy";
          netSection.appendChild(netTitle);
          const proxyRow = this.createToggleRow(
            "Enable WebView Proxy",
            "Route SoundCloud traffic through HTTP, HTTPS, SOCKS4, or SOCKS5 proxies cleanly without system-wide changes.",
            (chk) => this.proxyToggle = chk
          );
          netSection.appendChild(proxyRow);
          const proxyInputGroup = document.createElement("div");
          proxyInputGroup.className = "sc-input-group";
          const proxyLabelRow = document.createElement("div");
          proxyLabelRow.className = "sc-input-label-row";
          const proxyLabel = document.createElement("label");
          proxyLabel.className = "sc-input-label";
          proxyLabel.textContent = "Proxy Server Address";
          const pillsContainer = document.createElement("div");
          pillsContainer.className = "sc-protocol-pills";
          const protocols = ["HTTP", "HTTPS", "SOCKS4", "SOCKS5"];
          protocols.forEach((proto) => {
            const pill = document.createElement("button");
            pill.type = "button";
            pill.className = "sc-protocol-pill";
            pill.textContent = proto;
            pill.addEventListener("click", () => {
              this.setProtocol(proto.toLowerCase());
            });
            this.protocolPills.set(proto.toLowerCase(), pill);
            pillsContainer.appendChild(pill);
          });
          proxyLabelRow.appendChild(proxyLabel);
          proxyLabelRow.appendChild(pillsContainer);
          const proxyInput = document.createElement("input");
          proxyInput.type = "text";
          proxyInput.className = "sc-text-input";
          proxyInput.placeholder = "socks5://127.0.0.1:10808 or http://user:pass@host:port";
          proxyInput.addEventListener("input", () => {
            this.updateActiveProtocolPill(proxyInput.value);
          });
          this.proxyUrlInput = proxyInput;
          const proxyHint = document.createElement("span");
          proxyHint.className = "sc-input-hint";
          proxyHint.textContent = "Supports http://, https://, socks4://, socks4a://, socks5://, and socks5h:// schemes.";
          proxyInputGroup.appendChild(proxyLabelRow);
          proxyInputGroup.appendChild(proxyInput);
          proxyInputGroup.appendChild(proxyHint);
          netSection.appendChild(proxyInputGroup);
          const proxyNotice = document.createElement("div");
          proxyNotice.className = "sc-notice-banner";
          const noticeIcon = document.createElement("span");
          noticeIcon.textContent = "\u2139";
          const noticeText = document.createElement("span");
          noticeText.textContent = 'WebView proxy changes require creating a fresh window. Click "Save & Restart" below to apply proxy edits.';
          proxyNotice.appendChild(noticeIcon);
          proxyNotice.appendChild(noticeText);
          netSection.appendChild(proxyNotice);
          body.appendChild(netSection);
          const discordSection = document.createElement("div");
          discordSection.className = "sc-settings-section";
          const discordTitle = document.createElement("div");
          discordTitle.className = "sc-section-title";
          discordTitle.textContent = "Discord Rich Presence";
          discordSection.appendChild(discordTitle);
          const discordRow = this.createDiscordToggleRow(
            "Broadcast Playback to Discord",
            "Show your current track title, artist, high-res artwork, and live progress bar in Discord.",
            (chk) => this.discordToggle = chk
          );
          discordSection.appendChild(discordRow);
          body.appendChild(discordSection);
          const enhanceSection = document.createElement("div");
          enhanceSection.className = "sc-settings-section";
          const enhanceTitle = document.createElement("div");
          enhanceTitle.className = "sc-section-title";
          enhanceTitle.textContent = "Enhancements & Behavior";
          enhanceSection.appendChild(enhanceTitle);
          const darkThemeRow = this.createToggleRow(
            "Deep Dark Theme",
            "Re-skins SoundCloud into a refined charcoal dark theme while keeping waveforms and cover artwork crisp.",
            (chk) => this.darkThemeToggle = chk
          );
          enhanceSection.appendChild(darkThemeRow);
          const adblockRow = this.createToggleRow(
            "SoundCloud AdBlocker",
            "Block audio ads between tracks and hide sponsored banners.",
            (chk) => this.adblockToggle = chk
          );
          enhanceSection.appendChild(adblockRow);
          const trayRow = this.createToggleRow(
            "Minimize to System Tray",
            "Closing the window hides it into the taskbar notification area instead of quitting.",
            (chk) => this.minimizeToTrayToggle = chk
          );
          enhanceSection.appendChild(trayRow);
          body.appendChild(enhanceSection);
          const updateSection = document.createElement("div");
          updateSection.className = "sc-settings-section";
          const updateTitle = document.createElement("div");
          updateTitle.className = "sc-section-title";
          updateTitle.textContent = "Updates & Version";
          updateSection.appendChild(updateTitle);
          const updaterRow = document.createElement("div");
          updaterRow.className = "sc-updater-row";
          const updaterInfo = document.createElement("div");
          updaterInfo.className = "sc-setting-info";
          const versionLabel = document.createElement("span");
          versionLabel.className = "sc-setting-label";
          versionLabel.textContent = "Desktop Client Version";
          const statusText = document.createElement("span");
          statusText.className = "sc-updater-status";
          statusText.textContent = "App version: v0.1.3";
          this.updaterStatusText = statusText;
          updaterInfo.appendChild(versionLabel);
          updaterInfo.appendChild(statusText);
          const updateBtn = document.createElement("button");
          updateBtn.type = "button";
          updateBtn.className = "sc-btn sc-btn-secondary sc-btn-sm";
          updateBtn.textContent = "Check for Updates";
          updateBtn.addEventListener("click", () => this.handleUpdaterAction());
          this.updaterActionBtn = updateBtn;
          updaterRow.appendChild(updaterInfo);
          updaterRow.appendChild(updateBtn);
          updateSection.appendChild(updaterRow);
          body.appendChild(updateSection);
          const footer = document.createElement("div");
          footer.className = "sc-modal-footer";
          const restartBtn = document.createElement("button");
          restartBtn.className = "sc-btn sc-btn-restart";
          restartBtn.textContent = "Save & Restart";
          restartBtn.title = "Saves configuration and restarts the desktop app (required for proxy changes)";
          restartBtn.addEventListener("click", async () => {
            await this.saveCurrentForm();
            this.showToast("Restarting application...");
            await requestAppRestart();
          });
          const actionsGroup = document.createElement("div");
          actionsGroup.className = "sc-footer-actions";
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "sc-btn sc-btn-secondary";
          cancelBtn.textContent = "Cancel";
          cancelBtn.addEventListener("click", () => this.close());
          const saveBtn = document.createElement("button");
          saveBtn.className = "sc-btn sc-btn-primary";
          saveBtn.textContent = "Save Settings";
          saveBtn.addEventListener("click", async () => {
            await this.saveCurrentForm();
            this.showToast("Settings saved");
            setTimeout(() => this.close(), 400);
          });
          actionsGroup.appendChild(cancelBtn);
          actionsGroup.appendChild(saveBtn);
          footer.appendChild(restartBtn);
          footer.appendChild(actionsGroup);
          const toast = document.createElement("div");
          toast.className = "sc-toast";
          this.toastEl = toast;
          card.appendChild(header);
          card.appendChild(body);
          card.appendChild(footer);
          card.appendChild(toast);
          overlay.appendChild(card);
          document.body.appendChild(overlay);
          this.overlay = overlay;
          this.syncFormWithCurrent();
        }
        async checkForUpdates(silent = false) {
          if (!silent) {
            this.updaterStatusText.textContent = "Checking for updates...";
            this.updaterStatusText.className = "sc-updater-status";
          }
          try {
            const info = await checkUpdate();
            if (!silent) {
              this.updaterStatusText.textContent = `Current: v${info.current_version}`;
            }
            if (info.available && info.version) {
              this.pendingUpdate = info;
              this.updaterStatusText.textContent = `Update v${info.version} is available!`;
              this.updaterStatusText.className = "sc-updater-status highlight";
              this.updaterActionBtn.textContent = "Install & Restart";
              this.updaterActionBtn.className = "sc-btn sc-btn-primary sc-btn-sm";
              if (this.callbacks.onUpdateAvailable) {
                this.callbacks.onUpdateAvailable(info.version);
              }
              return info;
            } else {
              if (!silent) {
                this.updaterStatusText.textContent = `Up to date (v${info.current_version})`;
                this.showToast("SoundCloud Desktop is up to date");
              }
              return null;
            }
          } catch (err) {
            if (!silent) {
              this.updaterStatusText.textContent = "Update check failed";
              this.showToast("Unable to check for updates");
            }
            return null;
          }
        }
        async handleUpdaterAction() {
          if (this.pendingUpdate && this.pendingUpdate.available) {
            this.updaterStatusText.textContent = "Downloading and verifying update...";
            this.updaterActionBtn.disabled = true;
            try {
              await installUpdate();
            } catch (err) {
              this.updaterStatusText.textContent = "Installation failed";
              this.updaterActionBtn.disabled = false;
              this.showToast("Failed to install update");
            }
          } else {
            await this.checkForUpdates(false);
          }
        }
        createToggleRow(label, description, setRef) {
          const row = document.createElement("div");
          row.className = "sc-setting-row";
          const info = document.createElement("div");
          info.className = "sc-setting-info";
          const labelSpan = document.createElement("span");
          labelSpan.className = "sc-setting-label";
          labelSpan.textContent = label;
          const descSpan = document.createElement("span");
          descSpan.className = "sc-setting-desc";
          descSpan.textContent = description;
          info.appendChild(labelSpan);
          info.appendChild(descSpan);
          const switchLabel = document.createElement("label");
          switchLabel.className = "sc-switch";
          const input = document.createElement("input");
          input.type = "checkbox";
          const slider = document.createElement("span");
          slider.className = "sc-switch-slider";
          switchLabel.appendChild(input);
          switchLabel.appendChild(slider);
          setRef(input);
          row.appendChild(info);
          row.appendChild(switchLabel);
          return row;
        }
        createDiscordToggleRow(label, description, setRef) {
          const row = document.createElement("div");
          row.className = "sc-setting-row";
          const info = document.createElement("div");
          info.className = "sc-setting-info";
          const labelSpan = document.createElement("span");
          labelSpan.className = "sc-setting-label";
          labelSpan.textContent = label;
          const descSpan = document.createElement("span");
          descSpan.className = "sc-setting-desc";
          descSpan.textContent = description;
          info.appendChild(labelSpan);
          info.appendChild(descSpan);
          const rightContainer = document.createElement("div");
          rightContainer.style.display = "flex";
          rightContainer.style.alignItems = "center";
          rightContainer.style.gap = "12px";
          const badge = document.createElement("span");
          badge.className = "sc-status-badge";
          badge.style.display = "inline-flex";
          badge.style.alignItems = "center";
          badge.style.gap = "6px";
          badge.style.padding = "3px 9px";
          badge.style.borderRadius = "999px";
          badge.style.fontSize = "11px";
          badge.style.fontWeight = "500";
          badge.style.transition = "all 0.2s ease";
          const dot = document.createElement("span");
          dot.className = "sc-status-dot";
          dot.style.width = "6px";
          dot.style.height = "6px";
          dot.style.borderRadius = "50%";
          dot.style.flexShrink = "0";
          const badgeText = document.createElement("span");
          badgeText.textContent = "Waiting for Discord desktop app...";
          badge.appendChild(dot);
          badge.appendChild(badgeText);
          this.discordStatusBadge = badge;
          this.discordStatusDot = dot;
          this.discordStatusText = badgeText;
          const switchLabel = document.createElement("label");
          switchLabel.className = "sc-switch";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.addEventListener("change", () => {
            if (!input.checked) {
              this.updateDiscordBadgeStatus("disabled");
            } else {
              this.pollDiscordRpcStatus();
            }
          });
          const slider = document.createElement("span");
          slider.className = "sc-switch-slider";
          switchLabel.appendChild(input);
          switchLabel.appendChild(slider);
          setRef(input);
          rightContainer.appendChild(badge);
          rightContainer.appendChild(switchLabel);
          row.appendChild(info);
          row.appendChild(rightContainer);
          return row;
        }
        updateDiscordBadgeStatus(status) {
          if (!this.discordStatusBadge || !this.discordStatusDot || !this.discordStatusText) return;
          if (!this.discordToggle.checked || status === "disabled") {
            this.discordStatusText.textContent = "Disabled";
            this.discordStatusBadge.style.background = "rgba(255, 255, 255, 0.04)";
            this.discordStatusBadge.style.borderColor = "rgba(255, 255, 255, 0.08)";
            this.discordStatusBadge.style.color = "#8e8e98";
            this.discordStatusDot.style.background = "#6b6b78";
            this.discordStatusDot.style.boxShadow = "none";
            return;
          }
          switch (status) {
            case "connected":
              this.discordStatusText.textContent = "Connected to Discord";
              this.discordStatusBadge.style.background = "rgba(16, 185, 129, 0.12)";
              this.discordStatusBadge.style.borderColor = "rgba(16, 185, 129, 0.3)";
              this.discordStatusBadge.style.color = "#34d399";
              this.discordStatusDot.style.background = "#10b981";
              this.discordStatusDot.style.boxShadow = "0 0 6px rgba(16, 185, 129, 0.5)";
              break;
            case "permission_denied":
              this.discordStatusText.textContent = "Access denied \u2014 Discord is running as Administrator";
              this.discordStatusBadge.style.background = "rgba(239, 68, 68, 0.12)";
              this.discordStatusBadge.style.borderColor = "rgba(239, 68, 68, 0.3)";
              this.discordStatusBadge.style.color = "#f87171";
              this.discordStatusDot.style.background = "#ef4444";
              this.discordStatusDot.style.boxShadow = "0 0 6px rgba(239, 68, 68, 0.5)";
              break;
            case "waiting_for_discord":
            default:
              this.discordStatusText.textContent = "Waiting for Discord desktop app...";
              this.discordStatusBadge.style.background = "rgba(245, 158, 11, 0.12)";
              this.discordStatusBadge.style.borderColor = "rgba(245, 158, 11, 0.3)";
              this.discordStatusBadge.style.color = "#fbbf24";
              this.discordStatusDot.style.background = "#f59e0b";
              this.discordStatusDot.style.boxShadow = "0 0 6px rgba(245, 158, 11, 0.5)";
              break;
          }
        }
        async pollDiscordRpcStatus() {
          if (!this.overlay?.classList.contains("visible")) return;
          if (!this.discordToggle.checked) {
            this.updateDiscordBadgeStatus("disabled");
            return;
          }
          try {
            const status = await getDiscordRpcStatus();
            this.updateDiscordBadgeStatus(status);
          } catch (err) {
            console.warn("[SC-Desktop] Failed to get Discord RPC status:", err);
          }
        }
        async saveCurrentForm() {
          const rawUrl = this.proxyUrlInput.value.trim();
          const normalizedUrl = this.normalizeProxyUrl(rawUrl);
          this.proxyUrlInput.value = normalizedUrl;
          this.updateActiveProtocolPill(normalizedUrl);
          const newSettings = {
            proxy_enabled: this.proxyToggle.checked,
            proxy_url: normalizedUrl,
            discord_rpc_enabled: this.discordToggle.checked,
            discord_app_id: "1572112482062045194",
            adblock_enabled: this.adblockToggle.checked,
            dark_theme_enabled: this.darkThemeToggle.checked,
            minimize_to_tray: this.minimizeToTrayToggle.checked,
            proxy_active: this.currentSettings.proxy_active
          };
          const saved = await persistSettings(newSettings);
          this.currentSettings = saved;
          this.callbacks.onSettingsChanged(saved);
          if (!newSettings.discord_rpc_enabled) {
            this.updateDiscordBadgeStatus("disabled");
          } else {
            this.pollDiscordRpcStatus();
          }
          return saved;
        }
        showToast(msg) {
          if (!this.toastEl) return;
          this.toastEl.textContent = msg;
          this.toastEl.classList.add("visible");
          if (this.toastTimer) {
            window.clearTimeout(this.toastTimer);
          }
          this.toastTimer = window.setTimeout(() => {
            this.toastEl.classList.remove("visible");
          }, 2e3);
        }
        bindShortcuts() {
          window.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === ",") {
              e.preventDefault();
              this.toggle();
            }
            if (e.key === "Escape" && this.overlay?.classList.contains("visible")) {
              e.preventDefault();
              this.close();
            }
          });
        }
      };
    }
  });

  // injected/dark-theme.ts
  var DarkThemeManager;
  var init_dark_theme = __esm({
    "injected/dark-theme.ts"() {
      DarkThemeManager = class {
        constructor(initialEnabled) {
          __publicField(this, "enabled", false);
          this.setEnabled(initialEnabled);
        }
        setEnabled(enabled) {
          this.enabled = enabled;
          if (this.enabled) {
            document.documentElement.classList.add("sc-dark-theme");
            document.body?.classList.add("sc-dark-theme");
          } else {
            document.documentElement.classList.remove("sc-dark-theme");
            document.body?.classList.remove("sc-dark-theme");
          }
        }
        isEnabled() {
          return this.enabled;
        }
      };
    }
  });

  // injected/adblocker.ts
  function isAdUrl(url) {
    let rawStr = "";
    if (typeof url === "string") {
      rawStr = url;
    } else if (url instanceof URL) {
      rawStr = url.href;
    } else if (typeof Request !== "undefined" && url instanceof Request) {
      rawStr = url.url;
    }
    if (!rawStr) return false;
    try {
      const parsed = new URL(rawStr, window.location.origin);
      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname.toLowerCase();
      if (host === "media.soundcloud.com" || host.endsWith(".media.soundcloud.com") || host.endsWith(".sndcdn.com") && host !== "wis.sndcdn.com" || pathname.startsWith("/tracks") || pathname.includes("/stream")) {
        return false;
      }
      if (host === "api-v2.soundcloud.com" && pathname.startsWith("/audio-ad")) {
        return true;
      }
      if (host === "promote.soundcloud.com") {
        return true;
      }
      if (host === "wis.sndcdn.com" || host === "doubleclick.net" || host.endsWith(".doubleclick.net") || host === "googlesyndication.com" || host.endsWith(".googlesyndication.com") || host === "adswizz.com" || host.endsWith(".adswizz.com")) {
        return true;
      }
    } catch {
      const lower = rawStr.toLowerCase();
      if (lower.includes("api-v2.soundcloud.com/audio-ad") || lower.includes("promote.soundcloud.com") || lower.includes("wis.sndcdn.com") || lower.includes("doubleclick.net") || lower.includes("googlesyndication.com") || lower.includes("adswizz.com")) {
        return true;
      }
    }
    return false;
  }
  var isAdBlockingActive, isMainWindow, AdBlocker;
  var init_adblocker = __esm({
    "injected/adblocker.ts"() {
      isAdBlockingActive = true;
      isMainWindow = typeof window !== "undefined" && window.top === window.self && window.opener === null;
      if (isMainWindow) {
        const originalFetch = window.fetch;
        window.fetch = async function(input, init) {
          if (isAdBlockingActive && isAdUrl(input)) {
            const urlText = typeof input === "string" ? input : input.url || "";
            console.log("[SC-Desktop] AdBlock intercepted ad request:", urlText);
            return new Response("{}", {
              status: 200,
              statusText: "OK",
              headers: {
                "Content-Type": "application/json",
                "X-AdBlock-Intercepted": "true"
              }
            });
          }
          return originalFetch.apply(this, [input, init]);
        };
        const originalXhrOpen = XMLHttpRequest.prototype.open;
        const originalXhrSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          if (isAdBlockingActive && isAdUrl(url)) {
            this.__is_ad_blocked = true;
            console.log("[SC-Desktop] AdBlock intercepted XHR ad request:", url.toString());
          }
          return originalXhrOpen.apply(this, [method, url, ...rest]);
        };
        XMLHttpRequest.prototype.send = function(body) {
          if (this.__is_ad_blocked) {
            Object.defineProperty(this, "readyState", { value: 4, writable: true, configurable: true });
            Object.defineProperty(this, "status", { value: 200, writable: true, configurable: true });
            Object.defineProperty(this, "statusText", { value: "OK", writable: true, configurable: true });
            Object.defineProperty(this, "response", { value: "{}", writable: true, configurable: true });
            Object.defineProperty(this, "responseText", { value: "{}", writable: true, configurable: true });
            queueMicrotask(() => {
              const readystateEvent = new Event("readystatechange");
              this.dispatchEvent(readystateEvent);
              if (typeof this.onreadystatechange === "function") {
                this.onreadystatechange(readystateEvent);
              }
              const loadEvent = new ProgressEvent("load");
              this.dispatchEvent(loadEvent);
              if (typeof this.onload === "function") {
                this.onload(loadEvent);
              }
              const loadEndEvent = new ProgressEvent("loadend");
              this.dispatchEvent(loadEndEvent);
              if (typeof this.onloadend === "function") {
                this.onloadend(loadEndEvent);
              }
            });
            return;
          }
          return originalXhrSend.apply(this, arguments);
        };
      }
      AdBlocker = class {
        constructor(initialEnabled, callbacks) {
          __publicField(this, "callbacks", callbacks);
          __publicField(this, "enabled", false);
          __publicField(this, "checkInterval", null);
          this.setEnabled(initialEnabled);
          this.startWatcher();
        }
        setEnabled(enabled) {
          this.enabled = enabled;
          isAdBlockingActive = enabled;
          if (this.enabled) {
            document.body?.classList.add("sc-adblock-enabled");
            this.dismissUpsellModals();
          } else {
            document.body?.classList.remove("sc-adblock-enabled");
          }
          if (this.callbacks?.onAdMutedChanged) {
            this.callbacks.onAdMutedChanged(false);
          }
        }
        startWatcher() {
          if (this.checkInterval) {
            window.clearInterval(this.checkInterval);
          }
          this.checkInterval = window.setInterval(() => {
            if (this.enabled) {
              this.dismissUpsellModals();
            }
          }, 1e3);
        }
        /**
         * Safely dismisses intrusive Go+ upsell modals and prompts without affecting audio playback.
         */
        dismissUpsellModals() {
          const upsellModal = document.querySelector(".modal__upsell, .upsellBanner, .trackUpsell");
          if (upsellModal) {
            const closeBtn = upsellModal.querySelector(
              "button.modal__closeButton, .modal__closeButton, button.dismiss"
            );
            if (closeBtn) {
              closeBtn.click();
            }
          }
        }
      };
    }
  });

  // injected/scraper.ts
  var Scraper;
  var init_scraper = __esm({
    "injected/scraper.ts"() {
      init_ipc();
      Scraper = class {
        constructor(initialEnabled) {
          __publicField(this, "lastSentTrack", null);
          __publicField(this, "observer", null);
          __publicField(this, "observedPlayer", null);
          __publicField(this, "attachObserverRetryTimer", null);
          __publicField(this, "syncTimer", null);
          __publicField(this, "immediateDebounceTimer", null);
          __publicField(this, "lastSentTime", 0);
          __publicField(this, "isEnabled", true);
          this.setEnabled(initialEnabled);
          this.registerGlobalControls();
          this.initAudioListeners();
          this.initObserver();
          this.startInterval();
        }
        setEnabled(enabled) {
          this.isEnabled = enabled;
          if (!this.isEnabled) {
            this.lastSentTrack = null;
            clearDiscordPresence().catch(() => {
            });
          } else {
            this.triggerImmediate();
          }
        }
        registerGlobalControls() {
          window.__sc_toggle_playback = () => {
            const player = document.querySelector(".playControls");
            const playBtn = player?.querySelector(
              ".playControls__play, button.playControl"
            );
            if (playBtn) {
              playBtn.click();
            }
          };
          window.__sc_next_track = () => {
            const player = document.querySelector(".playControls");
            const nextBtn = player?.querySelector(
              ".skipControl__next, button.skipControl__next"
            );
            if (nextBtn) {
              nextBtn.click();
            }
          };
        }
        initAudioListeners() {
          const handleAudioEvent = () => {
            this.triggerImmediate();
          };
          document.addEventListener("play", handleAudioEvent, true);
          document.addEventListener("pause", handleAudioEvent, true);
          document.addEventListener("seeked", handleAudioEvent, true);
          document.addEventListener("loadedmetadata", handleAudioEvent, true);
          document.addEventListener("ended", handleAudioEvent, true);
        }
        initObserver() {
          const tryAttach = () => {
            const player = document.querySelector(".playControls");
            if (!player) {
              if (this.attachObserverRetryTimer === null) {
                this.attachObserverRetryTimer = window.setInterval(() => {
                  const el = document.querySelector(".playControls");
                  if (el) {
                    if (this.attachObserverRetryTimer !== null) {
                      window.clearInterval(this.attachObserverRetryTimer);
                      this.attachObserverRetryTimer = null;
                    }
                    this.observePlayer(el);
                  }
                }, 500);
              }
              return;
            }
            if (this.attachObserverRetryTimer !== null) {
              window.clearInterval(this.attachObserverRetryTimer);
              this.attachObserverRetryTimer = null;
            }
            this.observePlayer(player);
          };
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", tryAttach);
          } else {
            tryAttach();
          }
        }
        observePlayer(player) {
          if (this.observer) {
            this.observer.disconnect();
          }
          this.observedPlayer = player;
          this.observer = new MutationObserver((mutations) => {
            let relevantMutation = false;
            for (const m of mutations) {
              if (m.type === "childList" || m.type === "attributes" && (m.attributeName === "class" || m.attributeName === "title" || m.attributeName === "aria-label" || m.attributeName === "href")) {
                relevantMutation = true;
                break;
              }
            }
            if (relevantMutation) {
              this.triggerImmediate();
            }
          });
          this.observer.observe(player, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
              "class",
              "style",
              "title",
              "aria-label",
              "aria-valuenow",
              "aria-valuemax",
              "href"
            ]
          });
          this.triggerImmediate();
        }
        startInterval() {
          if (this.syncTimer) {
            window.clearInterval(this.syncTimer);
          }
          this.syncTimer = window.setInterval(() => {
            const player = document.querySelector(".playControls");
            if (player && (!this.observedPlayer || !this.observedPlayer.isConnected || this.observedPlayer !== player)) {
              this.observePlayer(player);
            }
            this.syncNow(false);
          }, 2e3);
        }
        /**
         * Fast debounce (<50ms) to coalesce synchronous DOM mutations into a single immediate IPC call.
         */
        triggerImmediate() {
          if (!this.isEnabled) return;
          if (this.immediateDebounceTimer) {
            window.clearTimeout(this.immediateDebounceTimer);
          }
          this.immediateDebounceTimer = window.setTimeout(() => {
            this.immediateDebounceTimer = null;
            this.syncNow(true);
          }, 40);
        }
        syncNow(forceOrImmediate = false) {
          if (!this.isEnabled) return;
          const track = this.scrapeCurrentTrack();
          if (!track || !track.title) {
            if (this.lastSentTrack !== null) {
              this.lastSentTrack = null;
              clearDiscordPresence().catch(() => {
              });
            }
            return;
          }
          const identityOrStateChanged = !this.lastSentTrack || track.title !== this.lastSentTrack.title || track.artist !== this.lastSentTrack.artist || track.is_playing !== this.lastSentTrack.is_playing || track.cover_url !== this.lastSentTrack.cover_url || track.track_url !== this.lastSentTrack.track_url;
          if (identityOrStateChanged) {
            this.lastSentTrack = { ...track };
            this.lastSentTime = Date.now();
            sendTrackToDiscord(track).catch((err) => {
              console.warn("[SC-Desktop] Error updating Discord RPC:", err);
            });
            return;
          }
          const now = Date.now();
          const timeSinceLastSend = now - this.lastSentTime;
          const elapsedDrift = Math.abs(track.elapsed_sec - this.lastSentTrack.elapsed_sec);
          if (forceOrImmediate && elapsedDrift >= 2 || timeSinceLastSend >= 4500 && elapsedDrift >= 4) {
            this.lastSentTrack = { ...track };
            this.lastSentTime = now;
            sendTrackToDiscord(track).catch((err) => {
              console.warn("[SC-Desktop] Error updating Discord RPC:", err);
            });
          }
        }
        scrapeCurrentTrack() {
          const player = document.querySelector(".playControls");
          if (!player) return null;
          const titleLink = player.querySelector(".playbackSoundBadge__titleLink");
          if (!titleLink) return null;
          let rawTitle = titleLink.getAttribute("title") || titleLink.querySelector('span[aria-hidden="true"]')?.textContent || titleLink.textContent || "";
          let title = rawTitle.replace(/^current\s*track:?\s*/i, "").trim();
          if (!title) return null;
          const artistLink = player.querySelector(".playbackSoundBadge__lightLink");
          let artist = (artistLink?.getAttribute("title") || artistLink?.textContent || "SoundCloud").trim();
          const playBtn = player.querySelector(
            ".playControls__play, button.playControl"
          );
          const is_playing = playBtn ? playBtn.classList.contains("playing") || playBtn.getAttribute("aria-label")?.toLowerCase().includes("pause") === true : false;
          const progressWrapper = player.querySelector(
            ".playbackTimeline__progressWrapper"
          );
          const elapsed_sec = Math.floor(
            parseFloat(progressWrapper?.getAttribute("aria-valuenow") || "0")
          );
          const duration_sec = Math.floor(
            parseFloat(progressWrapper?.getAttribute("aria-valuemax") || "0")
          );
          let cover_url = null;
          const avatarSpans = player.querySelectorAll(
            ".playbackSoundBadge__avatar span, .playbackSoundBadge__avatar div"
          );
          for (const el of Array.from(avatarSpans)) {
            const bg = el.style.backgroundImage || window.getComputedStyle(el).backgroundImage || "";
            const match = bg.match(/url\(["']?(https:\/\/[^"')]+)["']?\)/i);
            if (match && match[1]) {
              let rawUrl = match[1];
              rawUrl = rawUrl.replace(/-t(50|120|200)x\1\./, "-t500x500.");
              if (rawUrl.startsWith("https://")) {
                cover_url = rawUrl;
                break;
              }
            }
          }
          let track_url = null;
          const relHref = titleLink.getAttribute("href");
          if (relHref) {
            if (relHref.startsWith("https://soundcloud.com/")) {
              track_url = relHref;
            } else if (relHref.startsWith("/")) {
              track_url = `https://soundcloud.com${relHref}`;
            }
          }
          return {
            title,
            artist,
            cover_url,
            track_url,
            is_playing,
            elapsed_sec,
            duration_sec
          };
        }
      };
    }
  });

  // injected/index.ts
  var require_index = __commonJS({
    "injected/index.ts"() {
      init_styles();
      init_titlebar();
      init_settings_modal();
      init_dark_theme();
      init_adblocker();
      init_scraper();
      (function initSoundCloudDesktop() {
        try {
          const uaData = navigator.userAgentData;
          if (uaData && Array.isArray(uaData.brands)) {
            const cleanBrands = uaData.brands.filter(
              (b) => !String(b.brand || "").toLowerCase().includes("webview")
            );
            Object.defineProperty(navigator, "userAgentData", {
              value: new Proxy(uaData, {
                get(target, prop) {
                  if (prop === "brands") return cleanBrands;
                  const val = Reflect.get(target, prop);
                  return typeof val === "function" ? val.bind(target) : val;
                }
              }),
              configurable: true
            });
          }
        } catch {
        }
        if (window.top !== window.self) {
          return;
        }
        if (window.opener !== null) {
          const nativeClose = window.close.bind(window);
          window.close = function() {
            try {
              window.location.href = "https://close.scdesktop.invalid/";
            } catch {
            }
            try {
              nativeClose();
            } catch {
            }
          };
          return;
        }
        if (window.__SC_DESKTOP_INITIALIZED__) {
          return;
        }
        window.__SC_DESKTOP_INITIALIZED__ = true;
        console.log("[SC-Desktop] Bootstrapping native desktop wrapper...");
        function injectStyles() {
          if (document.getElementById("sc-desktop-custom-styles")) return;
          const styleEl = document.createElement("style");
          styleEl.id = "sc-desktop-custom-styles";
          styleEl.textContent = styles_default;
          const target = document.head || document.documentElement;
          target.appendChild(styleEl);
        }
        function start() {
          injectStyles();
          let titlebar;
          let modal;
          let darkTheme;
          let adBlocker;
          let scraper;
          titlebar = new Titlebar({
            onOpenSettings: () => {
              modal.open();
              titlebar.setSettingsActive(true);
            },
            onOpenUpdate: () => {
              modal.open();
              titlebar.setSettingsActive(true);
            }
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
            }
          });
          titlebar.mount();
          const initialSettings = modal.getSettings();
          darkTheme = new DarkThemeManager(initialSettings.dark_theme_enabled);
          adBlocker = new AdBlocker(initialSettings.adblock_enabled, {
            onAdMutedChanged: (muted) => {
              titlebar.updateAdMutedBadge(muted);
            }
          });
          scraper = new Scraper(initialSettings.discord_rpc_enabled);
          titlebar.updateProxyBadge(!!(initialSettings.proxy_enabled && initialSettings.proxy_active));
          titlebar.updateDiscordBadge(initialSettings.discord_rpc_enabled);
          window.setTimeout(() => {
            modal.checkForUpdates(true).catch(console.error);
          }, 5e3);
          console.log("[SC-Desktop] Client initialization completed.");
        }
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", start);
        } else {
          start();
        }
      })();
    }
  });
  require_index();
})();
