// Matra uses Hugeicons (free set) everywhere. Components keep Matra's names so screens
// don't depend on the icon library directly; LogoMark stays Matra's own drawing.
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity01Icon,
  AiMagicIcon,
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowRight02Icon,
  Book02Icon,
  Cancel01Icon,
  Copy01Icon,
  Delete02Icon,
  File02Icon,
  Key01Icon,
  MoreHorizontalIcon,
  PaintBrush01Icon,
  PlusSignIcon,
  PowerServiceIcon,
  Settings01Icon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Target02Icon,
  Tick02Icon,
  DashboardSquare01Icon,
  Download04Icon,
  Edit02Icon,
  UserGroupIcon,
  Mortarboard01Icon,
  AiSearchIcon,
  Note01Icon,
  DocumentValidationIcon,
  QuoteDownIcon,
  Idea01Icon,
  UserEdit01Icon,
} from "@hugeicons/core-free-icons";

type P = { size?: number };
type Svg = typeof PlusSignIcon;

const make = (icon: Svg) =>
  function Icon({ size = 16 }: P) {
    return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.7} aria-hidden="true" />;
  };

export const IconPlus = make(PlusSignIcon);
export const IconDoc = make(File02Icon);
export const IconGear = make(Settings01Icon);
export const IconCheck = make(Tick02Icon);
export const IconSpark = make(SparklesIcon);
export const IconPen = make(Edit02Icon);
export const IconTarget = make(Target02Icon);
export const IconTrash = make(Delete02Icon);
export const IconX = make(Cancel01Icon);
export const IconCopy = make(Copy01Icon);
export const IconArrowDown = make(ArrowDown02Icon);
export const IconArrowRight = make(ArrowRight02Icon);
export const IconMore = make(MoreHorizontalIcon);
export const IconPower = make(PowerServiceIcon);

// Settings sections
export const IconGeneral = make(SlidersHorizontalIcon);
export const IconAI = make(AiMagicIcon);
export const IconApps = make(DashboardSquare01Icon);
export const IconDictionary = make(Book02Icon);
export const IconStyle = make(PaintBrush01Icon);
export const IconUpdates = make(Download04Icon);
export const IconKey = make(Key01Icon);
export const IconActivity = make(Activity01Icon);
export const IconSnippets = make(Note01Icon);

// Agents
export const IconReaders = make(UserGroupIcon);
export const IconGrader = make(Mortarboard01Icon);
export const IconDetector = make(AiSearchIcon);
export const IconPlagiarism = make(DocumentValidationIcon);
export const IconCitation = make(QuoteDownIcon);
export const IconIdea = make(Idea01Icon);
export const IconVoice = make(UserEdit01Icon);

export const IconChevron = ({ size = 16, dir = "down" }: P & { dir?: "down" | "left" | "right" | "up" }) => (
  <span className="icon-rot" style={{ transform: `rotate(${{ down: 0, left: 90, up: 180, right: -90 }[dir]}deg)` }}>
    <HugeiconsIcon icon={ArrowDown01Icon} size={size} strokeWidth={1.7} aria-hidden="true" />
  </span>
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
