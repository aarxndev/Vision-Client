#include "core.h"

#include "process_ctl.h"
#include "target_scan.h"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

#include <sstream>

namespace {
std::string quote(const std::string& s) { return jsonmin::esc(s); }

std::string activeIdsJson(const std::map<std::string, FilterDef>& active) {
  std::ostringstream os;
  os << "[";
  bool first = true;
  for (const auto& kv : active) {
    if (!first) os << ",";
    first = false;
    os << quote(kv.first);
  }
  os << "]";
  return os.str();
}
}  

VisionCore::VisionCore(std::string windivertDir)
  : windivertDir_(std::move(windivertDir)), engine_(windivertDir_) {
  polling_ = true;
  pollThread_ = std::thread([this] { pollTargetLoop(); });
}

VisionCore::~VisionCore() {
  polling_ = false;
  macros_.stop();
  engine_.stop();
  if (pollThread_.joinable()) pollThread_.join();
}

void VisionCore::setEventHandler(EventFn fn) { onEvent_ = std::move(fn); }

void VisionCore::emit(const std::string& json) {
  if (onEvent_) onEvent_(json);
}

void VisionCore::emitStatus(const std::string& kind, const std::string& extraFields) {
  std::ostringstream os;
  os << "{\"event\":\"status\",\"kind\":" << quote(kind);
  if (!extraFields.empty()) os << "," << extraFields;
  os << "}";
  emit(os.str());
}

FilterDef VisionCore::parseFilter(const jsonmin::Obj& o) const {
  FilterDef f;
  if (o.hasS("id")) f.id = o.s.at("id");
  if (o.hasN("beginPort")) f.beginPort = static_cast<int>(o.n.at("beginPort"));
  if (o.hasN("endPort")) f.endPort = static_cast<int>(o.n.at("endPort"));
  if (o.hasN("bytes")) f.bytes = static_cast<int>(o.n.at("bytes"));
  if (o.hasB("isOutbound")) f.isOutbound = o.b.at("isOutbound");
  if (o.hasN("buffer")) f.buffer = static_cast<int>(o.n.at("buffer"));
  if (o.hasS("mode")) f.mode = o.s.at("mode");
  return f;
}

MacroConfig VisionCore::parseMacroConfig(const jsonmin::Obj& req) const {
  MacroConfig cfg;
  if (req.hasO("macroHotkeys")) {
    const auto& hk = req.o.at("macroHotkeys");
    for (const auto& kv : hk.s) cfg.hotkeys[kv.first] = kv.second;
  }
  if (req.hasO("bibleMacros")) {
    const auto& m = req.o.at("bibleMacros");
    if (m.hasS("chatMacroText")) cfg.chatText = m.s.at("chatMacroText");
    if (m.hasN("wishwallX")) cfg.wishwallX = static_cast<int>(m.n.at("wishwallX"));
    if (m.hasN("wishwallY")) cfg.wishwallY = static_cast<int>(m.n.at("wishwallY"));
    if (m.hasN("dualityOpenX")) cfg.dualityOpenX = static_cast<int>(m.n.at("dualityOpenX"));
    if (m.hasN("dualityOpenY")) cfg.dualityOpenY = static_cast<int>(m.n.at("dualityOpenY"));
    if (m.hasN("dualityLoadout1X")) cfg.dualityLoadout1X = static_cast<int>(m.n.at("dualityLoadout1X"));
    if (m.hasN("dualityLoadout2X")) cfg.dualityLoadout2X = static_cast<int>(m.n.at("dualityLoadout2X"));
    if (m.hasN("dualityLoadout3X")) cfg.dualityLoadout3X = static_cast<int>(m.n.at("dualityLoadout3X"));
    if (m.hasN("dualityLoadout4X")) cfg.dualityLoadout4X = static_cast<int>(m.n.at("dualityLoadout4X"));
    if (m.hasN("dualityLoadoutY")) cfg.dualityLoadoutY = static_cast<int>(m.n.at("dualityLoadoutY"));
    if (m.hasN("dualitySwapDelay")) cfg.dualitySwapDelay = static_cast<int>(m.n.at("dualitySwapDelay"));
    if (m.hasS("wellskateSuperBind")) cfg.wellskateSuperBind = m.s.at("wellskateSuperBind");
  }
  return cfg;
}

