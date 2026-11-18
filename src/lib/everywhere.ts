import { invoke } from "@tauri-apps/api/core";
import { inApp } from "./platform";
import type { Settings } from "./types";

/** A text field the user is typing in, in another app (reported by the Rust watcher). */
export interface FieldInfo {
  app: string;
  pid: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  field_id: number;
}

export type BadgeState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "issues"; count: number }
  | { status: "clean" }
  | { status: "error" };

export async function accessibilityStatus(prompt: boolean): Promise<boolean> {
  if (!inApp) return false;
  return invoke<boolean>("accessibility_status", { prompt });
}

/** Remove a stale permission entry from an older Matra build, then ask macOS again. */
export const resetAccessibility = () => (inApp ? invoke<boolean>("reset_accessibility") : Promise.resolve(false));

export const openAccessibilitySettings = () => (inApp ? invoke("open_accessibility_settings") : Promise.resolve());

export function configureEverywhere(s: Settings) {
  if (!inApp) return Promise.resolve();
  return invoke("configure_everywhere", {
    config: { enabled: s.everywhere, autoOpen: s.autoOpenPanel, ignoredApps: s.ignoredApps, badgeOffsets: s.badgeOffsets },
  });
}

export const currentField = () => (inApp ? invoke<FieldInfo | null>("current_field") : Promise.resolve(null));
export const writeField = (text: string) => (inApp ? invoke<string>("write_field", { text }) : Promise.resolve("preview"));
export type PanelMode = "card" | "full";

/** Show the panel next to the field. In "card" mode it is a small single-suggestion card. */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const showPanel = (focus: boolean, mode: PanelMode, height?: number, anchor?: ScreenRect) =>
  inApp ? invoke("show_panel", { focus, mode, height, anchor }) : Promise.resolve();

/** Tell the watcher which spans to underline inside the other app. */
export const setUnderlines = (marks: { id: string; start: number; len: number; category: string }[]) =>
  inApp ? invoke("set_underlines", { underlines: marks }) : Promise.resolve();

/** Ask the panel window (the checker) to switch mode and show itself. Used by the badge. */
export async function openPanel(mode: PanelMode | "write") {
  if (!inApp) return;
  const { emitTo } = await import("@tauri-apps/api/event");
  await emitTo("panel", "matra://mode", mode);
  // The panel decides its final size (an empty field gets the small card) and shows itself.
}

/** Badge drag: start, then finish to get [app, dx, dy] for the spot the user chose. */
export const badgeDrag = (start: boolean) =>
  inApp ? invoke<[string, number, number] | null>("badge_drag", { start }) : Promise.resolve(null);

export const badgeExpand = (expanded: boolean) => (inApp ? invoke("badge_expand", { expanded }) : Promise.resolve());

/** Show or hide the badge on the field (it only appears after the user has typed). */
export const setBadge = (visible: boolean) => (inApp ? invoke("set_badge", { visible }) : Promise.resolve());

/** Give keyboard focus back to the app the user is writing in, keeping the panel open. */
export const focusSource = () => (inApp ? invoke("focus_source") : Promise.resolve());
export const hidePanel = () => (inApp ? invoke("hide_panel") : Promise.resolve());
export const openMain = (settings: boolean) => (inApp ? invoke("open_main", { settings }) : Promise.resolve());

export async function sendBadge(state: BadgeState) {
  if (!inApp) return;
  const { emitTo } = await import("@tauri-apps/api/event");
  await emitTo("badge", "matra://badge", state);
}

export const autostart = {
  async isEnabled() {
    const m = await import("@tauri-apps/plugin-autostart");
    return m.isEnabled();
  },
  async enable() {
    const m = await import("@tauri-apps/plugin-autostart");
    return m.enable();
  },
  async disable() {
    const m = await import("@tauri-apps/plugin-autostart");
    return m.disable();
  },
};
