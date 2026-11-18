import { invoke } from "@tauri-apps/api/core";

/** True inside the real Matra.app (Tauri webview); false in a plain browser (dev / tests). */
export const inApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const DEV_KEY = "matra.devApiKey";

/**
 * The API key lives in the macOS Keychain inside the app.
 * In a plain browser (dev and tests only) it falls back to localStorage.
 */
export async function loadApiKey(): Promise<string | null> {
  if (inApp) return (await invoke<string | null>("get_api_key")) ?? null;
  try {
    return localStorage.getItem(DEV_KEY);
  } catch {
    return null;
  }
}

export async function saveApiKey(key: string): Promise<void> {
  if (inApp) return invoke("set_api_key", { key });
  try {
    localStorage.setItem(DEV_KEY, key);
  } catch {
    /* storage blocked: key lives for this session only */
  }
}

export async function clearApiKey(): Promise<void> {
  if (inApp) return invoke("delete_api_key");
  try {
    localStorage.removeItem(DEV_KEY);
  } catch {
    /* ignore */
  }
}
