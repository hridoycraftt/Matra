import { inApp } from "../lib/platform";

/** A link that opens in the user's browser (inside the Mac app, links can't open in place). */
export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={async (e) => {
        if (!inApp) return;
        e.preventDefault();
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(href);
      }}
    >
      {children}
    </a>
  );
}
