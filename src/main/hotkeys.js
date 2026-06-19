const VK = {
  RETURN: 0x0d,
  SPACE: 0x20,
  TAB: 0x09,
  SHIFT: 0x10,
  CONTROL: 0x11,
  ALT: 0x18,
  MBUTTON: 0x04,
  XBUTTON1: 0x05,
  XBUTTON2: 0x06,
  LBUTTON: 0x01,
  RBUTTON: 0x02,
};

for (let i = 0; i < 12; i++) VK[`F${i + 1}`] = 0x70 + i;

function vkFromToken(tok) {
  const t = tok.trim();
  if (!t) return null;
  const u = t.toUpperCase();
  if (VK[u] != null) return VK[u];
  if (/^F\d{1,2}$/.test(u)) {
    const n = parseInt(u.slice(1), 10);
    if (n >= 1 && n <= 24) return 0x6f + n;
  }
  if (u === 'MBUTTON' || u === 'MIDDLE' || u === 'MOUSE3') return VK.MBUTTON;
  if (u === 'MOUSE1' || u === 'LBUTTON') return VK.LBUTTON;
  if (u === 'MOUSE2' || u === 'RBUTTON') return VK.RBUTTON;
  if (u === 'XBUTTON1' || u === 'MOUSE4') return VK.XBUTTON1;
  if (u === 'XBUTTON2' || u === 'MOUSE5') return VK.XBUTTON2;
  if (t.length === 1) {
    const c = t.toUpperCase().charCodeAt(0);
    if (c >= 65 && c <= 90) return c;
    if (c >= 48 && c <= 57) return c;
  }
  return null;
}

function parseTriggerKey(accel) {
  if (!accel || typeof accel !== 'string') return null;
  const parts = accel.split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  const vk = vkFromToken(last);
  if (vk == null) return null;
  return vk;
}

function normalizeAccel(accel) {
  if (!accel || typeof accel !== 'string') return '';
  return accel.split('+').map((p) => {
    const u = p.trim();
    if (!u) return '';
    const up = u.toUpperCase();
    if (up === 'CTRL' || up === 'CONTROL') return 'Control';
    if (up === 'CMD' || up === 'COMMAND' || up === 'COMMANDORCONTROL') return 'CommandOrControl';
    if (up === 'MBUTTON' || up === 'MIDDLE' || up === 'MOUSE3') return 'Middle';
    if (up === 'XBUTTON1' || up === 'MOUSE4') return 'Mouse4';
    if (up === 'XBUTTON2' || up === 'MOUSE5') return 'Mouse5';
    if (/^f\d{1,2}$/i.test(u)) return u.toUpperCase();
    if (u.length === 1) return u.toUpperCase();
    return u.charAt(0).toUpperCase() + u.slice(1);
  }).filter(Boolean).join('+');
}

function canRegisterGlobal(accel) {
  const n = normalizeAccel(accel);
  return n && !/Middle|MButton|Mouse\d/i.test(n);
}

module.exports = { VK, parseTriggerKey, normalizeAccel, canRegisterGlobal, vkFromToken };
