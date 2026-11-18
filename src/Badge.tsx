import { useEffect, useRef, useState } from "react";
import { badgeDrag, openPanel, type BadgeState } from "./lib/everywhere";
import { inApp, onAppEvent } from "./lib/platform";
import { loadSettings, saveSettings } from "./lib/storage";

const DRAG_THRESHOLD = 4;

/**
 * The small floating button on other apps' text fields. Click it to open Matra;
 * drag it anywhere and Matra keeps it there for that app.
 */
export default function Badge() {
  const [state, setState] = useState<BadgeState>(inApp ? { status: "idle" } : { status: "issues", count: 3 });
  const [dragging, setDragging] = useState(false);
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    document.documentElement.classList.add("is-badge");
    return onAppEvent<BadgeState>("matra://badge", setState);
  }, []);

  const startDrag = async () => {
    dragged.current = true;
    setDragging(true);
    await badgeDrag(true);
    if (!inApp) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    // The window moves natively; the drag is over once moves stop for a moment.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = async () => {
      unlisten();
      setDragging(false);
      const spot = await badgeDrag(false);
      if (spot) {
        const [app, dx, dy] = spot;
        const s = loadSettings();
        saveSettings({ ...s, badgeOffsets: { ...s.badgeOffsets, [app.toLowerCase()]: [dx, dy] } });
      }
    };
    const unlisten = await win.onMoved(() => {
      clearTimeout(timer);
      timer = setTimeout(finish, 350);
    });
    timer = setTimeout(finish, 1200);
    await win.startDragging();
  };

  const label =
    state.status === "issues"
      ? `${state.count} suggestion${state.count === 1 ? "" : "s"} — click to open, drag to move`
      : state.status === "checking"
        ? "Matra is checking"
        : state.status === "clean"
          ? "No suggestions"
          : "Open Matra — drag to move";

  return (
    <button
      className={`badge-btn badge-${state.status}${dragging ? " is-dragging" : ""}`}
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
        dragged.current = false;
      }}
      onPointerMove={(e) => {
        const d = down.current;
        if (!d || dragged.current || !(e.buttons & 1)) return;
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_THRESHOLD) startDrag();
      }}
      onPointerUp={() => {
        down.current = null;
      }}
      onClick={() => {
        if (dragged.current) return; // a drag is not a click
        openPanel(state.status === "issues" ? "card" : "full");
      }}
    >
      {state.status === "issues" ? (
        <span className="badge-count">{state.count > 99 ? "99+" : state.count}</span>
      ) : state.status === "clean" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 12.5l4.5 4.5L19.5 6.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M19 50V24l13 16 13-16v26" fill="none" stroke="currentColor" strokeWidth="7" strokeLinejoin="bevel" />
          <rect x="12" y="13" width="40" height="7" rx="2" fill="#ea4c89" />
        </svg>
      )}
    </button>
  );
}
