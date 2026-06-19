#pragma once
#include "json_min.h"
#include "macros.h"
#include "windivert_engine.h"

#include <atomic>
#include <functional>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

class VisionCore {
 public:
  using EventFn = std::function<void(const std::string&)>;

  explicit VisionCore(std::string windivertDir);
  ~VisionCore();

  void setEventHandler(EventFn fn);
  std::string handleCommand(const jsonmin::Obj& req);

 private:
  FilterDef parseFilter(const jsonmin::Obj& o) const;
  MacroConfig parseMacroConfig(const jsonmin::Obj& req) const;
  void pushActiveConfig();
  bool needPorts() const;
  void pollTargetLoop();
  void emit(const std::string& json);
  void emitStatus(const std::string& kind, const std::string& extraFields);
  std::string find3074UploadId() const;

  std::string windivertDir_;
  WinDivertEngine engine_;
  MacroRunner macros_;
  EventFn onEvent_;

  std::mutex mu_;
  std::vector<FilterDef> allFilters_;
  std::map<std::string, FilterDef> active_;
  std::string targetProcess_ = "destiny2.exe";
  int targetPid_ = 0;
  std::vector<int> destinyPorts_;
  std::thread pollThread_;
  std::atomic<bool> polling_{false};
};
