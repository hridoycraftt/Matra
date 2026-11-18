import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// The Mac app blocks every host that is not in its Content-Security-Policy, so each
// AI provider Matra talks to must be listed (the browser preview doesn't enforce it).
it("the app's CSP allows every AI provider's API host", () => {
  const conf = JSON.parse(readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  const connect = (conf.app.security.csp as string).split(";").find((d) => d.trim().startsWith("connect-src"))!;
  for (const host of ["https://api.anthropic.com", "https://generativelanguage.googleapis.com"]) {
    expect(connect).toContain(host);
  }
});
