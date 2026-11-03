// The Otea desktop shell: the UI of `otea serve` in a window, and the attention state on the
// surfaces the desktop has (Desk-Spec): a static app icon, the Windows taskbar overlay and flash, the
// macOS Dock badge and bounce, and a tray that carries the living mark. The main process derives the
// state itself from /api/items and the live stream (Desk-Pick: "owner"), with the page's own
// attentionOf, so the tray keeps working while the window is closed to it.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  nativeTheme,
  shell,
  systemPreferences,
  Tray,
} from 'electron';
import { type Icons, loadIcons, type Theme } from './icons.ts';
import { type Snapshot, watchItems } from './live.ts';
import { FRAME_MS } from './marks.ts';
import { type Connection, connect, sourceCli } from './server.ts';
import {
  badgeText,
  collectionLabel,
  type DeskAttention,
  deskAttention,
  grew,
  menuHeader,
  nextLeaseExpiry,
  overlayOf,
  surfaceKey,
  tooltip,
} from './state.ts';
import { cooldown, throttle } from './throttle.ts';

const { values: options } = parseArgs({
  args: process.argv.slice(app.isPackaged ? 1 : 2),
  options: { project: { type: 'string' }, port: { type: 'string' } },
  strict: false,
});

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
// `npm start` runs in desktop/; npm keeps the folder it was called from in INIT_CWD.
const PROJECT_DIR = resolve(
  typeof options.project === 'string' ? options.project : (process.env.INIT_CWD ?? process.cwd()),
);
const PORT = typeof options.port === 'string' ? Number(options.port) : undefined;

const APPLY_MS = 500; // at most twice a second per surface
const ATTENTION_MS = 30_000; // one flash or bounce per 30s
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = !IS_WIN && !IS_MAC;

type Settings = { askForAttention: boolean; animateTray: boolean };

function readSettings(): Settings {
  const defaults: Settings = { askForAttention: true, animateTray: true };
  try {
    const path = join(app.getPath('userData'), 'settings.json');
    return { ...defaults, ...JSON.parse(readFileSync(path, 'utf8')) };
  } catch {
    return defaults;
  }
}

// The Windows taskbar follows Windows mode, not app mode (which nativeTheme reports).
function readTaskbarTheme(): Promise<Theme> {
  if (!IS_WIN) return Promise.resolve(nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  return new Promise((done) => {
    execFile(
      'reg',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
        '/v',
        'SystemUsesLightTheme',
      ],
      { windowsHide: true },
      (error, stdout) => {
        if (error) done('dark');
        else done(/SystemUsesLightTheme\s+REG_DWORD\s+0x0*1\b/.test(stdout) ? 'light' : 'dark');
      },
    );
  });
}

function reducedMotion(): boolean {
  try {
    return systemPreferences.getAnimationSettings().prefersReducedMotion;
  } catch {
    return false;
  }
}

function fail(message: string): void {
  dialog.showErrorBox('Otea', message);
  app.exit(1);
}

class Shell {
  private attention: DeskAttention | undefined;
  private applied: DeskAttention | undefined;
  private appliedKey = '';
  private snapshot: Snapshot = { items: [], collections: [] };
  private connected = false;
  private quitting = false;
  private theme: Theme = 'light';
  private step = 0;
  private spinner: NodeJS.Timeout | undefined;
  private menuOpen = false;
  private menu: Menu | undefined;
  private leaseTimer: NodeJS.Timeout | undefined;
  private bounceId: number | undefined;
  private readonly settings = readSettings();
  private readonly mayInterrupt = cooldown(ATTENTION_MS);
  private readonly apply = throttle(() => this.applyNow(), APPLY_MS);
  private readonly tray: Tray;
  private readonly win: BrowserWindow;
  private readonly icons: Icons;
  private readonly connection: Connection;

  constructor(icons: Icons, connection: Connection) {
    this.icons = icons;
    this.connection = connection;
    this.win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 360,
      minHeight: 480,
      title: 'Otea',
      icon: icons.app,
      autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    this.win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    this.win.on('close', (event) => {
      if (this.quitting) return;
      event.preventDefault();
      this.win.hide();
    });
    this.win.on('focus', () => {
      if (IS_WIN) this.win.flashFrame(false);
    });
    this.win.on('show', () => this.drawOverlay());
    void this.win.loadURL(connection.signInUrl);

    this.tray = new Tray(icons.tray('idle', this.theme, 0));
    this.tray.setToolTip('Otea');
    if (IS_WIN) {
      const pop = () => this.menu && this.tray.popUpContextMenu(this.menu);
      this.tray.on('click', pop);
      this.tray.on('right-click', pop);
    }
    if (IS_MAC) {
      app.dock?.setIcon(icons.app);
      app.on('did-become-active', () => {
        if (this.bounceId !== undefined) app.dock?.cancelBounce(this.bounceId);
        this.bounceId = undefined;
      });
    }
    nativeTheme.on('updated', () => void this.readTheme());
    void this.readTheme();
    this.buildMenu();
  }

  start(): void {
    const watch = watchItems(this.connection.url, {
      onSnapshot: (snapshot) => {
        this.snapshot = snapshot;
        this.derive();
      },
      onConnection: (connected) => {
        this.connected = connected;
        this.derive();
      },
    });
    app.on('before-quit', () => {
      this.quitting = true;
      watch.close();
      this.connection.child?.kill();
    });
  }

