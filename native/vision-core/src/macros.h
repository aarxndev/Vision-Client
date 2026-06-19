#pragma once
#include <atomic>
#include <functional>
#include <map>
#include <string>
#include <thread>

struct MacroConfig {
  std::map<std::string, std::string> hotkeys;
  std::string chatText;
  int wishwallX = 960;
  int wishwallY = 540;
  int dualityOpenX = 50;
  int dualityOpenY = 550;
  int dualityLoadout1X = 150;
  int dualityLoadout2X = 250;
  int dualityLoadout3X = 350;
  int dualityLoadout4X = 450;
  int dualityLoadoutY = 800;
  int dualitySwapDelay = 150;
};

class MacroRunner {
 public:
  using ToggleFn = std::function<void()>;

  void start(const std::string& type, const MacroConfig& cfg, ToggleFn toggle3074);
  void stop();
  bool running() const { return running_.load(); }
  std::string activeType() const;

 private:
  int parseVk(const std::string& accel) const;
  bool keyDown(int vk) const;
  void click(int x, int y) const;
  void pressKey(int vk, bool holdCtrl = false) const;
  void typeText(const std::string& text) const;
  void sleepMs(int ms) const;
  bool onCooldown(const std::string& type, int ms);
  void pollLoop();

  std::atomic<bool> running_{false};
  std::thread thread_;
  std::string type_;
  MacroConfig cfg_;
  ToggleFn toggle3074_;
  std::map<std::string, uint64_t> cooldown_;
};
