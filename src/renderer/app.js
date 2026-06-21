const api = window.vision;

let state = { config: null, active: [], paused: false, bible: null, bibleSelection: new Set() };
let currentTab = 'modules';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const PRESETS = [
  { name: 'Default', hex: '#9c2bff' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Cyan', hex: '#00ccff' },
  { name: 'Green', hex: '#00cd79' },
  { name: 'Orange', hex: '#ff6600' },
  { name: 'Red', hex: '#ff3b5c' },
  { name: 'Pink', hex: '#ff2d9b' },
  { name: '<3', hex: '#c86177' },
];

function hexToRgb(hex) {
  let h = (hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function lighten(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => Math.min(255, Math.round(v + (255 - v) * (amt / 100)));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function applyAccent(hex) {
  if (!/^#?[0-9a-fA-F]{3,6}$/.test(hex)) return;
  if (hex[0] !== '#') hex = '#' + hex;
  const { r, g, b } = hexToRgb(hex);
  const s = document.documentElement.style;
  s.setProperty('--purple', hex);
  s.setProperty('--purple-2', lighten(hex, 28));
  s.setProperty('--purple-glow', `rgba(${r},${g},${b},0.55)`);
  s.setProperty('--border', `rgba(${r},${g},${b},0.16)`);
  s.setProperty('--border-strong', `rgba(${r},${g},${b},0.38)`);
  s.setProperty('--accent-wash', `rgba(${r},${g},${b},0.20)`);
  s.setProperty('--accent-wash2', `rgba(${r},${g},${b},0.14)`);
}

async function setAccent(hex) {
  if (hex[0] !== '#') hex = '#' + hex;
  state.config.accent = hex;
  applyAccent(hex);
  syncAccentControls();
  await api.saveSettings({ accent: hex });
}

function syncAccentControls() {
  const cur = (state.config.accent || '#9c2bff').toLowerCase();
  $$('.swatch').forEach((sw) => sw.classList.toggle('active', sw.dataset.hex.toLowerCase() === cur));
  const pick = $('#accent-picker');
  const hexIn = $('#accent-hex');
  if (pick) pick.value = cur;
  if (hexIn) hexIn.value = cur;
}

function applyName(name) {
  const n = name && name.trim() ? name : 'Vision Client';
  $('#profile-name').textContent = n;
  const tu = $('#tb-user');
  if (tu) tu.textContent = name && name.trim() ? name : 'woof';
}

async function saveName(name) {
  name = (name || '').trim();
  state.config.userName = name;
  applyName(name);
  await api.saveSettings({ userName: name });
}

function applyAvatar(bust) {
  const img = $('#profile-avatar');
  if (!img) return;
  if (state.config.avatarPath) {
    img.src = `vavatar://profile?${bust || Date.now()}`;
  } else {
    img.src = '../../assets/visionpfp.png';
  }
}

function maybePromptName() {
  if (state.config.userName && state.config.userName.trim()) return;
  const modal = $('#name-modal');
  const input = $('#name-input');
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
  const submit = async () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    await saveName(v);
    modal.classList.add('hidden');
  };
  $('#name-save').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function applyBackground(bg) {
  bg = bg || { kind: 'gradient' };
  const layer = $('#bg-layer');
  layer.innerHTML = '';
  const opacity = bg.opacity != null ? bg.opacity : 0.55;
  let el = null;
  if (bg.kind === 'builtin' && bg.src) {
    el = new Image();
    el.src = bg.src;
  } else if (bg.kind === 'custom') {
    const bust = '?' + Date.now();
    if (bg.video) {
      el = document.createElement('video');
      el.src = 'vbg://file' + bust;
      el.autoplay = true; el.loop = true; el.muted = true; el.playsInline = true;
    } else {
      el = new Image();
      el.src = 'vbg://file' + bust;
    }
  }
  if (el) {
    el.style.opacity = opacity;
    if (bg.blur) el.style.filter = `blur(${bg.blur}px)`;
    layer.appendChild(el);
  }
  $('#bg-tint').style.setProperty('--dim', bg.dim != null ? bg.dim : 0.45);
}

async function setBg(partial) {
  state.config.background = { ...(state.config.background || {}), ...partial };
  applyBackground(state.config.background);
  markBgActive();
  const saved = await api.setBackground(partial);
  if (saved) state.config.background = saved;
}

function markBgActive() {
  const bg = state.config.background || { kind: 'gradient' };
  $$('.bg-thumb').forEach((t) => {
    let active = false;
    if (t.dataset.kind === 'gradient') active = bg.kind === 'gradient';
    else if (t.dataset.kind === 'builtin') active = bg.kind === 'builtin' && bg.src === t.dataset.src;
    else if (t.dataset.kind === 'pick') active = bg.kind === 'custom';
    t.classList.toggle('active', active);
  });
}

function dirLabel(f) { return f.isOutbound ? 'Upload' : 'Download'; }
function limitLabel(f) { return f.bytes <= 1 ? 'Block' : `${f.bytes} B/s`; }
function portLabel(f) {
  if (f.beginPort === 0) return 'Full Game';
  return f.beginPort === f.endPort ? `Port ${f.beginPort}` : `${f.beginPort}-${f.endPort}`;
}

function moduleKeyLabel(mod, key) {
  if (!mod || mod === 'None') return esc(key || '?');
  const prefix = mod === 'Control' ? 'CTRL' : mod.toUpperCase();
  return `${prefix}+${esc(key || '?')}`;
}

function renderModules() {
  const mod = $('#modules');
  mod.innerHTML = '';
  const filters = state.config.filters;
  const m = state.config.modifier || 'Control';
  for (const f of filters) {
    const active = state.active.includes(f.id);
    const el = document.createElement('div');
    el.className = 'module' + (active ? ' active' : '');
    el.dataset.id = f.id;
    el.innerHTML = `
      <div class="mod-top">
        <span class="mod-name">${esc(f.name)}</span>
        <span class="mod-key">${moduleKeyLabel(m, f.key)}</span>
      </div>
      <div class="mod-meta">
        <span class="tag">${portLabel(f)}</span>
        <span class="tag dir-${f.isOutbound ? 'out' : 'in'}">${dirLabel(f)}</span>
        <span class="tag ${f.bytes <= 1 ? 'block' : ''}">${limitLabel(f)}</span>
        ${f.mode === 'slow' ? '<span class="tag slow">Slow</span>' : ''}
        ${f.mode !== 'slow' && f.buffer > 0 ? `<span class="tag buffer">Buffer ${f.buffer}s</span>` : ''}
      </div>
      <div class="mod-bottom">
        <span class="mod-state">${active ? 'LIMITING' : 'Inactive'}</span>
        <span class="switch"></span>
      </div>`;
    el.addEventListener('click', () => toggle(f.id));
    mod.appendChild(el);
  }
  updateActiveCount();
}

async function toggle(id) {
  await api.toggleFilter(id);
  
}

function setActiveState(ids) {
  state.active = ids;
  $$('.module').forEach((el) => {
    const active = ids.includes(el.dataset.id);
    el.classList.toggle('active', active);
    const st = el.querySelector('.mod-state');
    if (st) st.textContent = active ? 'LIMITING' : 'Inactive';
  });
  updateActiveCount();
}

function updateActiveCount() {
  const total = state.config ? state.config.filters.length : 0;
  $('#st-active').textContent = `${state.active.length} / ${total}`;
  $('#st-active').classList.toggle('on', state.active.length > 0);
}

function renderFilters() {
  const tb = $('#filter-rows');
  tb.innerHTML = '';
  state.config.filters.forEach((f, i) => {
    const key = f.key || '';
    const mode = f.mode === 'slow' ? 'slow' : 'normal';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-name"><input data-k="name" value="${esc(f.name)}" /></td>
      <td class="col-num"><input data-k="beginPort" type="number" min="0" max="65535" value="${f.beginPort}" /></td>
      <td class="col-num"><input data-k="endPort" type="number" min="0" max="65535" value="${f.endPort}" /></td>
      <td class="col-dir">
        <select data-k="isOutbound">
          <option value="false" ${!f.isOutbound ? 'selected' : ''}>Download</option>
          <option value="true" ${f.isOutbound ? 'selected' : ''}>Upload</option>
        </select>
      </td>
      <td class="col-num"><input data-k="bytes" type="number" min="0" value="${f.bytes}" /></td>
      <td class="col-mode">
        <select data-k="mode">
          <option value="normal" ${mode === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="slow" ${mode === 'slow' ? 'selected' : ''}>Slow</option>
        </select>
      </td>
      <td class="col-num"><input data-k="buffer" type="number" min="0" value="${f.buffer || 0}" title="Normal mode only. 0 = off." ${mode === 'slow' ? 'disabled' : ''} /></td>
      <td class="col-key">
        <button type="button" class="bind-btn filter-bind" data-k="key" data-value="${esc(key)}">${esc(HotkeyBind.displayLabel(key, '—'))}</button>
      </td>
      <td><button class="row-del" data-i="${i}">&#x2715;</button></td>`;
    tb.appendChild(tr);
  });
  mountFilterBindButtons();
  $$('#filter-rows select[data-k="mode"]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const buf = sel.closest('tr')?.querySelector('[data-k="buffer"]');
      if (buf) buf.disabled = sel.value === 'slow';
      scheduleFilterAutoSave();
    });
  });
  $$('.row-del').forEach((b) =>
    b.addEventListener('click', () => {
      state.config.filters.splice(parseInt(b.dataset.i, 10), 1);
      renderFilters();
      scheduleFilterAutoSave();
    })
  );
}

function mountFilterBindButtons() {
  HotkeyBind.mountBindButtons('.filter-bind', {
    allowMouse: false,
    getValue: (btn) => btn.dataset.value || '',
    onCapture: (accel, btn) => {
      const key = HotkeyBind.extractFilterKey(accel);
      btn.dataset.value = key;
      btn.textContent = HotkeyBind.displayLabel(key, '—');
      scheduleFilterAutoSave();
    },
  });
}

let filterAutoSaveTimer = null;
const FILTER_AUTOSAVE_MS = 10000;

function scheduleFilterAutoSave() {
  if (filterAutoSaveTimer) clearTimeout(filterAutoSaveTimer);
  filterAutoSaveTimer = setTimeout(() => {
    filterAutoSaveTimer = null;
    saveFiltersNow(true);
  }, FILTER_AUTOSAVE_MS);
}

async function saveFiltersNow(isAuto) {
  if (filterAutoSaveTimer) {
    clearTimeout(filterAutoSaveTimer);
    filterAutoSaveTimer = null;
  }
  if (!state.config) return;
  const filters = collectFilters();
  state.config.filters = await api.saveFilters(filters);
  renderModules();
  toast('info', isAuto ? 'Filters auto-saved.' : 'Filters saved.');
}

function collectFilters() {
  const rows = $$('#filter-rows tr');
  return rows.map((tr, i) => {
    const get = (k) => tr.querySelector(`[data-k="${k}"]`);
    const existing = state.config.filters[i] || {};
    return {
      id: existing.id || 'm' + Date.now() + i,
      name: get('name').value || 'Module',
      beginPort: clampPort(get('beginPort').value),
      endPort: clampPort(get('endPort').value),
      bytes: Math.max(0, parseInt(get('bytes').value, 10) || 0),
      mode: get('mode').value === 'slow' ? 'slow' : 'normal',
      buffer: Math.max(0, parseInt(get('buffer').value, 10) || 0),
      key: (get('key').dataset.value || '').trim(),
      isOutbound: get('isOutbound').value === 'true',
    };
  });
}

function clampPort(v) {
  let n = parseInt(v, 10) || 0;
  return Math.min(65535, Math.max(0, n));
}

function resetBibleSelection() {
  state.bibleSelection.clear();
  $$('#bible-list input[type=checkbox]').forEach((cb) => { cb.checked = false; });
  const desc = $('#bible-desc');
  if (desc) desc.textContent = 'Select a preset to see what it does.';
  $$('.macro-toggle').forEach((t) => { t.checked = false; });
  api.stopMacro();
  syncChatMacroOptions();
}

async function loadBible() {
  if (!state.bible) {
    state.bible = await api.getBiblePresets();
  }
  state.bibleSelection = new Set();
  $('#bible-credit').textContent = state.bible.credit || 'harryy2533';
  renderBible();
  fillMacroHotkeys();
  $('#bible-desc').textContent = 'Select a preset to see what it does.';
}

function renderBible() {
  if (!state.bible) return;
  const list = $('#bible-list');
  list.innerHTML = '';
  let lastCat = '';
  for (const p of state.bible.presets) {
    if (p.category !== lastCat) {
      lastCat = p.category;
      const h = document.createElement('div');
      h.className = 'bible-cat';
      h.textContent = p.category;
      list.appendChild(h);
    }
    const row = document.createElement('label');
    row.className = 'bible-row';
    const checked = state.bibleSelection.has(p.id);
    row.innerHTML = `
      <input type="checkbox" data-id="${esc(p.id)}" ${checked ? 'checked' : ''} />
      <span class="bible-name">${esc(p.name)}</span>`;
    const cb = row.querySelector('input');
    cb.addEventListener('change', () => {
      if (cb.checked) {
        state.bibleSelection.add(p.id);
        $('#bible-desc').textContent = p.description;
      } else {
        state.bibleSelection.delete(p.id);
      }
    });
    cb.addEventListener('mouseenter', () => {
      if (cb.checked) $('#bible-desc').textContent = p.description;
    });
    row.addEventListener('mouseenter', () => { $('#bible-desc').textContent = p.description; });
    if (checked) $('#bible-desc').textContent = p.description;
    list.appendChild(row);
  }
}

function switchBibleSubtab(name) {
  $$('.bible-subtab').forEach((t) => t.classList.toggle('active', t.dataset.bibleTab === name));
  $('#bible-panel-presets').classList.toggle('hidden', name !== 'presets');
  $('#bible-panel-macros').classList.toggle('hidden', name !== 'macros');
}

async function applyBiblePresets() {
  const ids = [...state.bibleSelection];
  if (!ids.length) { toast('warn', 'Select at least one preset.'); return; }
  const result = await api.applyBiblePresets(ids);
  state.config.filters = result.filters;
  renderModules();
  toast('info', result.added > 0
    ? `Added ${result.added} new filter(s). Check the Modules tab.`
    : 'All selected filters already exist.');
  resetBibleSelection();
}

function fillMacroHotkeys() {
  const hotkeys = state.config.macroHotkeys || {};
  $$('.macro-bind').forEach((btn) => {
    const type = btn.dataset.macro;
    const val = hotkeys[type] || btn.dataset.default || '';
    btn.dataset.value = val;
    btn.textContent = HotkeyBind.displayLabel(val, btn.dataset.default);
  });
  const chatText = (state.config.bibleMacros && state.config.bibleMacros.chatMacroText) || '';
  const chatInput = $('#chat-macro-text');
  if (chatInput) chatInput.value = chatText;
  fillDualityMacroFields();
  syncChatMacroOptions();
  syncDualityMacroOptions();
}

const DUALITY_FIELDS = [
  ['dualityOpenX', 'duality-open-x'],
  ['dualityOpenY', 'duality-open-y'],
  ['dualityLoadout1X', 'duality-l1-x'],
  ['dualityLoadout2X', 'duality-l2-x'],
  ['dualityLoadout3X', 'duality-l3-x'],
  ['dualityLoadout4X', 'duality-l4-x'],
  ['dualityLoadoutY', 'duality-loadout-y'],
  ['dualitySwapDelay', 'duality-swap-delay'],
];

function fillDualityMacroFields() {
  const macros = state.config.bibleMacros || {};
  for (const [key, id] of DUALITY_FIELDS) {
    const el = document.getElementById(id);
    if (!el || macros[key] == null) continue;
    el.value = macros[key];
  }
}

async function saveDualityMacroField(key, raw) {
  const num = parseInt(raw, 10);
  if (Number.isNaN(num)) return;
  const partial = { [key]: num };
  state.config = await api.saveSettings({ bibleMacros: partial });
  if (!state.config.bibleMacros) state.config.bibleMacros = {};
  Object.assign(state.config.bibleMacros, partial);
}

function syncPauseBindButtons(hotkey) {
  const hk = hotkey || state.config.pauseHotkey || 'Control+0';
  ['pause-bind-btn', 'set-pause-bind'].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.dataset.value = hk;
    btn.textContent = HotkeyBind.displayLabel(hk, btn.dataset.default);
  });
}

async function savePauseHotkey(hotkey) {
  state.config = await api.saveSettings({ pauseHotkey: hotkey || 'Control+0' });
  syncPauseBindButtons(state.config.pauseHotkey);
  updatePauseLabel(state.config.pauseHotkey);
  toast('info', `Freeze bind set to ${state.config.pauseHotkey}`);
}

let bindControlsReady = false;

function setupBindControls() {
  if (bindControlsReady || !state.config) return;
  bindControlsReady = true;

  const hotkeys = state.config.macroHotkeys || {};
  HotkeyBind.mountBindButtons('.macro-bind', {
    getValue: (btn) => hotkeys[btn.dataset.macro] || btn.dataset.default,
    onCapture: async (accel, btn) => {
      const type = btn.dataset.macro;
      state.config.macroHotkeys = await api.saveMacroHotkeys({ [type]: accel });
      toast('info', `${type} bind: ${accel}`);
    },
  });

  const pauseHotkey = state.config.pauseHotkey || 'Control+0';
  HotkeyBind.mountBindButton($('#set-pause-bind'), {
    value: pauseHotkey,
    onCapture: savePauseHotkey,
  });

  HotkeyBind.mountBindButton($('#pause-bind-btn'), {
    value: pauseHotkey,
    onCapture: async (accel) => {
      await savePauseHotkey(accel);
      hidePauseBindMenu();
    },
  });

  const pauseBtn = $('#btn-pause');
  const menu = $('#pause-bind-menu');
  pauseBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    syncPauseBindButtons();
    menu.classList.remove('hidden');
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
  });
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target) && e.target !== pauseBtn) {
      hidePauseBindMenu();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePauseBindMenu();
  });
}

