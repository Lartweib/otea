// The Otea desktop shell: the UI of `otea serve` in a window, and the attention state on the
// surfaces the desktop has (Desk-Spec): a static app icon, the Windows taskbar overlay and flash, the
// macOS Dock badge and bounce, and a tray that carries the living mark. The main process derives the
// state itself from /api/items and the live stream (Desk-Pick: "owner"), with the page's own
// attentionOf, so the tray keeps working while the window is closed to it.
import { execFile } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  nativeTheme,
  shell,
  systemPreferences,
  Tray,
} from 'electron';
import electronUpdater from 'electron-updater';
import {
  COMMAND_LINK,
  installCommand,
  isInstalled,
  type LinkPort,
  type LinkState,
} from './command-link.ts';
import { COPY, type Copy, langOf } from './copy.ts';
import { type Icons, loadIcons, type Theme } from './icons.ts';
import { type Snapshot, type Watch, watchItems } from './live.ts';
import { FRAME_MS } from './marks.ts';
import type { NoticeView } from './notice.ts';
import type { PickerState } from './picker.ts';
import { firstProject, forget, parseRecents, type Recent, remember } from './recent.ts';
import {
  bundledCli,
  type Cli,
  type Connection,
  connect,
  createProject,
  currentProject,
  sourceCli,
} from './server.ts';
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
import { type Notice, startUpdates, updateMode } from './updates.ts';

const { values: options } = parseArgs({
  args: process.argv.slice(app.isPackaged ? 1 : 2),
  options: { project: { type: 'string' }, port: { type: 'string' } },
  strict: false,
});

// This file runs bundled from desktop/dist (see build.mjs), in a checkout and in the app alike.
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
// The packaged app runs the CLI it carries, on its own Electron; a checkout runs its own source.
const CLI: Cli = app.isPackaged
  ? bundledCli(process.resourcesPath, process.execPath)
  : sourceCli(REPO_ROOT);
// A checkout's `npm start` opens the folder npm was called from (INIT_CWD); the app reopens the
// last project or asks.
const ASKED_DIR =
  typeof options.project === 'string'
    ? resolve(options.project)
    : app.isPackaged
      ? undefined
      : resolve(process.env.INIT_CWD ?? process.cwd());
const PORT = typeof options.port === 'string' ? Number(options.port) : undefined;
// CI starts the packaged app with OTEA_DESKTOP_SMOKE=1: it opens the project, says so and quits.
const SMOKE = process.env.OTEA_DESKTOP_SMOKE === '1';
const RELEASES_URL = 'https://github.com/Lartweib/otea/releases/latest';

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
  if (SMOKE) console.error(`OTEA_DESKTOP_SMOKE failed: ${message}`);
  else dialog.showErrorBox('Otea', message);
  app.exit(1);
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const RECENTS_FILE = () => join(app.getPath('userData'), 'recent-projects.json');

function readRecents(): Recent[] {
  try {
    return parseRecents(JSON.parse(readFileSync(RECENTS_FILE(), 'utf8')));
  } catch {
    return [];
  }
}

function writeRecents(recents: readonly Recent[]): void {
  try {
    writeFileSync(
      RECENTS_FILE(),
      `${JSON.stringify(recents, null, 2)}
`,
    );
  } catch {
    // only a convenience: the app works without it
  }
}

// The build says whether the Mac app is signed (electron-builder's extraMetadata, set by the
// release workflow when it has the certificate): only a signed Mac app can apply an update.
function macSigned(): boolean {
  try {
    const meta = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'));
    return meta.oteaMacSigned === true;
  } catch {
    return false;
  }
}

