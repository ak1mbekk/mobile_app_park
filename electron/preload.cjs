// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  app: {
    getVersion: () => call('app:getVersion'),
  },
});