void VisionCore::pushActiveConfig() {
  std::vector<FilterDef> active;
  std::vector<int> ports;
  {
    std::lock_guard<std::mutex> lock(mu_);
    for (const auto& kv : active_) active.push_back(kv.second);
    ports = destinyPorts_;
  }
  engine_.setConfig(active, ports);
  bool open = engine_.isOpen();
  emitStatus("engine", jsonmin::boolField("open", open));
  std::string err = engine_.lastError();
  if (!err.empty()) emitStatus("error", jsonmin::strField("message", err));
}

bool VisionCore::needPorts() const {
  std::lock_guard<std::mutex> lock(const_cast<std::mutex&>(mu_));
  for (const auto& kv : active_) {
    if (kv.second.beginPort == 0) return true;
  }
  return false;
}

void VisionCore::pollTargetLoop() {
  while (polling_) {
    std::string name;
    {
      std::lock_guard<std::mutex> lock(mu_);
      name = targetProcess_;
    }
    int pid = targetscan::findProcessPid(name);
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mu_);
      changed = pid != targetPid_;
      targetPid_ = pid;
    }
    std::ostringstream extra;
    extra << jsonmin::boolField("running", pid > 0) << ","
          << jsonmin::numField("pid", pid) << ","
          << jsonmin::strField("name", name);
    emitStatus("target", extra.str());

    if (!pid) {
      bool hadPorts = false;
      {
        std::lock_guard<std::mutex> lock(mu_);
        if (!destinyPorts_.empty()) {
          destinyPorts_.clear();
          hadPorts = true;
        }
      }
      if (hadPorts) pushActiveConfig();
    } else if (changed || needPorts()) {
      auto ports = targetscan::udpPortsForPid(pid);
      bool portChanged = false;
      {
        std::lock_guard<std::mutex> lock(mu_);
        if (ports != destinyPorts_) {
          destinyPorts_ = ports;
          portChanged = true;
        }
      }
      if (portChanged) pushActiveConfig();
    }
    Sleep(3000);
  }
}

std::string VisionCore::find3074UploadId() const {
  std::lock_guard<std::mutex> lock(const_cast<std::mutex&>(mu_));
  for (const auto& f : allFilters_) {
    if (f.beginPort == 3074 && f.isOutbound) return f.id;
  }
  return {};
}

