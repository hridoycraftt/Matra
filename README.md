# Matra

An AI writing partner for macOS that checks English and Bangla. Every feature is free: there are no plans and no paywalls.

Built with Tauri 2, React and Claude.

## What it does today (v0.1)

| Feature | Notes |
|---|---|
| Real-time checking | Underlines issues as you pause typing in four categories: Correctness, Clarity, Engagement, Delivery |
| English + Bangla | Standard Bangla spelling, sadhu/cholito mixing, Banglish detection, mixed-language text |
| Score and tone | Overall score from 0 to 100 and up to three tone labels, for each document |
| Goals | Audience, formality, kind of writing and intent, set per document. Changing them re-checks the text |
| Rewrite | Selection or whole document: improve, shorten, expand, simplify, formal, friendly, confident, or a custom instruction |
| Language tools | Banglish → Bangla, translate to Bangla, translate to English |
| Write with AI | Draft new text from a prompt, using the document as context |
| Statistics | Words, characters, reading and speaking time, readability score (English) |
| Documents | Documents are saved on the Mac and saved automatically as you type |
| Private key storage | Your Anthropic API key lives in the macOS Keychain |
| Auto-update | Settings → Updates checks GitHub Releases, then downloads, verifies and installs the update and restarts the app |

The next features are listed in [ROADMAP.md](ROADMAP.md).

## Install on your Mac

1. Download `Matra_x.y.z_universal.dmg` from the latest [release](https://github.com/hridoycraftt/matra/releases/latest). It runs on both Apple Silicon and Intel Macs.
2. Drag Matra into Applications.
3. The app is not notarized by Apple, so the first launch needs one extra step. Right-click Matra.app, choose **Open**, then click **Open** again. If macOS still refuses, run:
   ```bash
   xattr -cr /Applications/Matra.app
   ```
4. Open **Settings**, paste your Anthropic API key, and start writing.

Updates installed from inside the app do not need step 3 again.

## Develop

```bash
npm install
npm run dev        # browser preview at http://localhost:1420 (AI works once you add a key in Settings)
npm run app:dev    # the real desktop app (needs a Mac with Rust installed)
npm test           # unit tests
npm run e2e        # end-to-end tests against a mocked Claude API
```

In the browser preview, the API key is kept in that browser's localStorage. In the Mac app, it is kept in the Keychain.

## Release a new version

One-time setup, so that updates can be signed and verified: in GitHub, go to **Settings → Secrets and variables → Actions** and add these two repository secrets.

| Secret | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | The full contents of the updater private key file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | That key's password |

The matching public key is already in `src-tauri/tauri.conf.json`. Keep the private key safe. If you lose it, installed copies of Matra can no longer verify updates, and you would have to reinstall them by hand.

Then, for every release:

```bash
npm version patch          # or minor / major: bumps package.json and creates the tag
git push --follow-tags
```

The **Release** workflow builds a universal `.dmg` and publishes it to GitHub Releases along with `latest.json`. Copies of Matra that are already installed then see the new version under **Settings → Check for updates**.

## How the pieces fit

```
src/
  App.tsx                 state: documents, checking, rewrite/compose
  components/             Editor (textarea + highlight mirror), SidePanel, SettingsSheet, GoalsMenu
  lib/ai.ts               Claude calls: structured-output check, streaming rewrite/compose
  lib/locate.ts           maps model suggestions to exact text ranges, keeps them in sync as you type
  lib/updater.ts          Tauri updater: check → download → install → relaunch
  lib/platform.ts         Keychain via Rust commands; browser fallback for dev and tests
src-tauri/                Rust shell: Keychain commands, updater + process plugins, app config
tests/unit, tests/e2e     Vitest and Playwright (Chromium locally, WebKit on the macOS CI runner)
```
