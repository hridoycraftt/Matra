// One small, consistent stroke icon set (1.6px, round caps), drawn for Matra.
type P = { size?: number };
const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconPlus = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconDoc = ({ size }: P) => (
  <svg {...base(size)}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h4" /></svg>
);
export const IconGear = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
  </svg>
);
export const IconCheck = ({ size }: P) => (
  <svg {...base(size)}><path d="M4.5 12.5l4.5 4.5L19.5 6.5" /></svg>
);
export const IconSpark = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></svg>
);
export const IconPen = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 20l4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16 4 20z" /><path d="M14 7l3 3" /></svg>
);
export const IconTarget = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" fill="currentColor" /></svg>
);
export const IconTrash = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
);
export const IconX = ({ size }: P) => (
  <svg {...base(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IconCopy = ({ size }: P) => (
  <svg {...base(size)}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
);
export const IconArrowDown = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 4v15M6 13l6 6 6-6" /></svg>
);
export const IconChevron = ({ size, dir = "down" }: P & { dir?: "down" | "left" | "right" | "up" }) => (
  <svg {...base(size)} style={{ transform: `rotate(${{ down: 0, left: 90, up: 180, right: -90 }[dir]}deg)` }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** Matra's logo mark: an M hanging from the pink bar. */
export const LogoMark = ({ size = 36 }: P) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="15" fill="#0d0c22" />
    <rect x="0.5" y="0.5" width="63" height="63" rx="14.5" fill="none" stroke="rgba(255,255,255,.12)" />
    <path d="M19 50V22l13 17 13-17v28" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinejoin="bevel" />
    <rect x="13" y="15" width="38" height="6" rx="1.5" fill="#ea4c89" />
  </svg>
);
