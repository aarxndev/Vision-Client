#include "windivert_engine.h"

#include <algorithm>
#include <chrono>
#include <cstring>
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

namespace {
uint64_t nowMs() {
  return static_cast<uint64_t>(
    std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count());
}

bool parsePorts(const uint8_t* buf, unsigned len, uint16_t& srcPort, uint16_t& dstPort) {
  if (len < 1) return false;
  int ver = buf[0] >> 4;
  unsigned udpOff = 0;
  if (ver == 4) {
    if (len < 20) return false;
    unsigned ihl = (buf[0] & 0x0f) * 4;
    if (buf[9] != 17) return false;
    udpOff = ihl;
  } else if (ver == 6) {
    if (len < 40) return false;
    if (buf[6] != 17) return false;
    udpOff = 40;
  } else return false;
  if (len < udpOff + 4) return false;
  srcPort = (static_cast<uint16_t>(buf[udpOff]) << 8) | buf[udpOff + 1];
  dstPort = (static_cast<uint16_t>(buf[udpOff + 2]) << 8) | buf[udpOff + 3];
  return true;
}
}  

WinDivertEngine::WinDivertEngine(std::string dllDir) : dllDir_(std::move(dllDir)) {
  if (!loadDll()) return;
  running_ = true;
  worker_ = std::thread([this] { packetLoop(); });
}

WinDivertEngine::~WinDivertEngine() {
  stop();
  if (worker_.joinable()) worker_.join();
  if (dll_) FreeLibrary(static_cast<HMODULE>(dll_));
}

bool WinDivertEngine::loadDll() {
  std::string path = dllDir_;
  if (!path.empty() && path.back() != '\\' && path.back() != '/') path += "\\";
  path += "WinDivert.dll";
  dll_ = LoadLibraryA(path.c_str());
  if (!dll_) {
    lastError_ = "Failed to load WinDivert.dll from " + path;
    return false;
  }
  pOpen_ = reinterpret_cast<WinDivertOpenFn>(GetProcAddress(static_cast<HMODULE>(dll_), "WinDivertOpen"));
  pRecv_ = reinterpret_cast<WinDivertRecvFn>(GetProcAddress(static_cast<HMODULE>(dll_), "WinDivertRecv"));
  pSend_ = reinterpret_cast<WinDivertSendFn>(GetProcAddress(static_cast<HMODULE>(dll_), "WinDivertSend"));
  pClose_ = reinterpret_cast<WinDivertCloseFn>(GetProcAddress(static_cast<HMODULE>(dll_), "WinDivertClose"));
  pShutdown_ = reinterpret_cast<WinDivertShutdownFn>(GetProcAddress(static_cast<HMODULE>(dll_), "WinDivertShutdown"));
  if (!pOpen_ || !pRecv_ || !pSend_ || !pClose_ || !pShutdown_) {
    lastError_ = "WinDivert.dll exports missing";
    return false;
  }
  return true;
}

void WinDivertEngine::setConfig(const std::vector<FilterDef>& active, const std::vector<int>& destinyPorts) {
  std::lock_guard<std::mutex> lock(mu_);
  active_ = active;
  destinyPorts_ = destinyPorts;
  // Unblock synchronous WinDivertRecv so packetLoop can reopen with the new filter.
  if (handle_ && pShutdown_) pShutdown_(handle_, 3);
}

void WinDivertEngine::kill(const std::vector<std::string>& ids, int ms) {
  std::lock_guard<std::mutex> lock(mu_);
  uint64_t until = nowMs() + static_cast<uint64_t>(ms > 0 ? ms : 1500);
  for (const auto& id : ids) killUntil_[id] = until;
}

void WinDivertEngine::stop() {
  running_ = false;
  closeHandle();
}

std::string WinDivertEngine::lastError() const {
  std::lock_guard<std::mutex> lock(const_cast<std::mutex&>(mu_));
  return lastError_;
}

void WinDivertEngine::getStats(uint64_t& passed, uint64_t& dropped) const {
  passed = passed_;
  dropped = dropped_;
}

std::string WinDivertEngine::buildFilterString() const {
  std::vector<std::string> clauses;
  for (const auto& f : active_) {
    if (f.beginPort > 0) {
      if (f.isOutbound) {
        clauses.push_back("(outbound and udp.DstPort >= " + std::to_string(f.beginPort) +
                          " and udp.DstPort <= " + std::to_string(f.endPort) + ")");
      } else {
        clauses.push_back("(inbound and udp.SrcPort >= " + std::to_string(f.beginPort) +
                          " and udp.SrcPort <= " + std::to_string(f.endPort) + ")");
      }
    } else if (!destinyPorts_.empty()) {
      std::string pc;
      for (size_t i = 0; i < destinyPorts_.size(); ++i) {
        if (i) pc += " or ";
        pc += f.isOutbound ? "udp.SrcPort == " + std::to_string(destinyPorts_[i])
                           : "udp.DstPort == " + std::to_string(destinyPorts_[i]);
      }
      clauses.push_back("(" + std::string(f.isOutbound ? "outbound" : "inbound") + " and (" + pc + "))");
    }
  }
  if (clauses.empty()) return {};
  std::string out = "udp and (";
  for (size_t i = 0; i < clauses.size(); ++i) {
    if (i) out += " or ";
    out += clauses[i];
  }
  out += ")";
  return out;
}

const FilterDef* WinDivertEngine::matchFilter(bool outbound, uint16_t srcPort, uint16_t dstPort) const {
  uint16_t remote = outbound ? dstPort : srcPort;
  for (const auto& f : active_) {
    if (f.isOutbound != outbound) continue;
    if (f.beginPort > 0) {
      if (remote >= static_cast<uint16_t>(f.beginPort) && remote <= static_cast<uint16_t>(f.endPort)) return &f;
    } else {
      uint16_t local = outbound ? srcPort : dstPort;
      for (int p : destinyPorts_) {
        if (local == static_cast<uint16_t>(p)) return &f;
      }
    }
  }
  return nullptr;
}