function hidePauseBindMenu() {
  const menu = $('#pause-bind-menu');
  menu.classList.add('hidden');
  HotkeyBind.stopCapture();
}

function syncChatMacroOptions() {
  const chatOn = !!document.querySelector('.macro-toggle[data-macro="chat"]')?.checked;
  $('#chat-macro-options')?.classList.toggle('hidden', !chatOn);
}

function syncDualityMacroOptions() {
  const dualityOn = !!document.querySelector('.macro-toggle[data-macro="duality"]')?.checked;
  $('#duality-macro-options')?.classList.toggle('hidden', !dualityOn);
}

async function saveMacroHotkey(type, value) {
  state.config.macroHotkeys = await api.saveMacroHotkeys({ [type]: value });
}

async function toggleMacro(el) {
  const type = el.dataset.macro;
  if (el.checked) {
    $$('.macro-toggle').forEach((t) => { if (t !== el) t.checked = false; });
    await api.startMacro(type);
    const key = (state.config.macroHotkeys && state.config.macroHotkeys[type]) || '';
    toast('info', key ? `${type} enabled — use ${key} in-game.` : `${type} macro enabled.`);
  } else {
    await api.stopMacro();
  }
  syncChatMacroOptions();
  syncDualityMacroOptions();
}

function setMacroActive(type) {
  $$('.macro-toggle').forEach((t) => {
    t.checked = type ? t.dataset.macro === type : false;
  });
  syncChatMacroOptions();
  syncDualityMacroOptions();
}

