# Otea desktop shell

The UI of `otea serve` in a window, with its state on the desktop: a static app icon, the Windows taskbar overlay, the macOS Dock badge and a tray that carries the living mark. See "The desktop shell" in `../DESIGN.md`.

It is its own package so the CLI never installs Electron: the root `npm ci` does not touch this folder.

## Run it (development)

From the Otea checkout, after the root `npm ci` and `npm run build:ui`:

```sh
cd desktop
npm ci
npm start -- --project <path to a project> [--port <n>]
```

- `--project` is the folder an `otea` command would run in. Without it, the folder `npm` was called from (`npm --prefix desktop start` from a project keeps that project).
- If `otea serve` already runs for the project, the shell attaches to it and leaves it running. Otherwise it starts `otea serve --no-open` (on `--port` when given) with this checkout's CLI and stops it on Quit Otea.
- Closing the window keeps Otea in the tray; quit from the tray menu.
- Settings live in `settings.json` in Electron's user data folder: `{ "askForAttention": true, "animateTray": true }`.

On Windows 11 a new tray icon starts in the overflow (the ^ next to the clock); drag it to the taskbar or turn it on in Settings › Personalization › Taskbar › Other system tray icons.

## Check it

```sh
npm run typecheck   # needs this folder's npm ci (Electron's types)
npm test            # the pure parts, with the root's vitest; the root npm test runs them too
```

Packaging and installers are not set up yet.
