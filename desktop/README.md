# Otea desktop app

The UI of `otea serve` in a window, with its state on the desktop: a static app icon, the Windows taskbar overlay, the macOS Dock badge and a tray that carries the living mark (see "The desktop shell" in `../DESIGN.md`). Installed, it is how people get Otea: it carries the CLI, puts `otea` on PATH and updates itself from GitHub Releases.

It is its own package so the CLI never installs Electron: the root `npm ci` does not touch this folder.

## What the app does

- **Opens a project.** The first run shows the picker: **Open folder** (a folder that is not in a project yet asks before `otea init`) or **Create project** (`otea init` in the folder chosen). Later runs reopen the last project; **Open another project…** in the tray menu goes back to the picker, with the recent projects (`recent-projects.json` in Electron's user data folder).
- **Runs the server itself.** If `otea serve` already runs for the project, the app attaches to it and leaves it running. Otherwise it starts `otea serve --no-open` and stops it when it switches project or quits. There is no console.
- **Carries the CLI.** The packaged app has the Otea CLI in `resources/otea` and runs it on its own Electron as Node (`ELECTRON_RUN_AS_NODE`, as VS Code runs `code`), so no Node or npm is needed. `resources/bin` holds the commands that run it: `otea` (a shell script for macOS, Linux and Git Bash) and `otea.cmd` (cmd and PowerShell). What the CLI writes for later (`otea connect`'s `.mcp.json` entry, `otea hook install`'s hooks) runs the app's Electron the same way.
- **Puts `otea` on PATH.**
  - Windows: the installer adds `resources\bin` to the user's PATH (never the machine's) and the uninstaller takes it off; an update keeps it. `build/path.ps1` does it, `build/installer.nsh` calls it.
  - macOS: the app is dragged to Applications, so its tray menu offers **Install the otea command**: a symlink `/usr/local/bin/otea` to the app's `bin/otea`, after asking (and macOS asks for an administrator's password when that folder is not writable).
  - Linux: the deb links `/usr/bin/otea` (and `/usr/bin/otea-desktop`, the app) and removes them with the package. The AppImage is the app alone: for the command, install the deb.
- **Updates quietly** (electron-updater, from the GitHub Releases of `Lartweib/otea`). It checks at start and every 4 hours, downloads in the background and then shows a small notice in the window's corner, "Otea se actualizó · reiniciar" ("Otea updated · restart"), and an item in the tray menu. Nothing restarts until the person clicks it; an update downloaded is applied anyway when Otea next quits. A Mac app applies an update only when it is signed, so until then the Mac app says "Salió Otea x.y.z · descargar" and opens the release page.
- **Notifies.** What the server would push to a paired phone (something is yours, an agent answered your note, an item got stuck), the app shows as the system's own notifications, also with the window closed to the tray; clicking one opens the item. It listens on `/api/notify/stream`; what is told and the quiet hours are chosen in Preferencias › Avisos, in the app's window.
- Closing the window keeps Otea in the tray; quit from the tray menu. Settings live in `settings.json` in Electron's user data folder: `{ "askForAttention": true, "animateTray": true }`.

On Windows 11 a new tray icon starts in the overflow (the ^ next to the clock); drag it to the taskbar or turn it on in Settings › Personalization › Taskbar › Other system tray icons.

## Run it (development)

From the Otea checkout, after the root `npm ci` and `npm run build:ui`:

```sh
cd desktop
npm ci
npm start -- --project <path to a project> [--port <n>]
```

`npm start` bundles `src/` into `dist/` (`build.mjs`, esbuild) and starts Electron on it. A checkout runs the checkout's CLI on the system's Node. `--project` is the folder an `otea` command would run in; without it, the folder `npm` was called from (`npm --prefix desktop start` from a project keeps that project).

## Package it

