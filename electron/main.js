const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  net
} = require('electron');

const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const APP_SCHEME = 'app';

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

let mainWindow;

function getAngularPath() {
  return path.join(
    app.getAppPath(),
    'dist',
    'theconvertor',
    'browser'
  );
}

function registerAppProtocol() {
  const angularPath = getAngularPath();

  protocol.handle(APP_SCHEME, async (request) => {
    const requestUrl = new URL(request.url);

    let pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === '/') {
      pathname = '/index.html';
    }

    const requestedPath = path.resolve(
      angularPath,
      `.${pathname}`
    );

    // Prevent requests from escaping the Angular directory.
    if (
      requestedPath !== angularPath &&
      !requestedPath.startsWith(angularPath + path.sep)
    ) {
      return new Response('Forbidden', { status: 403 });
    }

    let filePath = requestedPath;

    // Support Angular client-side routes.
    if (
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      filePath = path.join(angularPath, 'index.html');
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
  width: 1400,
  height: 900,
  frame: false,
  autoHideMenuBar: true,
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }
});

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(`${APP_SCHEME}://app/`);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  registerAppProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});