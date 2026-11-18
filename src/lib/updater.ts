import { inApp } from "./platform";

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "uptodate"; checkedAt: number }
  | { status: "available"; version: string; notes: string; date?: string }
  | { status: "downloading"; version: string; downloaded: number; total: number | null }
  | { status: "ready"; version: string }
  | { status: "error"; message: string }
  | { status: "unsupported" };

export async function currentVersion(): Promise<string> {
  if (!inApp) return `${__APP_VERSION__} (browser preview)`;
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

type PendingUpdate = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>;
let pending: PendingUpdate = null;

/** Asks GitHub Releases (latest.json) whether a newer signed build exists. */
export async function checkForUpdate(): Promise<UpdateState> {
  if (!inApp) return { status: "unsupported" };
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    pending = await check();
    if (!pending) return { status: "uptodate", checkedAt: Date.now() };
    return { status: "available", version: pending.version, notes: pending.body ?? "", date: pending.date };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Downloads, verifies the signature, installs, then relaunches Matra. */
export async function installUpdate(onState: (s: UpdateState) => void): Promise<void> {
  if (!pending) return;
  const version = pending.version;
  let downloaded = 0;
  let total: number | null = null;
  try {
    await pending.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? null;
        onState({ status: "downloading", version, downloaded: 0, total });
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        onState({ status: "downloading", version, downloaded, total });
      } else if (event.event === "Finished") {
        onState({ status: "ready", version });
      }
    });
    onState({ status: "ready", version });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    onState({ status: "error", message: e instanceof Error ? e.message : String(e) });
  }
}
