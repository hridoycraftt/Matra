import { useEffect, useRef, useState } from "react";
import { IconCheck, IconFeedback, IconIdea, IconPower } from "./components/Icons";
import { badgeDrag, badgeWidth, openPanel, type BadgeState } from "./lib/everywhere";
import { inApp, onAppEvent } from "./lib/platform";
import { loadSettings, saveSettings } from "./lib/storage";

const DRAG_THRESHOLD = 4;
const DOT = 30;
/** Three actions to the left of the main button when hovered: off, feedback, AI. */
const ACTIONS = 3 * 26 + 3 * 3 + 6;
const FEEDBACK_URL = "https://github.com/hridoycraftt/matra/issues/new";

/**
 * The floating helper on other apps' text fields. A quiet dot while you write; when
 * Matra finds something it becomes a pill like Grammarly's: a light bulb for
 * improvements and a red count for corrections, each opening its own suggestions.
 * Hover for quick actions; drag it anywhere and Matra keeps it there for that app.
 */
export default function Badge() {
  const preview = !inApp;
  const [state, setState] = useState<BadgeState>(
    preview ? { status: "issues", count: 18, corrections: 15, improvements: 3 } : { status: "idle" },
  );
  const [expanded, setExpanded] = useState(preview && new URLSearchParams(location.search).has("open"));
  const [dragging, setDragging] = useState(false);
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    document.documentElement.classList.add("is-badge");
    return onAppEvent<BadgeState>("matra://badge", setState);
  }, []);

  const issues = state.status === "issues" ? state : null;
  const mainWidth = DOT;

  // The window is exactly as wide as what it shows.
  useEffect(() => {
    badgeWidth(mainWidth + (expanded ? ACTIONS : 0));
  }, [mainWidth, expanded]);

  const expand = (on: boolean) => {
    clearTimeout(collapseTimer.current);
    if (on !== expanded) setExpanded(on);
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

  /** A click that ended a drag is not a click. */
  const click = (fn: () => void) => () => {
    if (dragged.current) return;
    expand(false);
    fn();
  };

  const dragProps = {
    onPointerDown: (e: React.PointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY };
      dragged.current = false;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = down.current;
      if (!d || dragged.current || !(e.buttons & 1)) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_THRESHOLD) startDrag();
    },
    onPointerUp: () => {
      down.current = null;
    },
  };

  return (
    <div
      className={`badge-wrap${expanded ? " is-open" : ""}${dragging ? " is-dragging" : ""}`}
      onPointerEnter={() => !dragging && expand(true)}
      onPointerLeave={() => {
        collapseTimer.current = setTimeout(() => expand(false), 450);
      }}
      {...dragProps}
    >
      {expanded && (
        <div className="badge-actions" role="toolbar" aria-label="Matra quick actions">
          <button className="badge-action" aria-label="Turn off Matra here" title="Turn off Matra here" onClick={click(() => openPanel("turnoff"))}>
            <IconPower size={15} />
          </button>
          <button
            className="badge-action"
            aria-label="Send feedback"
            title="Send feedback"
            onClick={click(async () => {
              if (!inApp) return;
              const { openUrl } = await import("@tauri-apps/plugin-opener");
              await openUrl(FEEDBACK_URL);
            })}
          >
            <IconFeedback size={15} />
          </button>
          <button className="badge-action badge-ai" aria-label="Write with AI" title="Write with AI" onClick={click(() => openPanel("ai"))}>
            <IconIdea size={16} />
          </button>
        </div>
      )}
      <button
        className={`badge-btn badge-${state.status}${expanded ? " is-big" : ""}`}
        aria-label={issues ? `${issues.count} suggestion${issues.count === 1 ? "" : "s"} — open Matra` : "Open Matra"}
        title={
          issues
            ? `${issues.count} suggestion${issues.count === 1 ? "" : "s"}`
            : state.status === "checking"
              ? "Matra is checking…"
              : state.status === "clean"
                ? "Looks good"
                : "Open Matra"
        }
        onClick={click(() => openPanel(issues ? "card" : "full"))}
      >
        {issues ? (
          <span className="badge-count">{issues.count > 99 ? "99+" : issues.count}</span>
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
