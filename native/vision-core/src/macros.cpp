#include "macros.h"

#include <chrono>
#include <cctype>
#include <thread>
#include <windows.h>

namespace {
uint64_t nowMs() {
  return static_cast<uint64_t>(
    std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count());
}

const int kVkReturn = 0x0d;
const int kVkSpace = 0x20;
const int kVkB = 0x42;
const int kVkW = 0x57;
const int kVkF2 = 0x71;
const int kVkF3 = 0x72;
const int kVkF6 = 0x75;
const int kVkControl = 0x11;
const int kVkMbutton = 0x04;
}  

void MacroRunner::sleepMs(int ms) const {
  Sleep(static_cast<DWORD>(ms));
}

bool MacroRunner::keyDown(int vk) const {
  return (GetAsyncKeyState(vk) & 0x8000) != 0;
}

void MacroRunner::click(int x, int y) const {
  SetCursorPos(x, y);
  sleepMs(30);
  mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
  sleepMs(30);
  mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
}

void MacroRunner::pressKey(int vk, bool holdCtrl) const {
  if (holdCtrl) keybd_event(static_cast<BYTE>(kVkControl), 0, 0, 0);
  keybd_event(static_cast<BYTE>(vk), 0, 0, 0);
  sleepMs(40);
  keybd_event(static_cast<BYTE>(vk), 0, KEYEVENTF_KEYUP, 0);
  if (holdCtrl) keybd_event(static_cast<BYTE>(kVkControl), 0, KEYEVENTF_KEYUP, 0);
}

void MacroRunner::typeText(const std::string& text) const {
  for (char ch : text) {
    SHORT code = VkKeyScanA(ch);
    if (code == -1) continue;
    BYTE vk = LOBYTE(code);
    bool shift = (HIBYTE(code) & 1) != 0;
    if (shift) keybd_event(0x10, 0, 0, 0);
    keybd_event(vk, 0, 0, 0);
    sleepMs(18);
    keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
    if (shift) keybd_event(0x10, 0, KEYEVENTF_KEYUP, 0);
    sleepMs(12);
  }
}

int MacroRunner::parseVk(const std::string& accel) const {
  if (accel.empty()) return 0;
  std::string last;
  size_t start = 0;
  for (size_t i = 0; i <= accel.size(); ++i) {
    if (i == accel.size() || accel[i] == '+') {
      std::string tok = accel.substr(start, i - start);
      start = i + 1;
      while (!tok.empty() && tok.front() == ' ') tok.erase(tok.begin());
      while (!tok.empty() && tok.back() == ' ') tok.pop_back();
      if (!tok.empty()) last = tok;
    }
  }
  if (last.empty()) return 0;
  std::string u = last;
  for (char& c : u) c = static_cast<char>(toupper(static_cast<unsigned char>(c)));
  if (u == "MIDDLE" || u == "MBUTTON" || u == "MOUSE3") return kVkMbutton;
  if (u == "MOUSE1" || u == "LBUTTON") return 0x01;
  if (u == "MOUSE2" || u == "RBUTTON") return 0x02;
  if (u.size() == 2 && u[0] == 'F') {
    int n = atoi(u.c_str() + 1);
    if (n >= 1 && n <= 24) return 0x6f + n;
  }
  if (last.size() == 1) {
    char c = static_cast<char>(toupper(static_cast<unsigned char>(last[0])));
    if (c >= 'A' && c <= 'Z') return c;
    if (c >= '0' && c <= '9') return c;
  }
  return 0;
}

bool MacroRunner::onCooldown(const std::string& type, int ms) {
  uint64_t t = nowMs();
  auto it = cooldown_.find(type);
  if (it != cooldown_.end() && t < it->second) return true;
  cooldown_[type] = t + static_cast<uint64_t>(ms);
  return false;
}

void MacroRunner::start(const std::string& type, const MacroConfig& cfg, ToggleFn toggle3074) {
  stop();
  type_ = type;
  cfg_ = cfg;
  toggle3074_ = std::move(toggle3074);
  running_ = true;
  thread_ = std::thread([this] { pollLoop(); });
}

void MacroRunner::stop() {
  running_ = false;
  if (thread_.joinable()) thread_.join();
  type_.clear();
  toggle3074_ = nullptr;
}

std::string MacroRunner::activeType() const {
  return running_ ? type_ : std::string("none");
}

void MacroRunner::pollLoop() {
  while (running_) {
    int vk = 0;
    auto hk = cfg_.hotkeys.find(type_);
    if (hk != cfg_.hotkeys.end()) vk = parseVk(hk->second);
    if (vk == 0) {
      if (type_ == "wellskate") vk = kVkMbutton;
      else if (type_ == "wishwall") vk = kVkF3;
      else if (type_ == "chat") vk = kVkF2;
      else if (type_ == "duality") vk = kVkF6;
    }
    if (vk && keyDown(vk)) {
      if (type_ == "wellskate") {
        pressKey(kVkSpace);
        sleepMs(50);
        pressKey(kVkW);
        sleepMs(30);
        pressKey(kVkSpace);
      } else if (type_ == "wishwall" && !onCooldown(type_, 500)) {
        pressKey(kVkB);
        sleepMs(200);
        click(cfg_.wishwallX, cfg_.wishwallY);
      } else if (type_ == "chat" && !onCooldown(type_, 300)) {
        std::string text = cfg_.chatText;
        if (!text.empty()) {
          pressKey(kVkReturn);
          sleepMs(120);
          typeText(text);
          sleepMs(60);
          pressKey(kVkReturn);
        }
      } else if (type_ == "duality" && !onCooldown(type_, 800)) {
        if (toggle3074_) toggle3074_();
        sleepMs(100);
        click(cfg_.dualityOpenX, cfg_.dualityOpenY);
        sleepMs(200);
        int xs[] = { cfg_.dualityLoadout1X, cfg_.dualityLoadout2X, cfg_.dualityLoadout3X };
        for (int cycle = 0; cycle < 3; ++cycle) {
          for (int x : xs) {
            click(x, cfg_.dualityLoadoutY);
            sleepMs(cfg_.dualitySwapDelay);
          }
        }
        click(cfg_.dualityLoadout4X, cfg_.dualityLoadoutY);
        sleepMs(100);
        if (toggle3074_) toggle3074_();
      }
    }
    Sleep(15);
  }
}