Electron Builder, not Electron Forge: it makes all the installers asked for (NSIS, dmg, AppImage, deb) from one config (`electron-builder.yml`), and writes the update metadata (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) that electron-updater, its companion, reads from a GitHub Release. Forge would need a maker per format and its updater serves only signed Mac and Windows apps of public repos through update.electronjs.org.

```sh
npm run dist        # build.mjs, scripts/stage-cli.mjs, electron-builder --publish never
```

`scripts/stage-cli.mjs` lays out the CLI in `stage/otea`: the root's `package.json`, `src` without tests, `ui/dist`, `presets`, `schemas` and the production dependencies. The installers land in `release/`. Packaging only builds for the system it runs on; CI builds all three.

## Release

`.github/workflows/desktop.yml` builds the installers on Windows, macOS and Linux and tries each on its runner: the bundled `otea` makes and reads a project, the app opens it (`OTEA_DESKTOP_SMOKE=1` makes the app open the project, print `OTEA_DESKTOP_SMOKE ok` and quit), the Windows installer puts `otea` on PATH and its uninstaller takes it off, the deb gives `/usr/bin/otea` and removing it takes it away. It runs on pull requests that touch `desktop/` (the installers are kept as the run's artifacts for a week) and on `v*` tags, where it takes the version from the tag and publishes every installer and `latest*.yml` as the GitHub Release of that tag. To release:

```sh
git tag v0.2.0 && git push origin v0.2.0
```

## Signing

Not set up yet: the installers are unsigned (the Mac app is ad-hoc signed). People see:

- **Windows**: SmartScreen's "Windows protected your PC": **More info** › **Run anyway**.
- **macOS**: Gatekeeper refuses the first open. Control-click Otea in Applications › **Open**, or on macOS 15 and later System Settings › Privacy & Security › **Open Anyway**.
- **macOS updates**: only a signed app can apply an update, so the Mac app announces a new version with a download link instead.

Signing is a drop-in: add these repository secrets and the release workflow signs (nothing else changes).

| Secret | For |
| --- | --- |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | the Windows code-signing certificate (.pfx, base64) and its password |
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | the Developer ID Application certificate (.p12, base64) and its password; with it the build marks itself signed (`oteaMacSigned`), so the Mac app updates in place |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarization of the Mac app |

## Try an installer by hand

The installers of a pull request are in its Desktop run's artifacts (Actions › the run › Artifacts); a release's are on its page.

- **Windows**: run `Otea-Setup-<version>.exe` (SmartScreen: More info › Run anyway). The app opens on the picker: Create project in an empty folder; the window shows the project, the tray has the mark. Open a new terminal (cmd, PowerShell, Git Bash) in that folder: `otea projects current` answers without Node on PATH. Uninstall from Settings › Apps: a new terminal no longer finds `otea`, and the user PATH no longer lists `...\Programs\otea-desktop\resources\bin`.
- **macOS**: open `Otea-<version>-mac.dmg`, drag Otea to Applications, Control-click › Open. Pick a project; in the tray menu choose Install the otea command (it asks first); a new terminal runs `otea projects current`.
- **Linux**: `sudo apt install ./Otea-<version>-amd64.deb`, open Otea from the applications menu, then `otea projects current` in a terminal; `sudo apt remove otea-desktop` takes `otea` away. Or `chmod +x Otea-<version>-x86_64.AppImage` and run it (the app only).
- **Updates**: install an older release, publish a newer tag, start the old app: within a minute the corner says "Otea se actualizó · reiniciar"; clicking it restarts into the new version.

## Check it

```sh
npm run typecheck   # needs this folder's npm ci (Electron's types)
npm run build       # the bundle in dist/
npm test            # the pure parts, with the root's vitest; the root npm test runs them too
```

The tests cover the decisions behind adapters: when to check for updates and what to say (`updates.ts`), the recent projects and what opens first (`recent.ts`), the macOS command link (`command-link.ts`), the Windows PATH script in its dry mode (`build/path.ps1 -Current`), and the `otea` commands against a fake app layout (`bin/`).