const macLinkPort = (copy: Copy): LinkPort => ({
  state(link): LinkState {
    try {
      if (!lstatSync(link).isSymbolicLink()) return { kind: 'file' };
      return { kind: 'link', to: readlinkSync(link) };
    } catch {
      return { kind: 'missing' };
    }
  },
  writable(dir) {
    try {
      accessSync(dir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
  symlink(target, link) {
    rmSync(link, { force: true });
    symlinkSync(target, link);
  },
  runAdmin: (script) =>
    new Promise((done, failed) => {
      execFile('osascript', ['-e', script], (error) => (error ? failed(error) : done()));
    }),
  confirm: async (plan) => {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      message: copy.commandAsk,
      detail: plan === 'install' ? copy.commandInstall : copy.commandReplace,
      buttons: [copy.install, copy.cancel],
      defaultId: 0,
      cancelId: 1,
    });
    return response === 0;
  },
});

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
  private readonly copy: Copy;
  private connection: Connection | undefined;
  private watch: Watch | undefined;
  private recents = readRecents();
  // The picker's state while a project opens, or after it failed to.
  private opening: string | undefined;
  private pickerError: string | undefined;
  private update: Notice | undefined;
  private noticeDismissed = false;
  private readonly macCommand: string | undefined =
    IS_MAC && app.isPackaged ? join(process.resourcesPath, 'bin', 'otea') : undefined;

  constructor(icons: Icons, copy: Copy) {
    this.icons = icons;
    this.copy = copy;
    this.win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 360,
      minHeight: 480,
      title: 'Otea',
      icon: icons.app,
      autoHideMenuBar: true,
      show: !SMOKE,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        preload: join(import.meta.dirname, 'preload.cjs'),
      },
    });
    this.win.webContents.on('did-finish-load', () => this.sendNotice());
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
    app.on('before-quit', () => {
      this.quitting = true;
      this.detach();
    });
  }

  // Leaves the project shown: stops watching it, and stops its otea serve if the app started it.
  private detach(): void {
    this.watch?.close();
    this.watch = undefined;
    this.connection?.child?.kill();
    this.connection = undefined;
  }

  // Opens the project of the folder: attaches to its otea serve or starts one, and shows its UI.
  async open(dir: string, port?: number): Promise<void> {
    this.opening = basename(dir);
    this.pickerError = undefined;
    // An empty window says what it is opening meanwhile.
    if (!this.connection && !SMOKE) {
      this.win.loadFile(join(import.meta.dirname, 'picker.html')).catch(() => {});
    }
    try {
      const found = await connect(CLI, dir, port);
      // Already open: the server just started for it is not needed.
      if (this.connection?.project.id === found.project.id) found.child?.kill();
      else this.attach(found);
      const connection = this.connection ?? found;
      const { project } = connection;
      this.recents = remember(this.recents, {
        root: project.root,
        name: project.name,
        openedAt: Date.now(),
      });
      writeRecents(this.recents);
      this.opening = undefined;
      await this.win.loadURL(connection.signInUrl);
      this.buildMenu();
      if (SMOKE) {
        console.log(`OTEA_DESKTOP_SMOKE ok ${project.name} ${connection.url}`);
        app.quit();
      }
    } catch (error) {
      this.opening = undefined;
      if (SMOKE) return fail(message(error));
      this.pickerError = message(error);
      await this.showPicker();
    }
  }

  private attach(connection: Connection): void {
    this.detach();
    this.connection = connection;
    this.snapshot = { items: [], collections: [] };
    this.watch = watchItems(connection.url, {
      onSnapshot: (snapshot) => {
        this.snapshot = snapshot;
        this.derive();
      },
      onConnection: (connected) => {
        this.connected = connected;
        this.derive();
      },
    });
  }

  async showPicker(): Promise<void> {
    await this.win.loadFile(join(import.meta.dirname, 'picker.html'));
    this.show();
  }

  pickerState(): PickerState {
    return {
      lang: this.copy === COPY.es ? 'es' : 'en',
      recents: this.recents,
      ...(this.opening === undefined ? {} : { opening: this.opening }),
      ...(this.pickerError === undefined ? {} : { error: this.pickerError }),
    };
  }

  // "Abrir carpeta" and "Crear proyecto": a folder from the system's dialog, made a project when it
  // is not one yet (asking first, unless the person asked to create one).
  async pickFolder(create: boolean): Promise<PickerState> {
    const chosen = await dialog.showOpenDialog(this.win, {
      title: create ? this.copy.chooseNewFolder : this.copy.chooseFolder,
      properties: ['openDirectory', 'createDirectory'],
    });
    const dir = chosen.filePaths[0];
    if (chosen.canceled || dir === undefined) return this.pickerState();
    this.pickerError = undefined;
    try {
      if (create) await createProject(CLI, dir);
      else if (!(await isProject(dir))) {
        const { response } = await dialog.showMessageBox(this.win, {
          type: 'question',
          message: this.copy.noProjectTitle,
          detail: this.copy.noProject(dir),
          buttons: [this.copy.createProject, this.copy.cancel],
          defaultId: 0,
          cancelId: 1,
        });
        if (response !== 0) return this.pickerState();
        await createProject(CLI, dir);
      }
    } catch (error) {
      this.pickerError = message(error);
      return this.pickerState();
    }
    void this.open(dir);
    return this.pickerState();
  }

  openRecent(root: string): PickerState {
    void this.open(root);
    return this.pickerState();
  }

  forgetRecent(root: string): PickerState {
    this.recents = forget(this.recents, root);
    writeRecents(this.recents);
    return this.pickerState();
  }

  // An update to tell about: a quiet notice in the window and an item in the tray menu.
  setUpdate(notice: Notice): void {
    this.update = notice;
    this.noticeDismissed = false;
    this.sendNotice();
    this.buildMenu();
  }

  dismissNotice(): void {
    this.noticeDismissed = true;
  }

  actOnUpdate(): void {
    const update = this.update;
    if (update?.kind === 'restart') {
      this.quitting = true;
      electronUpdater.autoUpdater.quitAndInstall(true, true);
    } else if (update?.kind === 'download') void shell.openExternal(update.url);
  }

  private noticeView(): NoticeView | null {
    const update = this.update;
    if (!update || this.noticeDismissed) return null;
    const { copy } = this;
    return update.kind === 'restart'
      ? { text: copy.updated, action: copy.restart, dismiss: copy.dismiss }
      : { text: copy.available(update.version), action: copy.download, dismiss: copy.dismiss };
  }

  private sendNotice(): void {
    this.win.webContents.send('desktop:notice', this.noticeView());
  }

  private async installCommand(): Promise<void> {
    if (!this.macCommand) return;
    try {
      const done = await installCommand(macLinkPort(this.copy), this.macCommand, COMMAND_LINK);
      if (done === 'installed') {
        await dialog.showMessageBox({ type: 'info', message: this.copy.commandDone });
      }
    } catch (error) {
      dialog.showErrorBox('Otea', message(error));
    }
    this.buildMenu();
  }

  private commandMissing(): boolean {
    if (!this.macCommand) return false;
    return !isInstalled(macLinkPort(this.copy).state(COMMAND_LINK), this.macCommand);
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

  private extraItems(): MenuItemConstructorOptions[] {
    const items: MenuItemConstructorOptions[] = [];
    const update = this.update;
    if (update) {
      items.push({
        label:
          update.kind === 'restart'
            ? this.copy.menuRestart(update.version)
            : this.copy.menuDownload(update.version),
        click: () => this.actOnUpdate(),
      });
    }
    if (this.commandMissing()) {
      items.push({ label: this.copy.menuCommand, click: () => void this.installCommand() });
    }
    return items;
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
      { label: this.copy.menuOpen, click: () => this.show() },
      { label: this.copy.menuSwitch, click: () => void this.showPicker() },
      ...this.extraItems(),
      { type: 'separator' },
      { label: this.copy.menuQuit, click: () => app.quit() },
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

const isProject = (dir: string) =>
  currentProject(CLI, dir).then(
    () => true,
    () => false,
  );

function wireUpdates(shellInstance: Shell): void {
  const mode = updateMode({
    packaged: app.isPackaged && !SMOKE,
    platform: process.platform,
    macSigned: macSigned(),
  });
  if (mode === 'off') return;
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = false;
  // An update downloaded is applied when Otea quits, even if nobody clicks the notice.
  autoUpdater.autoInstallOnAppQuit = mode === 'install';
  autoUpdater.logger = null;
  startUpdates({
    updater: {
      check: async () => {
        const result = await autoUpdater.checkForUpdates();
        return result?.isUpdateAvailable ? result.updateInfo.version : undefined;
      },
      download: async () => {
        await autoUpdater.downloadUpdate();
      },
    },
    mode,
    releasesUrl: RELEASES_URL,
    every: (ms, run) => {
      const timer = setInterval(run, ms);
      return () => clearInterval(timer);
    },
    onNotice: (notice) => shellInstance.setUpdate(notice),
    log: (text) => console.warn(text),
  });
}

// The picker's calls, answered only for the picker's own page.
function wirePicker(shellInstance: Shell): void {
  const handle = (channel: string, run: (arg: string) => PickerState | Promise<PickerState>) =>
    ipcMain.handle(channel, (event, arg: unknown) => {
      if (event.senderFrame?.url.startsWith('file:') !== true) throw new Error('not the picker');
      return run(String(arg));
    });
  handle('picker:state', () => shellInstance.pickerState());
  handle('picker:open-folder', () => shellInstance.pickFolder(false));
  handle('picker:create', () => shellInstance.pickFolder(true));
  handle('picker:open-recent', (root) => shellInstance.openRecent(root));
  handle('picker:forget', (root) => shellInstance.forgetRecent(root));
  ipcMain.on('desktop:notice-act', () => shellInstance.actOnUpdate());
  ipcMain.on('desktop:notice-dismiss', () => shellInstance.dismissNotice());
}

const projectArg = (argv: readonly string[]) => {
  const at = argv.indexOf('--project');
  return at >= 0 ? argv[at + 1] : undefined;
};

if (!app.requestSingleInstanceLock()) app.quit();
else {
  if (IS_WIN) app.setAppUserModelId('dev.otea.desktop');
  Menu.setApplicationMenu(null);
  let shellInstance: Shell | undefined;
  // `--project` on a second launch opens that project in the running app.
  app.on('second-instance', (_event, argv) => {
    const dir = projectArg(argv);
    if (dir !== undefined) void shellInstance?.open(resolve(dir));
    else shellInstance?.show();
  });
  // Closed to the tray: the app lives on until Quit Otea.
  app.on('window-all-closed', () => {});
  app.on('activate', () => shellInstance?.show());
  void app.whenReady().then(async () => {
    try {
      const copy = COPY[langOf(app.getLocale())];
      const icons = await loadIcons(join(app.getPath('userData'), 'icons'));
      shellInstance = new Shell(icons, copy);
      shellInstance.start();
      wirePicker(shellInstance);
      wireUpdates(shellInstance);
      const first = firstProject({ asked: ASKED_DIR, recents: readRecents(), exists: existsSync });
      if (first.kind === 'open') await shellInstance.open(first.dir, PORT);
      else await shellInstance.showPicker();
    } catch (error) {
      fail(message(error));
    }
  });
}
