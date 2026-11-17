import { AppSettings, TrackMetadata, UpdateInfo } from './types';

export async function invokeTauri<T = unknown>(
  cmd: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const w = window as any;
  const invokeFn = w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke;

  if (typeof invokeFn === 'function') {
    try {
      return await invokeFn(cmd, args);
    } catch (err) {
      console.error(`[SC-Desktop IPC] Command '${cmd}' failed:`, err);
      throw err;
    }
  }

  const err = new Error(`[SC-Desktop IPC] Tauri invoke is unavailable for '${cmd}'. Verify withGlobalTauri and capability permissions.`);
  console.error(err);
  throw err;
}

export async function fetchSettings(): Promise<AppSettings> {
  return invokeTauri<AppSettings>('get_settings');
}

export async function persistSettings(newSettings: AppSettings): Promise<AppSettings> {
  return invokeTauri<AppSettings>('save_settings', { newSettings });
}

export async function sendTrackToDiscord(payload: TrackMetadata): Promise<void> {
  return invokeTauri<void>('update_discord_rpc', { payload });
}

export async function clearDiscordPresence(): Promise<void> {
  return invokeTauri<void>('clear_discord_rpc');
}

export async function sendWindowAction(action: 'minimize' | 'maximize' | 'toggle_maximize' | 'close'): Promise<void> {
  return invokeTauri<void>('window_action', { action });
}

export async function requestAppRestart(): Promise<void> {
  return invokeTauri<void>('restart_app');
}

export async function checkUpdate(): Promise<UpdateInfo> {
  return invokeTauri<UpdateInfo>('check_update');
}

export async function installUpdate(): Promise<boolean> {
  return invokeTauri<boolean>('install_update');
}
