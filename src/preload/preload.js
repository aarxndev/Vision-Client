const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vision', {
  getState: () => ipcRenderer.invoke('app:getState'),
  toggleFilter: (id) => ipcRenderer.invoke('filter:toggle', id),
  setActive: (id, on) => ipcRenderer.invoke('filter:setActive', { id, on }),
  clearAll: () => ipcRenderer.invoke('filters:clearAll'),
  kill: (ids) => ipcRenderer.invoke('filter:kill', ids),
  saveFilters: (filters) => ipcRenderer.invoke('filters:save', filters),
  saveSettings: (partial) => ipcRenderer.invoke('settings:save', partial),
  getBiblePresets: () => ipcRenderer.invoke('bible:getPresets'),
  saveBibleSelection: (ids) => ipcRenderer.invoke('bible:saveSelection', ids),
  applyBiblePresets: (ids) => ipcRenderer.invoke('bible:applyPresets', ids),
  startMacro: (type) => ipcRenderer.invoke('macro:start', type),
  stopMacro: () => ipcRenderer.invoke('macro:stop'),
  saveMacroHotkeys: (hotkeys) => ipcRenderer.invoke('macro:saveHotkeys', hotkeys),
  saveChatMacroText: (text) => ipcRenderer.invoke('macro:saveChatText', text),
  getMacroStatus: () => ipcRenderer.invoke('macro:status'),
  togglePause: () => ipcRenderer.invoke('pause:toggle'),
  launchGame: () => ipcRenderer.invoke('game:launch'),
  pickBackground: () => ipcRenderer.invoke('bg:pick'),
  setBackground: (partial) => ipcRenderer.invoke('bg:set', partial),
  pickAvatar: () => ipcRenderer.invoke('avatar:pick'),

  minimize: () => ipcRenderer.send('win:minimize'),
  close: () => ipcRenderer.send('win:close'),
  hide: () => ipcRenderer.send('win:hide'),
  openExternal: (url) => ipcRenderer.send('open:external', url),

  on: (channel, cb) => {
    const valid = ['engine:status', 'engine:active', 'filter:state', 'pause:state', 'toast', 'hotkeys:updated', 'macro:state'];
    if (!valid.includes(channel)) return;
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
