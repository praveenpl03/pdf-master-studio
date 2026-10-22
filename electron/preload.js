const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdfMasterDesktop', Object.freeze({
  getLocalModelStatus: () => ipcRenderer.invoke('local-model:get-status'),
  retryLocalModelSetup: () => ipcRenderer.invoke('local-model:retry-setup'),
}));
