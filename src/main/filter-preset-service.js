const { mk } = require('./config');

const DEFAULT_HOTKEYS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  'NumPad1', 'NumPad2', 'NumPad3', 'NumPad4', 'NumPad5', 'NumPad6',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
];

function filterExists(filters, beginPort, endPort, isOutbound, bytes) {
  return filters.some(
    (f) =>
      f.beginPort === beginPort &&
      f.endPort === endPort &&
      f.isOutbound === isOutbound &&
      f.bytes === bytes
  );
}

function nextHotkey(filters) {
  const used = new Set(filters.map((f) => (f.key || '').toLowerCase()));
  for (const k of DEFAULT_HOTKEYS) {
    if (!used.has(k.toLowerCase())) return k;
  }
  return 'F12';
}

function defaultFilterName(beginPort, endPort, isOutbound, bytes) {
  const dir = isOutbound ? 'Upload' : 'Download';
  if (beginPort === 0) return `Full Game (${bytes} B/s)`;
  if (beginPort === endPort) return `${beginPort} ${dir}`;
  return `${beginPort}-${endPort} ${dir}`;
}

function presetFilterName(presetName, spec, total) {
  if (total <= 1) return presetName;
  const dir = spec.isOutbound ? 'UL' : 'DL';
  if (spec.beginPort === spec.endPort) {
    return `${presetName} (${spec.beginPort} ${dir})`;
  }
  return `${presetName} (${dir})`;
}

function addFilter(filters, spec, displayName) {
  if (filterExists(filters, spec.beginPort, spec.endPort, spec.isOutbound, spec.bytes)) {
    return 0;
  }
  const key = spec.key || nextHotkey(filters);
  const id = 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
  const name = displayName || defaultFilterName(spec.beginPort, spec.endPort, spec.isOutbound, spec.bytes);
  filters.push(
    mk(id, name, spec.beginPort, spec.endPort, spec.bytes, key, spec.isOutbound)
  );
  return 1;
}

function applyPresets(presets, existingFilters) {
  const filters = existingFilters.map((f) => ({ ...f }));
  let added = 0;
  for (const preset of presets) {
    const total = preset.filters.length;
    for (const spec of preset.filters) {
      const name = presetFilterName(preset.name, spec, total);
      added += addFilter(filters, spec, name);
    }
  }
  return { filters, added };
}

module.exports = { applyPresets, filterExists };
