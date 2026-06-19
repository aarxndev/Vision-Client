#include "process_ctl.h"

#include <windows.h>

namespace processctl {

static bool suspendHandle(HANDLE h) {
  using NtSuspendProcessFn = long(__stdcall*)(HANDLE);
  auto fn = reinterpret_cast<NtSuspendProcessFn>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtSuspendProcess"));
  return fn && fn(h) == 0;
}

static bool resumeHandle(HANDLE h) {
  using NtResumeProcessFn = long(__stdcall*)(HANDLE);
  auto fn = reinterpret_cast<NtResumeProcessFn>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtResumeProcess"));
  return fn && fn(h) == 0;
}

bool suspendProcess(int pid) {
  HANDLE h = OpenProcess(PROCESS_ALL_ACCESS, FALSE, static_cast<DWORD>(pid));
  if (!h) return false;
  bool ok = suspendHandle(h);
  CloseHandle(h);
  return ok;
}

bool resumeProcess(int pid) {
  HANDLE h = OpenProcess(PROCESS_ALL_ACCESS, FALSE, static_cast<DWORD>(pid));
  if (!h) return false;
  bool ok = resumeHandle(h);
  CloseHandle(h);
  return ok;
}

}  