  show(hash?: string): void {
    if (this.win.isMinimized()) this.win.restore();
    this.win.show();
    this.win.focus();
    if (hash !== undefined) {
      void this.win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`);
    }
  }

  private async readTheme(): Promise<void> {
    const theme = await readTaskbarTheme();
    if (theme === this.theme) return;
    this.theme = theme;
    this.appliedKey = '';
    this.apply();
  }

  // Derive on every event; the surfaces follow under the throttle.
  private derive(): void {
    const now = Date.now();
    this.attention = deskAttention(this.snapshot.items, this.snapshot.collections, now);
    clearTimeout(this.leaseTimer);
    const expiry = nextLeaseExpiry(this.snapshot.items, now);
    if (expiry !== undefined) {
      this.leaseTimer = setTimeout(() => this.derive(), Math.max(0, expiry - now) + 50);
    }
    this.apply();
  }

  private applyNow(): void {
    const next = this.attention;
    if (!next) return;
    const key = `${surfaceKey(next)}|${this.connected}|${this.theme}`;
    if (key !== this.appliedKey) {
      this.appliedKey = key;
      this.tray.setToolTip(this.connected ? tooltip(next) : 'Otea — reconnecting to otea serve');
      if (IS_MAC) this.tray.setTitle(next.yours > 0 ? String(next.yours) : '');
      if (IS_MAC) app.dock?.setBadge(badgeText(next.yours));
      this.drawOverlay();
      this.buildMenu();
      this.drawTray();
    }
    if (grew(this.applied, next)) this.askForAttention();
    this.applied = next;
  }

  // A hidden window has no taskbar button, and the one Windows makes when it shows again has no
  // overlay: it is drawn again on every show.
  private drawOverlay(): void {
    if (!IS_WIN || !this.attention) return;
    const overlay = overlayOf(this.attention);
    this.win.setOverlayIcon(
      overlay ? this.icons.overlay[overlay.kind] : null,
      overlay?.description ?? '',
    );
  }

  private animates(): boolean {
    const frame = this.attention?.frame;
    const working = frame === 'working' || frame === 'yours-working';
    return working && !IS_LINUX && this.settings.animateTray && !reducedMotion();
  }

  // The tray's frame; while an agent works the orbit turns, 12 frames at 142ms, paused while the
  // menu is open and still under reduced motion.
  private drawTray(): void {
    const frame = this.attention?.frame ?? 'idle';
    if (!this.animates()) {
      clearInterval(this.spinner);
      this.spinner = undefined;
      this.step = 0;
    } else if (!this.spinner) {
      this.spinner = setInterval(() => {
        if (this.menuOpen) return;
        this.step = (this.step + 1) % 12;
        this.tray.setImage(this.icons.tray(this.attention?.frame ?? 'idle', this.theme, this.step));
      }, FRAME_MS);
    }
    this.tray.setImage(this.icons.tray(frame, this.theme, this.step));
  }

  // The one event worth interrupting for: something new became yours.
  private askForAttention(): void {
    if (!this.settings.askForAttention) return;
    if (IS_WIN && !this.win.isFocused() && this.mayInterrupt()) this.win.flashFrame(true);
    if (IS_MAC && !BrowserWindow.getFocusedWindow() && this.mayInterrupt()) {
      this.bounceId = app.dock?.bounce('informational');
    }
  }

  private buildMenu(): void {
    const a = this.attention;
    const header: MenuItemConstructorOptions =
      IS_MAC && Number(process.getSystemVersion().split('.')[0]) >= 14
        ? { type: 'header', label: a ? menuHeader(a) : 'Otea' }
        : { label: a ? menuHeader(a) : 'Otea', enabled: false };
    const theme: Theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    const recent: MenuItemConstructorOptions[] = (a?.recentYours ?? []).map((item) => ({
      label: `${item.id}  ${item.title}`,
      icon: this.icons.menuYours(theme),
      click: () => this.show(`#${encodeURIComponent(item.id)}`),
    }));
    const collections: MenuItemConstructorOptions[] = (a?.collections ?? []).map((each) => ({
      label: collectionLabel(each),
      click: () => this.show(),
    }));
    const menu = Menu.buildFromTemplate([
      header,
      ...(recent.length > 0 ? [{ type: 'separator' } as const, ...recent] : []),
      ...(collections.length > 0 ? [{ type: 'separator' } as const, ...collections] : []),
      { type: 'separator' },
      { label: 'Open Otea', click: () => this.show() },
      { label: 'Quit Otea', click: () => app.quit() },
    ]);
    menu.on('menu-will-show', () => {
      this.menuOpen = true;
    });
    menu.on('menu-will-close', () => {
      this.menuOpen = false;
    });
    this.menu = menu;
    if (!IS_WIN) this.tray.setContextMenu(menu);
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  if (IS_WIN) app.setAppUserModelId('dev.otea.desktop');
  Menu.setApplicationMenu(null);
  let shellInstance: Shell | undefined;
  app.on('second-instance', () => shellInstance?.show());
  // Closed to the tray: the app lives on until Quit Otea.
  app.on('window-all-closed', () => {});
  app.on('activate', () => shellInstance?.show());
  void app.whenReady().then(async () => {
    try {
      const icons = await loadIcons(join(app.getPath('userData'), 'icons'));
      const connection = await connect(sourceCli(REPO_ROOT), PROJECT_DIR, PORT);
      shellInstance = new Shell(icons, connection);
      shellInstance.start();
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  });
}