std::string VisionCore::handleCommand(const jsonmin::Obj& req) {
  if (!req.hasS("cmd")) return "{\"ok\":false,\"error\":\"missing cmd\"}";
  const std::string cmd = req.s.at("cmd");
  int id = req.hasN("id") ? static_cast<int>(req.n.at("id")) : 0;

  auto respond = [&](const std::string& resultFields) {
    std::ostringstream os;
    os << "{\"id\":" << id << ",\"ok\":true";
    if (!resultFields.empty()) os << "," << resultFields;
    os << "}";
    return os.str();
  };

  if (cmd == "ping") return respond("");

  if (cmd == "setFilters") {
    std::vector<FilterDef> filters;
    if (req.hasA("filters")) {
      for (const auto& o : req.a.at("filters")) filters.push_back(parseFilter(o));
    }
    {
      std::lock_guard<std::mutex> lock(mu_);
      allFilters_ = filters;
      if (req.hasS("targetProcess")) targetProcess_ = req.s.at("targetProcess");
      for (auto it = active_.begin(); it != active_.end();) {
        bool exists = false;
        for (const auto& f : allFilters_) {
          if (f.id == it->first) {
            it->second = f;
            exists = true;
            break;
          }
        }
        if (!exists) it = active_.erase(it);
        else ++it;
      }
    }
    pushActiveConfig();
    return respond("");
  }

  if (cmd == "toggle") {
    if (!req.hasS("filterId")) return "{\"id\":" + std::to_string(id) + ",\"ok\":false,\"error\":\"missing filterId\"}";
    const std::string fid = req.s.at("filterId");
    bool on = false;
    {
      std::lock_guard<std::mutex> lock(mu_);
      if (active_.count(fid)) {
        active_.erase(fid);
        on = false;
      } else {
        for (const auto& f : allFilters_) {
          if (f.id == fid) {
            active_[fid] = f;
            on = true;
            break;
          }
        }
      }
    }
    pushActiveConfig();
    return respond(jsonmin::boolField("active", on));
  }

  if (cmd == "setActive") {
    if (!req.hasS("filterId")) return "{\"id\":" + std::to_string(id) + ",\"ok\":false,\"error\":\"missing filterId\"}";
    const std::string fid = req.s.at("filterId");
    bool want = req.hasB("on") ? req.b.at("on") : true;
    bool on = false;
    {
      std::lock_guard<std::mutex> lock(mu_);
      if (want) {
        for (const auto& f : allFilters_) {
          if (f.id == fid) {
            active_[fid] = f;
            on = true;
            break;
          }
        }
      } else {
        active_.erase(fid);
        on = false;
      }
    }
    pushActiveConfig();
    return respond(jsonmin::boolField("active", on));
  }

  if (cmd == "clearAll") {
    {
      std::lock_guard<std::mutex> lock(mu_);
      active_.clear();
    }
    pushActiveConfig();
    return respond("");
  }

  if (cmd == "kill") {
    std::vector<std::string> ids;
    if (req.hasA("ids")) {
      for (const auto& o : req.a.at("ids")) {
        if (o.hasS("__str__")) ids.push_back(o.s.at("__str__"));
        else if (o.hasS("id")) ids.push_back(o.s.at("id"));
      }
    }
    std::vector<FilterDef> filtersForKill;
    std::vector<int> ports;
    int pid = 0;
    {
      std::lock_guard<std::mutex> lock(mu_);
      pid = targetPid_;
      ports = destinyPorts_;
      filtersForKill = allFilters_;
      if (ids.empty()) {
        for (const auto& kv : active_) ids.push_back(kv.first);
        if (ids.empty()) {
          for (const auto& f : allFilters_) ids.push_back(f.id);
        }
      }
    }
    if (pid > 0) {
      auto fresh = targetscan::udpPortsForPid(pid);
      if (!fresh.empty()) ports = fresh;
    }
    int ms = req.hasN("ms") ? static_cast<int>(req.n.at("ms")) : 1000;
    engine_.kill(ids, ms, pid, ports, filtersForKill);
    return respond("");
  }

  if (cmd == "getState") {
    std::lock_guard<std::mutex> lock(mu_);
    std::ostringstream fields;
    fields << "\"active\":" << activeIdsJson(active_) << ","
           << jsonmin::numField("pid", targetPid_) << ","
           << jsonmin::strField("lastError", engine_.lastError()) << ","
           << jsonmin::boolField("macroRunning", macros_.running()) << ","
           << jsonmin::strField("macroType", macros_.activeType());
    return respond(fields.str());
  }

  if (cmd == "suspend") {
    int pid = req.hasN("pid") ? static_cast<int>(req.n.at("pid")) : targetPid_;
    bool ok = processctl::suspendProcess(pid);
    return respond(jsonmin::boolField("ok", ok));
  }

  if (cmd == "resume") {
    int pid = req.hasN("pid") ? static_cast<int>(req.n.at("pid")) : targetPid_;
    bool ok = processctl::resumeProcess(pid);
    return respond(jsonmin::boolField("ok", ok));
  }

  if (cmd == "macroStart") {
    if (!req.hasS("type")) return "{\"id\":" + std::to_string(id) + ",\"ok\":false,\"error\":\"missing type\"}";
    MacroConfig cfg = parseMacroConfig(req);
    std::string type = req.s.at("type");
    macros_.stop();
    macros_.start(type, cfg, [this] {
      std::string uploadId = find3074UploadId();
      if (uploadId.empty()) return;
      jsonmin::Obj toggle;
      toggle.s["cmd"] = "toggle";
      toggle.s["filterId"] = uploadId;
      handleCommand(toggle);
    });
    return respond(jsonmin::strField("active", type));
  }

  if (cmd == "macroStop") {
    macros_.stop();
    return respond("");
  }

  if (cmd == "stop") {
    polling_ = false;
    macros_.stop();
    engine_.stop();
    return respond("");
  }

  return "{\"id\":" + std::to_string(id) + ",\"ok\":false,\"error\":\"unknown cmd\"}";
}