function updatePauseLabel(hotkey) {
  const hk = hotkey || state.config.pauseHotkey || 'Control+0';
  const btn = $('#btn-pause');
  if (!btn) return;
  const label = state.paused ? 'Resume Game' : 'Freeze Game';
  btn.lastChild.textContent = ` ${label} (${hk})`;
}

function fillSettings() {
  $('#set-name').value = state.config.userName || '';
  $('#set-modifier').value = state.config.modifier || 'Control';
  syncPauseBindButtons(state.config.pauseHotkey);
  $('#set-overlay').checked = !!state.config.overlay;
  syncAccentControls();
  markBgActive();
  const bg = state.config.background || {};
  const op = Math.round((bg.opacity != null ? bg.opacity : 0.55) * 100);
  const dim = Math.round((bg.dim != null ? bg.dim : 0.45) * 100);
  const blur = bg.blur || 0;
  $('#bg-opacity').value = op; $('#op-val').textContent = op + '%';
  $('#bg-dim').value = dim; $('#dim-val').textContent = dim + '%';
  $('#bg-blur').value = blur; $('#blur-val').textContent = blur + 'px';
}

function setupAppearance() {
  
  const wrap = $('#swatches');
  wrap.innerHTML = '';
  for (const p of PRESETS) {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.dataset.hex = p.hex;
    sw.style.background = p.hex;
    sw.style.color = p.hex;
    sw.title = p.name;
    sw.addEventListener('click', () => setAccent(p.hex));
    wrap.appendChild(sw);
  }
  $('#accent-picker').addEventListener('input', (e) => setAccent(e.target.value));
  $('#accent-hex').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(v)) setAccent(v);
  });

  $$('.bg-thumb').forEach((t) =>
    t.addEventListener('click', async () => {
      const kind = t.dataset.kind;
      if (kind === 'gradient') setBg({ kind: 'gradient', src: '' });
      else if (kind === 'builtin') setBg({ kind: 'builtin', src: t.dataset.src, video: false });
      else if (kind === 'pick') {
        const saved = await api.pickBackground();
        if (saved) {
          state.config.background = saved;
          applyBackground(saved);
          markBgActive();
        }
      }
    })
  );

  const slider = (id, label, suffix, toVal) => {
    const el = $('#' + id);
    el.addEventListener('input', () => {
      $('#' + label).textContent = el.value + suffix;
      const bg = { ...state.config.background, ...toVal(el.value) };
      state.config.background = bg;
      applyBackground(bg);
    });
    el.addEventListener('change', () => setBg(toVal(el.value)));
  };
  slider('bg-opacity', 'op-val', '%', (v) => ({ opacity: v / 100 }));
  slider('bg-dim', 'dim-val', '%', (v) => ({ dim: v / 100 }));
  slider('bg-blur', 'blur-val', 'px', (v) => ({ blur: parseInt(v, 10) }));
}

