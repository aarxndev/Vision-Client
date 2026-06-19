const { VisionCoreClient } = require('../vision-core/client');

class Engine {
  constructor() {
    this.client = new VisionCoreClient();
    this.allFilters = [];
    this.targetProcess = 'destiny2.exe';
    this.onStatus = () => {};
  }

  async start() {
    this.client.onEvent = (msg) => {
      if (msg.event === 'status') {
        this.onStatus({ kind: msg.kind, ...msg });
      }
    };
    await this.client.start();
    await this.client.setFilters(this.allFilters, this.targetProcess);
    await this.client.getState();
  }

  setFilters(filters, targetProcess) {
    this.allFilters = filters;
    if (targetProcess) this.targetProcess = targetProcess;
    if (this.client.ready) {
      return this.client.setFilters(filters, this.targetProcess);
    }
    return Promise.resolve();
  }

  isActive(id) {
    return this.client.isActive(id);
  }

  setActive(id, on) {
    return this.client.setActive(id, on);
  }

  toggle(id) {
    return this.client.toggle(id);
  }

  clearAll() {
    return this.client.clearAll();
  }

  activeIds() {
    return this.client.activeIds();
  }

  kill(ids, ms) {
    return this.client.kill(ids, ms);
  }

  getPid() {
    return this.client.getPid();
  }

  lastError() {
    return this.client.lastError();
  }

  suspend(pid) {
    return this.client.suspend(pid);
  }

  resume(pid) {
    return this.client.resume(pid);
  }

  macroStart(type, cfg) {
    return this.client.macroStart(type, cfg);
  }

  macroStop() {
    return this.client.macroStop();
  }

  stop() {
    this.client.stop();
  }
}

module.exports = { Engine };
