import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/noto-sans-bengali/400.css";
import "@fontsource/noto-sans-bengali/600.css";
import "./styles.css";
import App from "./App";
import { inApp } from "./lib/platform";

const Panel = lazy(() => import("./Panel"));
const Badge = lazy(() => import("./Badge"));

/** Which Matra window this webview is: the main editor, the floating panel, or the badge. */
async function whichView(): Promise<string> {
  if (inApp) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().label;
  }
  return new URLSearchParams(location.search).get("view") ?? "main";
}

if (inApp) document.documentElement.classList.add("in-app");

whichView().then((view) => {
  const root = view === "panel" ? <Panel /> : view === "badge" ? <Badge /> : <App />;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Suspense fallback={null}>{root}</Suspense>
    </StrictMode>,
  );
});
