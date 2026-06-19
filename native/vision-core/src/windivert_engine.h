#pragma once
#include <atomic>
#include <cstdint>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

struct FilterDef {
  std::string id;
  int beginPort = 0;
  int endPort = 0;
  int bytes = 1;
  bool isOutbound = false;
  int buffer = 0; 
  std::string mode = "normal"; 
};

class WinDivertEngine {
 public:
  explicit WinDivertEngine(std::string dllDir);
  ~WinDivertEngine();

  void setConfig(const std::vector<FilterDef>& active, const std::vector<int>& destinyPorts);
  void kill(const std::vector<std::string>& ids, int ms);
  void stop();
  bool isOpen() const { return open_.load(); }
  std::string lastError() const;
  void getStats(uint64_t& passed, uint64_t& dropped) const;

 private:
  using WinDivertOpenFn = void* (__stdcall*)(const char*, int, int16_t, uint64_t);
  using WinDivertRecvFn = int (__stdcall*)(void*, void*, unsigned, unsigned*, void*);
  using WinDivertSendFn = int (__stdcall*)(void*, void*, unsigned, unsigned*, void*);
  using WinDivertCloseFn = int (__stdcall*)(void*);
  using WinDivertShutdownFn = int (__stdcall*)(void*, int);

  bool loadDll();
  std::string buildFilterString() const;
  const FilterDef* matchFilter(bool outbound, uint16_t srcPort, uint16_t dstPort) const;
  bool allowPacket(const FilterDef& f, unsigned len);
  void packetLoop();
  void reopen();
  void closeHandle();

  std::string dllDir_;
  void* dll_ = nullptr;
  WinDivertOpenFn pOpen_ = nullptr;
  WinDivertRecvFn pRecv_ = nullptr;
  WinDivertSendFn pSend_ = nullptr;
  WinDivertCloseFn pClose_ = nullptr;
  WinDivertShutdownFn pShutdown_ = nullptr;

  std::thread worker_;
  std::atomic<bool> running_{false};
  std::atomic<bool> open_{false};
  std::mutex mu_;
  std::vector<FilterDef> active_;
  std::vector<int> destinyPorts_;
  std::string currentFilter_;
  std::string lastError_;
  void* handle_ = nullptr;
  uint64_t passed_ = 0;
  uint64_t dropped_ = 0;

  struct Bucket { int rate; double tokens; double cap; uint64_t lastMs; };
  struct BufferPulse { uint64_t nextPulseAt = 0; uint64_t pulseUntil = 0; };
  std::map<std::string, Bucket> buckets_;
  std::map<std::string, uint64_t> killUntil_;
  std::map<std::string, BufferPulse> bufferPulse_;

  bool isBufferRelief(const FilterDef& f);
};
