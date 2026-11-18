import { useEffect, useRef, useState } from "react";
import { IconCheck, IconPower, IconSpark } from "./components/Icons";
import { badgeDrag, badgeExpand, currentField, openPanel, type BadgeState } from "./lib/everywhere";
import { inApp, onAppEvent } from "./lib/platform";
import { loadSettings, saveSettings } from "./lib/storage";

const DRAG_THRESHOLD = 4;

/**
 * The floating helper on other apps' text fields: a quiet dot that shows Matra is
 * there, a count when there are suggestions, and on hover a pill of quick actions.
 * Drag it anywhere; Matra keeps it there for that app.
 */
export default function Badge() {
  const preview = !inApp;
  const [state, setState] = useState<BadgeState>(preview ? { status: "issues", count: 3 } : { status: "idle" });
  const [expanded, setExpanded] = useState(preview && new URLSearchParams(location.search).has("open"));
  const [dragging, setDragging] = useState(false);
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    document.documentElement.classList.add("is-badge");
    return onAppEvent<BadgeState>("matra://badge", setState);
  }, []);

  const expand = (on: boolean) => {
    clearTimeout(collapseTimer.current);
    if (on === expanded) return;
    setExpanded(on);
    badgeExpand(on);
  };

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

  const turnOffHere = async () => {
    const f = await currentField();
    if (!f) return;
    const s = loadSettings();
    saveSettings({ ...s, ignoredApps: [...new Set([...s.ignoredApps, f.app])] });
    expand(false);
  };

  const openMatra = () => {
    expand(false);
    openPanel(state.status === "issues" ? "card" : "full");
  };

  const dotLabel =
    state.status === "issues"
      ? `${state.count} suggestion${state.count === 1 ? "" : "s"}`
      : state.status === "checking"
        ? "Matra is checking…"
        : state.status === "clean"
          ? "Looks good"
          : "Matra";

  return (
    <div
      className={`badge-wrap${expanded ? " is-open" : ""}`}
      onPointerEnter={() => !dragging && expand(true)}
      onPointerLeave={() => {
        collapseTimer.current = setTimeout(() => expand(false), 450);
      }}
    >
      {expanded && (
        <div className="badge-actions" role="toolbar" aria-label="Matra quick actions">
          <button className="badge-action" aria-label="Turn off Matra in this app" title="Turn off in this app" onClick={turnOffHere}>
            <IconPower size={14} />
          </button>
          <button
            className="badge-action"
            aria-label="Write with AI"
            title="Write with AI"
            onClick={() => {
              expand(false);
              openPanel("write");
            }}
          >
            <IconSpark size={14} />
          </button>
        </div>
      )}
      <button
        className={`badge-btn badge-${state.status}${dragging ? " is-dragging" : ""}${expanded ? " is-big" : ""}`}
        aria-label={`${dotLabel} — open Matra (drag to move)`}
        title={expanded ? "Open Matra · drag to move" : dotLabel}
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
          if (!expanded && state.status !== "issues") return expand(true); // first tap shows the actions
          openMatra();
        }}
      >
        {state.status === "issues" ? (
          <span className="badge-count">{state.count > 99 ? "99+" : state.count}</span>
        ) : state.status === "clean" && !expanded ? (
          <IconCheck size={13} />
        ) : expanded || state.status === "checking" ? (
          <svg width="15" height="15" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M19 50V24l13 16 13-16v26" fill="none" stroke="currentColor" strokeWidth="7" strokeLinejoin="bevel" />
            <rect x="12" y="13" width="40" height="7" rx="2" fill="#ea4c89" />
          </svg>
        ) : (
          <span className="badge-dot" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
