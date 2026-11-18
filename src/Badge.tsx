import { useEffect, useState } from "react";
import { showPanel, type BadgeState } from "./lib/everywhere";
import { inApp, onAppEvent } from "./lib/platform";

/** The small floating button that sits on the text field in other apps. */
export default function Badge() {
  const [state, setState] = useState<BadgeState>(inApp ? { status: "idle" } : { status: "issues", count: 3 });

  useEffect(() => {
    document.documentElement.classList.add("is-badge");
    return onAppEvent<BadgeState>("matra://badge", setState);
  }, []);

  const label =
    state.status === "issues"
      ? `${state.count} suggestion${state.count === 1 ? "" : "s"} — open Matra`
      : state.status === "checking"
        ? "Matra is checking"
        : state.status === "clean"
          ? "No suggestions"
          : "Open Matra";

  return (
    <button className={`badge-btn badge-${state.status}`} aria-label={label} title={label} onClick={() => showPanel(true)}>
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