function applyStatus(s) {
  if (s.kind === 'target') {
    const pill = $('#st-game');
    pill.textContent = s.running ? `PID ${s.pid}` : 'Offline';
    pill.classList.toggle('on', s.running);
    pill.classList.toggle('off', !s.running);
  } else if (s.kind === 'engine') {
    const pill = $('#st-engine');
    pill.textContent = s.open ? 'Active' : 'Idle';
    pill.classList.toggle('on', s.open);
    pill.classList.toggle('off', !s.open);
  } else if (s.kind === 'error') {
    toast('error', s.message);
    const pill = $('#st-engine');
    pill.textContent = 'Error';
    pill.classList.remove('on');
    pill.classList.add('off');
  }
}

function setPause(p) {
  state.paused = p;
  const dot = $('#btn-pause .dot');
  if (dot) dot.classList.toggle('on', p);
  updatePauseLabel();
}

let toastTimers = [];
function toast(kind, message) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  $('#toasts').appendChild(el);
  const t = setTimeout(() => el.remove(), 4200);
  toastTimers.push(t);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function switchTab(name) {
  if (currentTab === 'bible' && name !== 'bible') {
    resetBibleSelection();
  }
  currentTab = name;
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + name));
  if (name === 'filters') renderFilters();
  if (name === 'settings') fillSettings();
  if (name === 'bible') loadBible();
}

