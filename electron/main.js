const { app, BrowserWindow,Menu } = require('electron');
const express = require('express');
const path = require('node:path');

let localServer;

function startProductionServer() {
  const webApp = express();

const distPath = path.join(
  __dirname,
  '..',
  'dist',
  'theconvertor',
  'browser'
);
  webApp.use(express.static(distPath));

  // Makes Angular routes work after refreshing the app.
  webApp.use((request, response) => {
    response.sendFile(path.join(distPath, 'index.html'));
  });
Menu.setApplicationMenu(null);
  return new Promise((resolve) => {
    localServer = webApp.listen(0, '127.0.0.1', () => {
      const { port } = localServer.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (app.isPackaged) {
    const productionUrl = await startProductionServer();
    await window.loadURL(productionUrl);
  } else {
    await window.loadURL('http://localhost:4200');
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (localServer) localServer.close();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});