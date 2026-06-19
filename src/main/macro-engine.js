const MACRO_TYPES = {
  NONE: 'none',
  WELLSKATE: 'wellskate',
  WISHWALL: 'wishwall',
  CHAT: 'chat',
  DUALITY: 'duality',
};

let engineRef = null;
let active = MACRO_TYPES.NONE;
let cfgRef = null;

function bindEngine(engine) {
  engineRef = engine;
}

function start(type, cfg) {
  active = type;
  cfgRef = cfg;
  if (engineRef) return engineRef.macroStart(type, cfg);
  return Promise.resolve();
}

function stop() {
  active = MACRO_TYPES.NONE;
  cfgRef = null;
  if (engineRef) return engineRef.macroStop();
  return Promise.resolve();
}

function isRunning() {
  return active !== MACRO_TYPES.NONE;
}

function getActive() {
  return active;
}

function setCfg(cfg) {
  cfgRef = cfg;
  if (isRunning() && engineRef && cfg) {
    return engineRef.macroStart(active, cfg);
  }
  return Promise.resolve();
}

module.exports = {
  bindEngine,
  start,
  stop,
  isRunning,
  getActive,
  setCfg,
  MACRO_TYPES,
};
