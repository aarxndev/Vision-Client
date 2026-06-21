const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const {
  app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, shell, dialog, protocol, net,
} = require('electron');
const { ensureAdminElevation } = require('./admin');

const isDev = process.argv.includes('--dev');
ensureAdminElevation({ app, isDev });

const config = require('./config');
const { Engine } = require('./windivert/engine');
const { PRESETS, GUIDE_URL, CREDIT } = require('./bible-presets');
const { applyPresets } = require('./filter-preset-service');
const macroEngine = require('./macro-engine');
const { normalizeAccel } = require('./hotkeys');
const avatar = require('./avatar');

protocol.registerSchemesAsPrivileged([
  { scheme: 'vbg', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
  { scheme: 'vavatar', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const ICON = () => path.join(__dirname, '..', '..', 'assets', 'visionicon.ico');

let win = null;
let overlayWin = null;
let tray = null;
let cfg = null;
let engine = null;
let paused = false;
let quitting = false;

function quitApp() {
  if (quitting) return;
  quitting = true;
  app.isQuitting = true;
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.destroy();
    overlayWin = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
  app.quit();
}

function createWindow() {
  win = new BrowserWindow({
    width: 940,
    height: 640,
    minWidth: 820,
    minHeight: 560,
    frame: false,
    backgroundColor: '#0a0710',
    show: false,
    icon: ICON(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  win.on('closed', () => (win = null));
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) return;
  overlayWin = new BrowserWindow({
    width: 320,
    height: 420,
    x: 14,
    y: 14,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
  overlayWin.once('ready-to-show', () => {
    overlayWin.showInactive();
    pushOverlay();
  });
}

function setOverlayEnabled(on) {
  if (on) {
    createOverlay();
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.showInactive();
  } else if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.destroy();
    overlayWin = null;
  }
}

function overlayDescriptors() {
  return cfg.filters.map((f) => ({
    id: f.id,
    name: f.name,
    dir: f.isOutbound ? 'UL' : 'DL',
    port:
      f.beginPort === 0
        ? 'GAME'
        : f.beginPort === f.endPort
        ? String(f.beginPort)
        : `${f.beginPort}-${f.endPort}`,
    block: f.bytes <= 1,
    on: engine.isActive(f.id),
  }));
}

function pushOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('overlay:update', overlayDescriptors());
  }
}

function broadcastActive() {
  send('engine:active', engine.activeIds());
  pushOverlay();
}

function startEngine() {
  engine = new Engine();
  engine.onStatus = (s) => {
    send('engine:status', s);
    if (s.kind === 'target') updateTray(s);
  };
  engine.setFilters(cfg.filters, cfg.targetProcess);
  return engine.start();
}

function filterAccel(key) {
  if (!key) return null;
  const mod = (cfg.modifier || 'Control').trim();
  if (!mod || mod.toLowerCase() === 'none') return normalizeAccel(String(key));
  return normalizeAccel(`${mod}+${key}`);
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  for (const f of cfg.filters) {
    if (!f.key) continue;
    const accel = filterAccel(f.key);
    if (!accel) continue;
    try {
      globalShortcut.register(accel, () => { onToggleFilter(f.id); });
    } catch {}
  }
  if (cfg.pauseHotkey) {
    try {
      globalShortcut.register(normalizeAccel(cfg.pauseHotkey), () => togglePause());
    } catch {}
  }
  send('hotkeys:updated', {
    pauseHotkey: cfg.pauseHotkey || 'Control+0',
    macroHotkeys: cfg.macroHotkeys || {},
  });
}

async function refreshAvatarServices() {
  if (cfg.avatarPath && fs.existsSync(cfg.avatarPath)) {
    await avatar.startServer(cfg.avatarPath);
  } else {
    avatar.stopServer();
  }
}

async function togglePause() {
  const pid = engine.getPid();
  if (!pid) {
    send('toast', { kind: 'warn', message: `${cfg.targetProcess} is not running.` });
    return;
  }
  paused = !paused;
  const ok = paused ? await engine.suspend(pid) : await engine.resume(pid);
  if (!ok) paused = !paused;
  send('pause:state', { paused });
  send('toast', {
    kind: 'info',
    message: paused ? 'Game process frozen.' : 'Game process resumed.',
  });
}

async function onToggleFilter(id) {
  const on = await engine.toggle(id);
  send('filter:state', { id, active: on });
  broadcastActive();
}

function updateTray(target) {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: target.running ? `${target.name} — running (PID ${target.pid})` : `${target.name} — not running`, enabled: false },
    { type: 'separator' },
    { label: 'Show Vision', click: () => win && win.show() },
    { label: 'Disable all modules', click: async () => { await engine.clearAll(); broadcastActive(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => quitApp() },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  try {
    tray = new Tray(ICON());
    tray.setToolTip('Vision Client');
    tray.on('double-click', () => win && win.show());
    updateTray({ running: false, name: cfg.targetProcess, pid: null });
  } catch {}
}

function setupIpc() {
  ipcMain.handle('app:getState', () => ({
    config: cfg,
    active: engine.activeIds(),
    paused,
    version: app.getVersion(),
    pid: engine.getPid(),
    lastError: engine.lastError(),
  }));

  ipcMain.handle('filter:toggle', async (_e, id) => {
    const on = await engine.toggle(id);
    broadcastActive();
    return on;
  });

  ipcMain.handle('filter:setActive', async (_e, { id, on }) => {
    await engine.setActive(id, on);
    broadcastActive();
    return engine.isActive(id);
  });

  ipcMain.handle('filters:clearAll', async () => {
    await engine.clearAll();
    broadcastActive();
    return true;
  });

  ipcMain.handle('filter:kill', (_e, ids) => {
    engine.kill(ids && ids.length ? ids : engine.activeIds(), 5000);
    return true;
  });

  ipcMain.handle('filters:save', (_e, filters) => {
    cfg.filters = filters;
    config.save(cfg);
    engine.setFilters(cfg.filters, cfg.targetProcess);
    registerHotkeys();
    broadcastActive();
    return cfg.filters;
  });

  ipcMain.handle('settings:save', async (_e, partial) => {
    const prevOverlay = cfg.overlay;
    const prevRpc = cfg.discordRpc;
    if (partial.bibleMacros) {
      cfg.bibleMacros = { ...cfg.bibleMacros, ...partial.bibleMacros };
      delete partial.bibleMacros;
    }
    if (partial.macroHotkeys) {
      cfg.macroHotkeys = { ...cfg.macroHotkeys, ...partial.macroHotkeys };
      delete partial.macroHotkeys;
    }
    cfg = { ...cfg, ...partial };
    cfg.targetProcess = 'destiny2.exe';
    config.save(cfg);
    engine.setFilters(cfg.filters, cfg.targetProcess);
    registerHotkeys();
    if (macroEngine.isRunning()) macroEngine.setCfg(cfg);
    if (cfg.overlay !== prevOverlay) setOverlayEnabled(cfg.overlay);
    if (cfg.discordRpc !== prevRpc) {
      if (cfg.discordRpc) {
        refreshAvatarServices().then(() => {
          discordRpc.init().then(() => updateDiscordPresence('Browsing Modules'));
        });
      } else {
        await discordRpc.shutdown();
      }
    }
    broadcastActive();
    return cfg;
  });

  ipcMain.handle('bible:getPresets', () => ({
    presets: PRESETS,
    guideUrl: GUIDE_URL,
    credit: CREDIT,
    enabled: cfg.bibleEnabledPresets || [],
  }));

  ipcMain.handle('bible:saveSelection', (_e, ids) => {
    cfg.bibleEnabledPresets = ids;
    config.save(cfg);
    return cfg.bibleEnabledPresets;
  });

  ipcMain.handle('bible:applyPresets', (_e, presetIds) => {
    const selected = PRESETS.filter((p) => presetIds.includes(p.id));
    const { filters, added } = applyPresets(selected, cfg.filters);
    cfg.filters = filters;
    cfg.bibleEnabledPresets = presetIds;
    config.save(cfg);
    engine.setFilters(cfg.filters, cfg.targetProcess);
    registerHotkeys();
    broadcastActive();
    return { filters: cfg.filters, added };
  });

  ipcMain.handle('macro:start', async (_e, type) => {
    await macroEngine.stop();
    await macroEngine.start(type, cfg);
    return macroEngine.getActive();
  });

  ipcMain.handle('macro:stop', async () => {
    await macroEngine.stop();
    return true;
  });

  ipcMain.handle('macro:saveHotkeys', (_e, hotkeys) => {
    cfg.macroHotkeys = { ...cfg.macroHotkeys, ...hotkeys };
    config.save(cfg);
    registerHotkeys();
    return cfg.macroHotkeys;
  });

  ipcMain.handle('macro:saveChatText', (_e, text) => {
    cfg.bibleMacros = { ...cfg.bibleMacros, chatMacroText: text || '' };
    config.save(cfg);
    if (macroEngine.isRunning()) macroEngine.setCfg(cfg);
    return cfg.bibleMacros.chatMacroText;
  });

  ipcMain.handle('macro:status', () => ({
    active: macroEngine.getActive(),
    running: macroEngine.isRunning(),
  }));

  ipcMain.handle('pause:toggle', () => {
    togglePause();
    return paused;
  });

  ipcMain.handle('game:launch', () => {
    
    shell.openExternal('steam://run/1085660').catch(() => {});
    return true;
  });

  ipcMain.handle('bg:pick', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose a background',
      properties: ['openFile'],
      filters: [
        { name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'ogg', 'mov'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'Video', extensions: ['mp4', 'webm', 'ogg', 'mov'] },
      ],
    });
    if (res.canceled || !res.filePaths[0]) return cfg.background;
    const file = res.filePaths[0];
    const ext = path.extname(file).toLowerCase().replace('.', '');
    const video = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
    cfg.background = { ...cfg.background, kind: 'custom', file, video, src: 'vbg://file' };
    config.save(cfg);
    return cfg.background;
  });

  ipcMain.handle('bg:set', (_e, partial) => {
    cfg.background = { ...cfg.background, ...partial };
    config.save(cfg);
    return cfg.background;
  });

  ipcMain.handle('avatar:pick', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose a profile picture',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    });
    if (res.canceled || !res.filePaths[0]) {
      return { avatarPath: cfg.avatarPath || '', bust: Date.now() };
    }
    const src = res.filePaths[0];
    const ext = path.extname(src).toLowerCase() || '.png';
    const dest = avatar.storagePath(app.getPath('userData'), ext);
    fs.copyFileSync(src, dest);
    cfg.avatarPath = dest;
    config.save(cfg);
    await refreshAvatarServices();
    return { avatarPath: dest, bust: Date.now() };
  });

  ipcMain.on('win:minimize', () => win && win.minimize());
  ipcMain.on('win:close', () => quitApp());
  ipcMain.on('win:hide', () => win && win.hide());
  ipcMain.on('open:external', (_e, url) => shell.openExternal(url));
}

app.whenReady().then(async () => {
  cfg = config.load();

  protocol.handle('vbg', () => {
    try {
      const f = cfg.background && cfg.background.file;
      if (f && fs.existsSync(f)) return net.fetch(pathToFileURL(f).toString());
    } catch {}
    return new Response('not found', { status: 404 });
  });

  protocol.handle('vavatar', () => {
    try {
      const f = cfg.avatarPath && fs.existsSync(cfg.avatarPath) ? cfg.avatarPath : avatar.defaultAvatarPath();
      return net.fetch(pathToFileURL(f).toString());
    } catch {}
    return new Response('not found', { status: 404 });
  });

  engine = new Engine();
  engine.onStatus = (s) => {
    send('engine:status', s);
    if (s.kind === 'target') updateTray(s);
  };
  macroEngine.bindEngine(engine);
  setupIpc();
  createWindow();
  createTray();
  registerHotkeys();
  if (cfg.overlay) createOverlay();

  engine.setFilters(cfg.filters, cfg.targetProcess);
  engine.start().catch((err) => {
    const msg = `Engine failed to start: ${err.message}`;
    console.error(msg);
    send('engine:status', { kind: 'error', message: msg });
    send('toast', { kind: 'error', message: msg });
  });
  refreshAvatarServices();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  quitApp();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  macroEngine.stop();
  avatar.stopServer();
  if (engine) {
    
    if (paused && engine.getPid()) engine.resume(engine.getPid());
    engine.clearAll();
    engine.stop();
  }
});