bool WinDivertEngine::isBufferRelief(const FilterDef& f) {
  int bufSec = f.buffer;
  if (f.mode == "slow") bufSec = 1;
  if (bufSec <= 0) return false;
  uint64_t t = nowMs();
  const uint64_t intervalMs = static_cast<uint64_t>(bufSec) * 1000ULL;
  const uint64_t pulseMs = (f.mode == "slow")
    ? 500ULL
    : (std::min)(2000ULL, intervalMs / 3ULL);

  BufferPulse& bp = bufferPulse_[f.id];
  if (bp.nextPulseAt == 0) {
    bp.nextPulseAt = t + intervalMs;
    return false;
  }
  if (bp.pulseUntil > 0) {
    if (t < bp.pulseUntil) return true;
    bp.pulseUntil = 0;
  }
  if (t >= bp.nextPulseAt) {
    bp.pulseUntil = t + pulseMs;
    bp.nextPulseAt = t + intervalMs;
    return true;
  }
  return false;
}

bool WinDivertEngine::allowPacket(const FilterDef& f, unsigned len) {
  if (isBufferRelief(f)) return true;
  uint64_t t = nowMs();
  auto it = killUntil_.find(f.id);
  if (it != killUntil_.end() && t < it->second) return false;
  if (f.bytes <= 1) return false;
  Bucket& b = buckets_[f.id];
  if (b.rate != f.bytes) {
    b = { f.bytes, static_cast<double>(f.bytes), static_cast<double>((std::max)(f.bytes, 1500)), t };
  }
  double elapsed = (t - b.lastMs) / 1000.0;
  b.tokens = (std::min)(b.cap, b.tokens + elapsed * b.rate);
  b.lastMs = t;
  if (b.tokens >= len) {
    b.tokens -= len;
    return true;
  }
  return false;
}

void WinDivertEngine::closeHandle() {
  std::lock_guard<std::mutex> lock(mu_);
  if (handle_ && pShutdown_) pShutdown_(handle_, 3);
  if (handle_ && pClose_) pClose_(handle_);
  handle_ = nullptr;
  open_ = false;
}

void WinDivertEngine::reopen() {
  std::vector<FilterDef> active;
  std::vector<int> ports;
  {
    std::lock_guard<std::mutex> lock(mu_);
    active = active_;
    ports = destinyPorts_;
  }
  std::string want = [&] {
    std::vector<std::string> clauses;
    for (const auto& f : active) {
      if (f.beginPort > 0) {
        if (f.isOutbound)
          clauses.push_back("(outbound and udp.DstPort >= " + std::to_string(f.beginPort) +
                            " and udp.DstPort <= " + std::to_string(f.endPort) + ")");
        else
          clauses.push_back("(inbound and udp.SrcPort >= " + std::to_string(f.beginPort) +
                            " and udp.SrcPort <= " + std::to_string(f.endPort) + ")");
      } else if (!ports.empty()) {
        std::string pc;
        for (size_t i = 0; i < ports.size(); ++i) {
          if (i) pc += " or ";
          pc += f.isOutbound ? "udp.SrcPort == " + std::to_string(ports[i])
                             : "udp.DstPort == " + std::to_string(ports[i]);
        }
        clauses.push_back("(" + std::string(f.isOutbound ? "outbound" : "inbound") + " and (" + pc + "))");
      }
    }
    if (clauses.empty()) return std::string{};
    std::string out = "udp and (";
    for (size_t i = 0; i < clauses.size(); ++i) {
      if (i) out += " or ";
      out += clauses[i];
    }
    out += ")";
    return out;
  }();

  std::lock_guard<std::mutex> lock(mu_);
  if (want == currentFilter_ && handle_) return;
  if (handle_) {
    if (pShutdown_) pShutdown_(handle_, 3);
    if (pClose_) pClose_(handle_);
    handle_ = nullptr;
    open_ = false;
  }
  currentFilter_ = want;
  if (want.empty()) return;
  if (!pOpen_) return;
  handle_ = pOpen_(want.c_str(), 0, 0, 0);
  if (!handle_ || handle_ == INVALID_HANDLE_VALUE) {
    DWORD err = GetLastError();
    lastError_ = "WinDivertOpen failed (error " + std::to_string(err) +
                 "). Run as Administrator and ensure the WinDivert driver can load.";
    handle_ = nullptr;
    currentFilter_.clear();
    return;
  }
  open_ = true;
}

void WinDivertEngine::packetLoop() {
  uint8_t packet[65535];
  uint8_t addr[64];
  while (running_) {
    reopen();
    void* h = nullptr;
    {
      std::lock_guard<std::mutex> lock(mu_);
      h = handle_;
    }
    if (!h) {
      Sleep(50);
      continue;
    }
    unsigned recvLen = 0;
    if (!pRecv_(h, packet, sizeof(packet), &recvLen, addr)) {
      reopen();
      continue;
    }
    bool forward = true;
    uint16_t src = 0, dst = 0;
    if (parsePorts(packet, recvLen, src, dst)) {
      bool outbound = ((addr[10] >> 1) & 1) == 1;
      const FilterDef* f = nullptr;
      {
        std::lock_guard<std::mutex> lock(mu_);
        f = matchFilter(outbound, src, dst);
        if (f) forward = allowPacket(*f, recvLen);
      }
    }
    if (forward) {
      unsigned sendLen = 0;
      pSend_(h, packet, recvLen, &sendLen, addr);
      ++passed_;
    } else {
      ++dropped_;
    }
  }
}