function wire() {
  $('#btn-min').addEventListener('click', () => api.minimize());
  $('#btn-hide').addEventListener('click', () => api.hide());
  $('#btn-close').addEventListener('click', () => api.close());
  $('#btn-discord').addEventListener('click', () => api.openExternal('https://discord.gg/yQS9sZT4r2'));

  $$('.nav-item').forEach((n) => n.addEventListener('click', () => switchTab(n.dataset.tab)));

  $('#btn-clear').addEventListener('click', async () => {
    await api.clearAll();
    toast('info', 'All modules disabled.');
  });
  $('#btn-kill').addEventListener('click', async () => {
    const ids = state.active.length
      ? state.active
      : state.config.filters.map((f) => f.id);
    await api.kill(ids);
    toast('info', state.active.length
      ? 'Killed connections on active modules (5s hard drop).'
      : 'Killed connections on all modules (5s hard drop).');
  });
  $('#btn-pause').addEventListener('click', () => api.togglePause());

  $('#btn-add-filter').addEventListener('click', () => {
    state.config.filters = collectFilters();
    state.config.filters.push({
      id: 'm' + Date.now(), name: 'New Module', beginPort: 3074, endPort: 3074,
      bytes: 1, key: '', isOutbound: false, buffer: 0, mode: 'normal',
    });
    renderFilters();
    scheduleFilterAutoSave();
  });
  $('#btn-save-filters').addEventListener('click', () => saveFiltersNow(false));

  const filterRows = $('#filter-rows');
  if (filterRows) {
    filterRows.addEventListener('input', scheduleFilterAutoSave);
    filterRows.addEventListener('change', scheduleFilterAutoSave);
  }

  $('#btn-save-settings').addEventListener('click', async () => {
    const partial = {
      userName: $('#set-name').value.trim(),
      modifier: $('#set-modifier').value,
      pauseHotkey: $('#set-pause-bind').dataset.value || state.config.pauseHotkey || 'Control+0',
      overlay: $('#set-overlay').checked,
    };
    state.config = await api.saveSettings(partial);
    applyName(state.config.userName);
    renderModules();
    updatePauseLabel(state.config.pauseHotkey);
    toast('info', 'Settings saved.');
  });

  $$('.bible-subtab').forEach((t) =>
    t.addEventListener('click', () => switchBibleSubtab(t.dataset.bibleTab))
  );
  $('#btn-bible-apply').addEventListener('click', applyBiblePresets);
  $('#btn-bible-guide').addEventListener('click', () =>
    api.openExternal('https://docs.google.com/document/d/1MbvwJBDC_Pcic5_m6xuyCvDxMnV7vPcEojG97G71mto/edit')
  );
  $('#bible-credit').addEventListener('click', (e) => {
    e.preventDefault();
    api.openExternal('https://docs.google.com/document/d/1MbvwJBDC_Pcic5_m6xuyCvDxMnV7vPcEojG97G71mto/edit');
  });
  $$('.macro-toggle').forEach((el) =>
    el.addEventListener('change', () => toggleMacro(el))
  );
  $('#chat-macro-text')?.addEventListener('change', async (e) => {
    const text = e.target.value.trim();
    await api.saveChatMacroText(text);
    if (state.config.bibleMacros) state.config.bibleMacros.chatMacroText = text;
  });
  for (const [key, id] of DUALITY_FIELDS) {
    document.getElementById(id)?.addEventListener('change', async (e) => {
      await saveDualityMacroField(key, e.target.value);
    });
  }

  setupAppearance();

  $('#profile-avatar').addEventListener('click', async () => {
    const result = await api.pickAvatar();
    if (!result) return;
    state.config.avatarPath = result.avatarPath || '';
    applyAvatar(result.bust);
    toast('info', result.avatarPath ? 'Profile picture updated.' : 'Profile picture unchanged.');
  });

  api.on('engine:active', (ids) => setActiveState(ids));
  api.on('engine:status', (s) => applyStatus(s));
  api.on('pause:state', ({ paused }) => setPause(paused));
  api.on('hotkeys:updated', ({ pauseHotkey }) => {
    syncPauseBindButtons(pauseHotkey);
    updatePauseLabel(pauseHotkey);
  });
  api.on('toast', ({ kind, message }) => toast(kind, message));
}

(async function init() {
  try {
    wire();
    state = await api.getState();
    if (!state.config) { toast('error', 'Failed to load config.'); return; }
    $('#version').textContent = 'v' + state.version;
    applyAccent(state.config.accent || '#9c2bff');
    applyBackground(state.config.background);
    applyName(state.config.userName);
    applyAvatar();
    renderModules();
    setActiveState(state.active);
    setPause(state.paused);
    fillMacroHotkeys();
    setupBindControls();
    syncPauseBindButtons();
    updatePauseLabel();
    if (state.lastError) toast('error', state.lastError);
    maybePromptName();
  } catch (err) {
    console.error(err);
    toast('error', `Startup failed: ${err.message}`);
  }
})();
