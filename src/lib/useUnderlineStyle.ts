import { useEffect } from "react";
import type { Settings } from "./types";

/** Reflect the underline-style preference on <html> so every window draws the same lines. */
export function useUnderlineStyle(settings: Settings) {
  useEffect(() => {
    document.documentElement.classList.toggle("ul-patterns", settings.underlineStyle === "patterns");
  }, [settings.underlineStyle]);
}
