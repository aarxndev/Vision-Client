#include "windivert_engine.h"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <vector>
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <iphlpapi.h>

#pragma comment(lib, "iphlpapi.lib")

namespace {
uint64_t nowMs() {
  return static_cast<uint64_t>(
    std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count());
}

bool parseTransport(const uint8_t* buf, unsigned len, bool& isTcp, uint16_t& srcPort, uint16_t& dstPort) {
  if (len < 1) return false;
  int ver = buf[0] >> 4;
  unsigned transportOff = 0;
  uint8_t proto = 0;
  if (ver == 4) {
    if (len < 20) return false;
    unsigned ihl = (buf[0] & 0x0f) * 4;
    proto = buf[9];
    transportOff = ihl;
  } else if (ver == 6) {
    if (len < 40) return false;
    proto = buf[6];
    transportOff = 40;
  } else return false;
  if (proto != 17 && proto != 6) return false;
  isTcp = (proto == 6);
  if (len < transportOff + 4) return false;
  srcPort = (static_cast<uint16_t>(buf[transportOff]) << 8) | buf[transportOff + 1];
  dstPort = (static_cast<uint16_t>(buf[transportOff + 2]) << 8) | buf[transportOff + 3];
  return true;
}

void resetTcpOnPortRange(int beginPort, int endPort) {
  ULONG size = 0;
  if (GetExtendedTcpTable(nullptr, &size, FALSE, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0) != ERROR_INSUFFICIENT_BUFFER)
    return;
  std::vector<uint8_t> buf(size);
  if (GetExtendedTcpTable(buf.data(), &size, FALSE, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0) != NO_ERROR)
    return;
  auto* table = reinterpret_cast<MIB_TCPTABLE_OWNER_PID*>(buf.data());
  for (DWORD i = 0; i < table->dwNumEntries; ++i) {
    const auto& row = table->table[i];
    const int remotePort = ntohs(static_cast<u_short>(row.dwRemotePort));
    const int localPort = ntohs(static_cast<u_short>(row.dwLocalPort));
    if ((remotePort < beginPort || remotePort > endPort) &&
        (localPort < beginPort || localPort > endPort))
      continue;
    MIB_TCPROW del{};
    del.dwState = MIB_TCP_STATE_DELETE_TCB;
    del.dwLocalAddr = row.dwLocalAddr;
    del.dwLocalPort = row.dwLocalPort;
    del.dwRemoteAddr = row.dwRemoteAddr;
    del.dwRemotePort = row.dwRemotePort;
    SetTcpEntry(&del);
  }
}

void resetTcpForPid(int pid) {
  if (pid <= 0) return;
  ULONG size = 0;
  if (GetExtendedTcpTable(nullptr, &size, FALSE, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0) != ERROR_INSUFFICIENT_BUFFER)
    return;
  std::vector<uint8_t> buf(size);
  if (GetExtendedTcpTable(buf.data(), &size, FALSE, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0) != NO_ERROR)
    return;
  auto* table = reinterpret_cast<MIB_TCPTABLE_OWNER_PID*>(buf.data());
  for (DWORD i = 0; i < table->dwNumEntries; ++i) {
    const auto& row = table->table[i];
    if (static_cast<int>(row.dwOwningPid) != pid) continue;
    MIB_TCPROW del{};
    del.dwState = MIB_TCP_STATE_DELETE_TCB;
    del.dwLocalAddr = row.dwLocalAddr;
    del.dwLocalPort = row.dwLocalPort;
    del.dwRemoteAddr = row.dwRemoteAddr;
    del.dwRemotePort = row.dwRemotePort;
    SetTcpEntry(&del);
  }
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
  if (active.empty()) {
    killWakeGen_++;
    clearKillStateLocked();
    buckets_.clear();
    bufferPulse_.clear();
  } else {
    std::map<std::string, bool> activeIds;
    for (const auto& f : active) activeIds[f.id] = true;
    auto prune = [&](auto& map) {
      for (auto it = map.begin(); it != map.end();) {
        if (!activeIds.count(it->first)) it = map.erase(it);
        else ++it;
      }
    };
    prune(buckets_);
    prune(bufferPulse_);
    prune(killUntil_);
  }
  active_ = active;
  destinyPorts_ = destinyPorts;
  // Unblock synchronous WinDivertRecv so packetLoop can reopen with the new filter.
  if (handle_ && pShutdown_) pShutdown_(handle_, 3);
}

void WinDivertEngine::clearKillStateLocked() {
  globalKillUntil_ = 0;
  killLocalPorts_.clear();
  killPortRanges_.clear();
  killUntil_.clear();
}

void WinDivertEngine::scheduleKillEnd(uint64_t generation, int ms) {
  std::thread([this, generation, ms] {
    Sleep(static_cast<DWORD>(ms > 0 ? ms : 1000));
    std::lock_guard<std::mutex> lock(mu_);
    if (!running_) return;
    if (killWakeGen_.load() != generation) return;
    clearKillStateLocked();
    if (active_.empty() && handle_ && pShutdown_) pShutdown_(handle_, 3);
  }).detach();
}

void WinDivertEngine::kill(const std::vector<std::string>& ids, int ms, int targetPid,
                           const std::vector<int>& destinyPorts,
                           const std::vector<FilterDef>& filters) {
  std::vector<std::pair<int, int>> portRanges;
  void* h = nullptr;
  uint64_t wakeGen = 0;
  const int duration = ms > 0 ? ms : 1000;
  {
    std::lock_guard<std::mutex> lock(mu_);
    const uint64_t until = nowMs() + static_cast<uint64_t>(duration);
    globalKillUntil_ = until;
    killLocalPorts_ = destinyPorts;
    killPortRanges_.clear();
    for (const auto& f : filters) {
      if (f.beginPort > 0)
        killPortRanges_.emplace_back(f.beginPort, f.endPort);
      for (const auto& id : ids) {
        if (f.id == id) {
          killUntil_[id] = until;
          buckets_.erase(id);
          bufferPulse_.erase(id);
        }
      }
    }
    portRanges = killPortRanges_;
    h = handle_;
    wakeGen = ++killWakeGen_;
  }
  resetTcpForPid(targetPid);
  for (const auto& pr : portRanges)
    resetTcpOnPortRange(pr.first, pr.second);
  if (h && pShutdown_) pShutdown_(h, 3);
  scheduleKillEnd(wakeGen, duration);
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
  std::lock_guard<std::mutex> lock(const_cast<std::mutex&>(mu_));
  const uint64_t t = nowMs();
  if (active_.empty() && t >= globalKillUntil_) return {};
  // Capture all TCP/UDP; port/direction matching happens in userspace so switching
  // modules never leaves WinDivert stuck on a stale kernel filter.
  return "(udp or tcp)";
}

const FilterDef* WinDivertEngine::matchFilter(bool outbound, uint16_t srcPort, uint16_t dstPort) const {
  auto portInRange = [](uint16_t port, int begin, int end) {
    return port >= static_cast<uint16_t>(begin) && port <= static_cast<uint16_t>(end);
  };
  for (const auto& f : active_) {
    if (f.beginPort > 0) {
      // Match by service port position (src = download, dst = upload).
      // Download = traffic from remote (src port in range). Upload = traffic to remote (dst in range).
      if (!f.isOutbound) {
        if (portInRange(srcPort, f.beginPort, f.endPort)) return &f;
      } else {
        if (portInRange(dstPort, f.beginPort, f.endPort)) return &f;
      }
    } else {
      const uint16_t local = outbound ? srcPort : dstPort;
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

bool WinDivertEngine::shouldKillDrop(bool outbound, uint16_t srcPort, uint16_t dstPort) const {
  std::lock_guard<std::mutex> lock(const_cast<std::mutex&>(mu_));
  const uint64_t t = nowMs();
  if (t >= globalKillUntil_) return false;

  const uint16_t local = outbound ? srcPort : dstPort;
  for (int p : killLocalPorts_) {
    if (local == static_cast<uint16_t>(p)) return true;
  }

  auto portInRange = [](uint16_t port, int begin, int end) {
    return port >= static_cast<uint16_t>(begin) && port <= static_cast<uint16_t>(end);
  };
  for (const auto& pr : killPortRanges_) {
    if (portInRange(srcPort, pr.first, pr.second) || portInRange(dstPort, pr.first, pr.second))
      return true;
  }
  return false;
}

bool WinDivertEngine::allowPacket(const FilterDef& f, unsigned len) {
  uint64_t t = nowMs();
  auto it = killUntil_.find(f.id);
  if (it != killUntil_.end()) {
    if (t < it->second) return false;
    killUntil_.erase(it);
  }
  if (isBufferRelief(f)) return true;
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
  {
    std::lock_guard<std::mutex> lock(mu_);
    if (globalKillUntil_ > 0 && nowMs() >= globalKillUntil_) clearKillStateLocked();
  }

  std::string want = buildFilterString();

  std::lock_guard<std::mutex> lock(mu_);
  if (want == currentFilter_ && handle_) return;
  if (handle_) {
    if (pShutdown_) pShutdown_(handle_, 3);
    if (pClose_) pClose_(handle_);
    handle_ = nullptr;
    open_ = false;
  }
  currentFilter_ = want;
  if (want.empty()) {
    open_ = false;
    return;
  }
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
    bool isTcp = false;
    if (parseTransport(packet, recvLen, isTcp, src, dst)) {
      bool outbound = ((addr[10] >> 1) & 1) == 1;
      (void)isTcp;
      if (shouldKillDrop(outbound, src, dst)) {
        forward = false;
      } else {
        const FilterDef* f = nullptr;
        {
          std::lock_guard<std::mutex> lock(mu_);
          f = matchFilter(outbound, src, dst);
          if (f) forward = allowPacket(*f, recvLen);
        }
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
