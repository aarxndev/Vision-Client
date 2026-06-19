const koffi = require('koffi');

let user32, SetCursorPos, mouse_event, keybd_event, GetAsyncKeyState;

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const KEYEVENTF_KEYUP = 0x0002;

const VK = {
  RETURN: 0x0d,
  SPACE: 0x20,
  B: 0x42,
  W: 0x57,
  F2: 0x71,
  F3: 0x72,
  F6: 0x75,
  CONTROL: 0x11,
  MBUTTON: 0x04,
};

function ensureLoaded() {
  if (user32) return;
  user32 = koffi.load('user32.dll');
  SetCursorPos = user32.func('bool __stdcall SetCursorPos(int X, int Y)');
  mouse_event = user32.func('void __stdcall mouse_event(uint32 dwFlags, int dx, int dy, uint32 dwData, uintptr dwExtraInfo)');
  keybd_event = user32.func('void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)');
  GetAsyncKeyState = user32.func('int16 __stdcall GetAsyncKeyState(int32 vKey)');
  VkKeyScanW = user32.func('int16 __stdcall VkKeyScanW(uint16 ch)');
}

let VkKeyScanW;

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function click(x, y) {
  ensureLoaded();
  SetCursorPos(x, y);
  sleep(30);
  mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
  sleep(30);
  mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
}

function pressKey(vk, holdCtrl = false) {
  ensureLoaded();
  if (holdCtrl) keybd_event(VK.CONTROL, 0, 0, 0);
  keybd_event(vk, 0, 0, 0);
  sleep(40);
  keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
  if (holdCtrl) keybd_event(VK.CONTROL, 0, KEYEVENTF_KEYUP, 0);
}

function isKeyDown(vk) {
  ensureLoaded();
  return (GetAsyncKeyState(vk) & 0x8000) !== 0;
}

function typeText(text) {
  ensureLoaded();
  for (const ch of String(text || '')) {
    const code = VkKeyScanW(ch.charCodeAt(0));
    if (code === -1) continue;
    const vk = code & 0xff;
    const needsShift = (code >> 8) & 1;
    if (needsShift) keybd_event(0x10, 0, 0, 0);
    keybd_event(vk, 0, 0, 0);
    sleep(18);
    keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
    if (needsShift) keybd_event(0x10, 0, KEYEVENTF_KEYUP, 0);
    sleep(12);
  }
}

module.exports = { click, pressKey, isKeyDown, sleep, typeText, VK };
