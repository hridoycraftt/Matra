import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadSettings, saveSettings, SETTINGS_KEY } from "./storage";
import type { Provider, Settings } from "./types";

/** True inside the real Matra.app (Tauri webview); false in a plain browser (dev / tests). */
export const inApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const devKey = (p: Provider) => `matra.devApiKey.${p}`;

/**
 * API keys live in the macOS Keychain inside the app, one per provider.
 * In a plain browser (dev preview and tests only) they fall back to localStorage.
 */
export async function loadApiKey(provider: Provider): Promise<string | null> {
  if (inApp) return (await invoke<string | null>("get_api_key", { provider })) ?? null;
  try {
    return localStorage.getItem(devKey(provider));
  } catch {
    return null;
  }
}

export async function saveApiKey(provider: Provider, key: string): Promise<void> {
  if (inApp) await invoke("set_api_key", { provider, key });
  else {
    try {
      localStorage.setItem(devKey(provider), key);
    } catch {
      /* storage blocked: key lives for this session only */
    }
  }
  window.dispatchEvent(new CustomEvent("matra:keys-changed"));
}

export async function clearApiKey(provider: Provider): Promise<void> {
  if (inApp) await invoke("delete_api_key", { provider });
  else {
    try {
      localStorage.removeItem(devKey(provider));
    } catch {
      /* ignore */
    }
  }
  window.dispatchEvent(new CustomEvent("matra:keys-changed"));
}

/** The key for the active provider. Re-read when keys change or the window regains focus. */
export function useApiKey(provider: Provider): [string | null, (k: string | null) => void] {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      loadApiKey(provider)
        .then((k) => alive && setKey(k))
        .catch(() => alive && setKey(null));
    load();
    window.addEventListener("matra:keys-changed", load);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.removeEventListener("matra:keys-changed", load);
      window.removeEventListener("focus", load);
    };
  }, [provider]);
  return [key, setKey];
}

/** Settings shared by every Matra window (they share localStorage). */
export function useSettings(): [Settings, (s: Settings) => void] {
  const [settings, setState] = useState<Settings>(loadSettings);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === SETTINGS_KEY && setState(loadSettings());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return [
    settings,
    (s) => {
      setState(s);
      saveSettings(s);
    },
  ];
}

/** Listen to an event sent from the Rust side. Returns an unsubscribe function. No-op in the browser. */
export function onAppEvent<T>(name: string, handler: (payload: T) => void): () => void {
  if (!inApp) return () => undefined;
  let off: (() => void) | undefined;
  let cancelled = false;
  import("@tauri-apps/api/event").then(({ listen }) =>
    listen<T>(name, (e) => handler(e.payload)).then((un) => {
      if (cancelled) un();
      else off = un;
    }),
  );
  return () => {
    cancelled = true;
    off?.();
  };
}
