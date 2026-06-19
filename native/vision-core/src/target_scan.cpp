#include "target_scan.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <iphlpapi.h>
#include <tlhelp32.h>

#include <algorithm>
#include <cctype>
#include <set>
#include <string>

#pragma comment(lib, "iphlpapi.lib")

namespace targetscan {

static std::string lower(std::string s) {
  for (char& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return s;
}

int findProcessPid(const std::string& imageName) {
  std::string want = lower(imageName);
  if (want.size() < 4 || want.substr(want.size() - 4) != ".exe") want += ".exe";

  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return 0;

  PROCESSENTRY32 pe{};
  pe.dwSize = sizeof(pe);
  int pid = 0;
  if (Process32First(snap, &pe)) {
    do {
      if (lower(pe.szExeFile) == want) {
        pid = static_cast<int>(pe.th32ProcessID);
        break;
      }
    } while (Process32Next(snap, &pe));
  }
  CloseHandle(snap);
  return pid;
}

std::vector<int> udpPortsForPid(int pid) {
  std::set<int> ports;
  if (pid <= 0) return {};

  ULONG size = 0;
  GetExtendedUdpTable(nullptr, &size, FALSE, AF_INET, UDP_TABLE_OWNER_PID, 0);
  if (size == 0) return {};

  std::vector<uint8_t> buf(size);
  if (GetExtendedUdpTable(buf.data(), &size, FALSE, AF_INET, UDP_TABLE_OWNER_PID, 0) != NO_ERROR) return {};

  auto* table = reinterpret_cast<MIB_UDPTABLE_OWNER_PID*>(buf.data());
  for (DWORD i = 0; i < table->dwNumEntries; ++i) {
    auto& row = table->table[i];
    if (static_cast<int>(row.dwOwningPid) == pid) {
      int port = ntohs(static_cast<u_short>(row.dwLocalPort));
      if (port > 0) ports.insert(port);
    }
  }

  return std::vector<int>(ports.begin(), ports.end());
}

}  
