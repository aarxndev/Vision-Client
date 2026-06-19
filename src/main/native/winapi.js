const koffi = require('koffi');

let kernel32, ntdll, OpenProcess, CloseHandle, NtSuspendProcess, NtResumeProcess;

function ensureLoaded() {
  if (kernel32) return;
  kernel32 = koffi.load('kernel32.dll');
  ntdll = koffi.load('ntdll.dll');
  OpenProcess = kernel32.func(
    'void* __stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)'
  );
  CloseHandle = kernel32.func('bool __stdcall CloseHandle(void* hObject)');
  NtSuspendProcess = ntdll.func('long __stdcall NtSuspendProcess(void* ProcessHandle)');
  NtResumeProcess = ntdll.func('long __stdcall NtResumeProcess(void* ProcessHandle)');
}

const PROCESS_ALL_ACCESS = 0x1f0fff;

function withProcess(pid, fn) {
  ensureLoaded();
  const handle = OpenProcess(PROCESS_ALL_ACCESS, false, pid >>> 0);
  if (!handle || koffi.address(handle) === 0n || koffi.address(handle) === 0) {
    return false;
  }
  try {
    const status = fn(handle);
    return status === 0; 
  } finally {
    CloseHandle(handle);
  }
}

module.exports = {
  suspend: (pid) => withProcess(pid, (h) => NtSuspendProcess(h)),
  resume: (pid) => withProcess(pid, (h) => NtResumeProcess(h)),
};
