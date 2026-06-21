const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  theme: 'Woof',
  userName: '', 
  
  targetProcess: 'destiny2.exe',
  
  modifier: 'Control',
  pauseHotkey: 'Control+0',
  macroHotkeys: {
    wellskate: 'Middle',
    wishwall: 'F3',
    chat: 'F2',
    duality: 'F6',
  },
  overlay: true,
  startBlockedOnLaunch: false,
  
  accent: '#9c2bff',

  avatarPath: '',
  background: { kind: 'gradient', src: '', opacity: 0.55, blur: 0, dim: 0.45 },
  bibleEnabledPresets: [],
  bibleMacros: {
    dualityOpenX: 50,
    dualityOpenY: 550,
    dualityLoadout1X: 150,
    dualityLoadout2X: 250,
    dualityLoadout3X: 350,
    dualityLoadout4X: 450,
    dualityLoadoutY: 800,
    dualitySwapDelay: 150,
    wishwallX: 960,
    wishwallY: 540,
    wellskateSuperBind: '',
    chatMacroText: 'gg',
  },
  filters: [
    mk('m1', '3074 Download', 3074, 3074, 1, '1', false),
    mk('m2', '3074 Upload', 3074, 3074, 1, '2', true),
    mk('m3', '30000-30020 Download', 30000, 30020, 1, '3', false),
    mk('m4', 'Full Game (800 B/s)', 0, 0, 800, '4', false),
    mk('m5', '27000-27200 Download', 27000, 27200, 1, '5', false),
    mk('m6', '7500-7515 Download', 7500, 7515, 1, '6', false),
  ],
};

function mk(id, name, beginPort, endPort, bytes, key, isOutbound, buffer = 0, mode = 'normal') {
  return { id, name, beginPort, endPort, bytes, key, isOutbound, buffer, mode };
}

function configPath() {
  return path.join(app.getPath('userData'), 'filters.json');
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    
    const cfg = { ...DEFAULTS, ...raw };
    cfg.targetProcess = 'destiny2.exe'; 
    if (!Array.isArray(cfg.filters) || cfg.filters.length === 0) {
      cfg.filters = DEFAULTS.filters.map((f) => ({ ...f }));
    } else {
      cfg.filters = cfg.filters.map((f) => ({ mode: 'normal', buffer: 0, ...f }));
    }
    if (!Array.isArray(cfg.bibleEnabledPresets)) cfg.bibleEnabledPresets = [];
    if (!cfg.bibleMacros) cfg.bibleMacros = { ...DEFAULTS.bibleMacros };
    if (!cfg.macroHotkeys) cfg.macroHotkeys = { ...DEFAULTS.macroHotkeys };
    else cfg.macroHotkeys = { ...DEFAULTS.macroHotkeys, ...cfg.macroHotkeys };
    return cfg;
  } catch {
    const cfg = JSON.parse(JSON.stringify(DEFAULTS));
    save(cfg);
    return cfg;
  }
}

function save(cfg) {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e.message);
  }
}

module.exports = { load, save, mk, DEFAULTS, configPath };
