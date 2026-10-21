const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdfMasterAi', {
  summarizeOnline: (request) => ipcRenderer.invoke('online-ai:summarize', request),
  openGeminiKeyPage: () => ipcRenderer.invoke('online-ai:open-key-page'),
});
