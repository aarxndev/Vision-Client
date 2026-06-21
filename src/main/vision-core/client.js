const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const { app } = require('electron');

class VisionCoreClient {
  constructor() {
    this.proc = null;
    this.rl = null;
    this.ready = false;
    this.pending = new Map();
    this.nextId = 1;
    this.onEvent = null;
    this._lastError = null;
    this._active = new Set();
    this._pid = null;
    this._mutateQueue = Promise.resolve();
  }

  _enqueueMutation(fn) {
    const run = this._mutateQueue.then(fn, fn);
    this._mutateQueue = run.catch(() => {});
    return run;
  }

  async _syncActive() {
    const res = await this.request('getState');
    if (Array.isArray(res.active)) this._active = new Set(res.active);
    return res;
  }

  static exePath() {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'vision-core', 'vision-core.exe');
    }
    return path.join(__dirname, '..', '..', '..', 'native', 'vision-core', 'bin', 'vision-core.exe');
  }

  static windivertDir() {
    if (app.isPackaged) return path.join(process.resourcesPath, 'windivert');
    return path.join(__dirname, '..', 'windivert');
  }

  start() {
    if (this.proc) return Promise.resolve();
    const exe = VisionCoreClient.exePath();
    const windivertDir = VisionCoreClient.windivertDir();
    return new Promise((resolve, reject) => {
      this.proc = spawn(exe, ['--windivert-dir', windivertDir], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.proc.on('error', (err) => reject(err));
      this.proc.stderr.on('data', (d) => {
        console.error('[vision-core]', d.toString());
      });
      this.proc.on('exit', (code) => {
        this.ready = false;
        this.proc = null;
        if (this.onEvent) this.onEvent({ event: 'exit', code });
      });
      this.rl = readline.createInterface({ input: this.proc.stdout });
      this.rl.on('line', (line) => this._onLine(line.trim(), resolve, reject));
      setTimeout(() => {
        if (!this.ready) reject(new Error('vision-core startup timeout'));
      }, 8000);
    });
  }

  _onLine(line, startupResolve, startupReject) {
    if (!line) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.event === 'ready') {
      this.ready = true;
      if (startupResolve) startupResolve();
      return;
    }
    if (msg.event === 'status') {
      if (msg.kind === 'error') this._lastError = msg.message;
      if (msg.kind === 'target') this._pid = msg.running ? msg.pid : null;
      if (this.onEvent) this.onEvent(msg);
      return;
    }
    if (msg.id != null && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.ok) resolve(msg);
      else reject(new Error(msg.error || 'vision-core error'));
    }
  }

  request(cmd, params = {}) {
    if (!this.proc || !this.ready) return Promise.reject(new Error('vision-core not ready'));
    const id = this.nextId++;
    const payload = JSON.stringify({ id, cmd, ...params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(payload + '\n');
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`vision-core timeout: ${cmd}`));
        }
      }, 10000);
    });
  }

  async setFilters(filters, targetProcess) {
    await this.request('setFilters', { filters, targetProcess });
  }

  async toggle(filterId) {
    return this._enqueueMutation(async () => {
      await this.request('toggle', { filterId });
      await this._syncActive();
      return this._active.has(filterId);
    });
  }

  async setActive(filterId, on) {
    return this._enqueueMutation(async () => {
      await this.request('setActive', { filterId, on });
      await this._syncActive();
      return this._active.has(filterId);
    });
  }

  async clearAll() {
    return this._enqueueMutation(async () => {
      await this.request('clearAll');
      await this._syncActive();
    });
  }

  async kill(ids, ms = 1000) {
    await this.request('kill', { ids, ms });
  }

  async suspend(pid) {
    const res = await this.request('suspend', { pid });
    return !!res.ok;
  }

  async resume(pid) {
    const res = await this.request('resume', { pid });
    return !!res.ok;
  }

  async macroStart(type, cfg) {
    await this.request('macroStart', {
      type,
      macroHotkeys: cfg.macroHotkeys || {},
      bibleMacros: cfg.bibleMacros || {},
    });
  }

  async macroStop() {
    await this.request('macroStop');
  }

  async getState() {
    const res = await this.request('getState');
    if (Array.isArray(res.active)) {
      this._active = new Set(res.active);
    }
    if (res.pid != null) this._pid = res.pid || null;
    if (res.lastError) this._lastError = res.lastError;
    return res;
  }

  activeIds() {
    return [...this._active];
  }

  isActive(id) {
    return this._active.has(id);
  }

  getPid() {
    return this._pid;
  }

  lastError() {
    return this._lastError;
  }

  stop() {
    if (!this.proc) return;
    try {
      this.proc.stdin.write(JSON.stringify({ id: 0, cmd: 'stop' }) + '\n');
    } catch {}
    setTimeout(() => {
      if (this.proc) {
        this.proc.kill();
        this.proc = null;
      }
      if (this.rl) {
        this.rl.close();
        this.rl = null;
      }
    }, 200);
    this.ready = false;
  }
}

module.exports = { VisionCoreClient };
