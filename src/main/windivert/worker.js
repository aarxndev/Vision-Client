const path = require('path');
const koffi = require('koffi');
const { parentPort, workerData } = require('worker_threads');

const dllPath = workerData.dllPath;

let lib, WinDivertOpen, WinDivertRecv, WinDivertSend, WinDivertClose, WinDivertShutdown, GetLastError;
try {
  lib = koffi.load(dllPath);
  WinDivertOpen = lib.func(
    'void* __stdcall WinDivertOpen(const char* filter, int layer, int16 priority, uint64 flags)'
  );
  WinDivertRecv = lib.func(
    'bool __stdcall WinDivertRecv(void* handle, _Out_ void* pPacket, uint packetLen, _Out_ uint* pRecvLen, _Out_ void* pAddr)'
  );
  WinDivertSend = lib.func(
    'bool __stdcall WinDivertSend(void* handle, void* pPacket, uint packetLen, _Out_ uint* pSendLen, void* pAddr)'
  );
  WinDivertClose = lib.func('bool __stdcall WinDivertClose(void* handle)');
  WinDivertShutdown = lib.func('bool __stdcall WinDivertShutdown(void* handle, int how)');
  const k32 = koffi.load('kernel32.dll');
  GetLastError = k32.func('uint32 __stdcall GetLastError()');
} catch (e) {
  parentPort.postMessage({ type: 'fatal', message: 'Failed to load WinDivert.dll: ' + e.message });
  
}

const LAYER_NETWORK = 0;
const INVALID = 0xffffffffffffffffn; 

let handle = null;
let generation = 0; 
let running = true;
let activeFilters = []; 
let destinyPorts = []; 
let currentFilterString = null;

const buckets = new Map(); 
const killUntil = new Map(); 
let passed = 0;
let dropped = 0;

const packetBuf = Buffer.allocUnsafe(65535);
const addrBuf = Buffer.allocUnsafe(64); 
const recvLen = [0];
const sendLen = [0];

function bucketFor(f) {
  let b = buckets.get(f.id);
  if (!b || b.rate !== f.bytes) {
    b = { rate: f.bytes, tokens: f.bytes, cap: Math.max(f.bytes, 1500), last: Date.now() };
    buckets.set(f.id, b);
  }
  return b;
}

function allow(f, len) {
  const until = killUntil.get(f.id);
  if (until && Date.now() < until) return false;
  if (f.bytes <= 1) return false; 
  const b = bucketFor(f);
  const now = Date.now();
  b.tokens = Math.min(b.cap, b.tokens + ((now - b.last) / 1000) * b.rate);
  b.last = now;
  if (b.tokens >= len) {
    b.tokens -= len;
    return true;
  }
  return false;
}

function buildFilterString() {
  const clauses = [];
  for (const f of activeFilters) {
    if (f.beginPort > 0) {
      if (f.isOutbound) {
        clauses.push(`(outbound and udp.DstPort >= ${f.beginPort} and udp.DstPort <= ${f.endPort})`);
      } else {
        clauses.push(`(inbound and udp.SrcPort >= ${f.beginPort} and udp.SrcPort <= ${f.endPort})`);
      }
    } else if (destinyPorts.length) {

      const pc = destinyPorts
        .map((p) => (f.isOutbound ? `udp.SrcPort == ${p}` : `udp.DstPort == ${p}`))
        .join(' or ');
      clauses.push(`(${f.isOutbound ? 'outbound' : 'inbound'} and (${pc}))`);
    }
  }
  if (!clauses.length) return null;
  return 'udp and (' + clauses.join(' or ') + ')';
}

function matchFilter(outbound, srcPort, dstPort) {
  const remote = outbound ? dstPort : srcPort;
  for (const f of activeFilters) {
    if (f.isOutbound !== outbound) continue;
    if (f.beginPort > 0) {
      if (remote >= f.beginPort && remote <= f.endPort) return f;
    } else {
      const local = outbound ? srcPort : dstPort;
      if (destinyPorts.includes(local)) return f;
    }
  }
  return null;
}

function parsePorts(buf, len) {
  if (len < 1) return null;
  const ver = buf[0] >> 4;
  let udpOff;
  if (ver === 4) {
    if (len < 20) return null;
    const ihl = (buf[0] & 0x0f) * 4;
    if (buf[9] !== 17) return null; 
    udpOff = ihl;
  } else if (ver === 6) {
    if (len < 40) return null;
    if (buf[6] !== 17) return null; 
    udpOff = 40;
  } else {
    return null;
  }
  if (len < udpOff + 4) return null;
  const srcPort = buf.readUInt16BE(udpOff);
  const dstPort = buf.readUInt16BE(udpOff + 2);
  return { srcPort, dstPort };
}

function armRecv(gen) {
  if (!running || !handle || gen !== generation) return;
  WinDivertRecv.async(handle, packetBuf, packetBuf.length, recvLen, addrBuf, (err, ok) => {
    if (!running || gen !== generation) return; 
    if (err || !ok) {
      onRecvEnded(gen);
      return;
    }
    const len = recvLen[0];
    let forward = true;
    const ports = parsePorts(packetBuf, len);
    if (ports) {
      const outbound = ((addrBuf[10] >> 1) & 1) === 1; 
      const f = matchFilter(outbound, ports.srcPort, ports.dstPort);
      if (f) forward = allow(f, len);
    }
    if (forward) {
      WinDivertSend(handle, packetBuf, len, sendLen, addrBuf);
      passed++;
    } else {
      dropped++;
    }
    armRecv(gen);
  });
}

function onRecvEnded(gen) {
  
  if (gen !== generation) return;
  reopen();
}

function closeHandle() {
  if (!handle) return;
  generation++; 
  try {
    WinDivertShutdown(handle, 0 );
  } catch {}
  try {
    WinDivertClose(handle);
  } catch {}
  handle = null;
}

function reopen() {
  if (!running) return;
  const want = buildFilterString();
  if (want === currentFilterString && handle) return;

  closeHandle();
  currentFilterString = want;

  if (!want) {
    
    parentPort.postMessage({ type: 'engine', open: false, filter: null });
    return;
  }

  const h = WinDivertOpen(want, LAYER_NETWORK, 0, 0);
  const addr = koffi.address(h);
  if (h == null || BigInt(addr) === INVALID) {
    const code = GetLastError ? GetLastError() : -1;
    handle = null;
    currentFilterString = null;
    parentPort.postMessage({
      type: 'error',
      message:
        'WinDivertOpen failed (error ' +
        code +
        '). Run as Administrator and ensure the WinDivert driver can load.',
    });
    return;
  }
  handle = h;
  const gen = ++generation;
  parentPort.postMessage({ type: 'engine', open: true, filter: want });
  armRecv(gen);
}

parentPort.on('message', (msg) => {
  switch (msg.type) {
    case 'config':
      if (Array.isArray(msg.activeFilters)) activeFilters = msg.activeFilters;
      if (Array.isArray(msg.destinyPorts)) destinyPorts = msg.destinyPorts;
      reopen();
      break;
    case 'kill': {
      
      const ms = msg.ms || 1500;
      const until = Date.now() + ms;
      for (const id of msg.ids || []) killUntil.set(id, until);
      break;
    }
    case 'stats':
      parentPort.postMessage({ type: 'stats', passed, dropped, open: !!handle });
      break;
    case 'stop':
      running = false;
      closeHandle();
      parentPort.postMessage({ type: 'stopped' });
      break;
  }
});

parentPort.postMessage({ type: 'ready' });
