import { useEffect, useState } from "react";
import { onAppEvent, useSettings } from "./lib/platform";
import { useUnderlineStyle } from "./lib/useUnderlineStyle";

interface Mark {
  id: string;
  category: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const PREVIEW: Mark[] = [
  { id: "a", category: "correctness", x: 12, y: 10, w: 48, h: 18 },
  { id: "b", category: "clarity", x: 90, y: 10, w: 70, h: 18 },
];

/** A click-through layer over another app's text box that draws Matra's underlines in place. */
export default function Underlines() {
  const [settings] = useSettings();
  useUnderlineStyle(settings);
  const [marks, setMarks] = useState<Mark[]>(new URLSearchParams(location.search).has("preview") ? PREVIEW : []);

  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    document.documentElement.classList.add("is-overlay");
    const offs = [onAppEvent<Mark[]>("matra://marks", setMarks), onAppEvent<string | null>("matra://active", setActive)];
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <div className="overlay" aria-hidden="true">
      {marks
        .filter((m) => m.id === active)
        .map((m) => (
          <span key={`hl-${m.id}`} className={`overlay-hl overlay-hl-${m.category}`} style={{ left: m.x - 1, top: m.y, width: m.w + 2, height: m.h }} />
        ))}
      {marks.map((m) => (
        <span
          key={m.id}
          className={`overlay-line overlay-${m.category}`}
          style={{ left: m.x, top: m.y + m.h - 1, width: m.w }}
        />
      ))}
    </div>
  );
}
