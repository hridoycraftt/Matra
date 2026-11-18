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

  useEffect(() => {
    document.documentElement.classList.add("is-overlay");
    return onAppEvent<Mark[]>("matra://marks", setMarks);
  }, []);

  return (
    <div className="overlay" aria-hidden="true">
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
