const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  net,
  ipcMain
} = require('electron');

const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');

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
let localAiServer;
let modelDownloadPromise;
const MODEL_FILENAME = 'Qwen3-1.7B-Q3_K_M.gguf';
const MODEL_URL = 'https://huggingface.co/tensorblock/Qwen_Qwen3-1.7B-GGUF/resolve/ac27efa/Qwen3-1.7B-Q3_K_M.gguf';
const MODEL_SHA256 = '79af9a932c6659aabc06d6560b8404063c79f616b136953370f9c67853e162e0';
const MODEL_SIZE_BYTES = 1_073_242_528;
const modelStatus = {
  status: 'checking',
  downloadedBytes: 0,
  totalBytes: 0,
  error: '',
};

ipcMain.handle('local-model:get-status', () => ({ ...modelStatus, modelFilename: MODEL_FILENAME }));
ipcMain.handle('local-model:retry-setup', () => {
  void ensureLocalModel();
  return true;
});

function getModelPath() {
  return path.join(app.getPath('userData'), 'models', MODEL_FILENAME);
}

function getServerPath() {
  const platformFolder = process.platform === 'win32' ? 'win' : process.platform === 'linux' ? 'linux' : null;
  if (!platformFolder) return null;
  const resourceRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'llama')
    : path.join(app.getAppPath(), 'build');
  const serverName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  console.log(resourceRoot);
  return path.join(resourceRoot, platformFolder, serverName);
}

function startLocalAiServer() {
  if (localAiServer && !localAiServer.killed) return;
  const serverPath = getServerPath();
  const modelPath = getModelPath();
  if (!serverPath || !fs.existsSync(serverPath) || !fs.existsSync(modelPath)) {
    throw new Error('The local AI server or model is missing.');
  }

  localAiServer = spawn(serverPath, [
    '--model', modelPath,
    '--host', '127.0.0.1',
    '--port', '9931',
    '--ctx-size', '8192',
    '--cors-origins', app.isPackaged ? 'app://app' : 'http://localhost:4200',
  ], {
    cwd: path.dirname(serverPath),
    windowsHide: true,
    stdio: 'ignore',
  });
  localAiServer.on('error', (error) => console.error('Could not start local AI server:', error));
  const serverProcess = localAiServer;
  localAiServer.on('exit', (code) => {
    if (localAiServer === serverProcess) localAiServer = undefined;
    if (code !== null && code !== 0) {
      console.error(`Local AI server stopped with code ${code}`);
      if (modelStatus.status === 'ready') {
        modelStatus.status = 'error';
        modelStatus.error = 'The local AI server stopped unexpectedly. Restart the app to try again.';
      }
    }
  });
}

async function waitForLocalAiServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:9931/health', { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // The model can take a while to load on the first run.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('The local AI model did not start in time. Restart the app to try again.');
}

async function downloadLocalModel(modelPath) {
  const modelDirectory = path.dirname(modelPath);
  await fsp.mkdir(modelDirectory, { recursive: true });
  const temporaryPath = `${modelPath}.download`;
  modelStatus.status = 'downloading';
  modelStatus.downloadedBytes = 0;
  modelStatus.totalBytes = 0;
  modelStatus.error = '';

  try {
    const response = await fetch(MODEL_URL, { redirect: 'follow' });
    if (!response.ok || !response.body) {
      throw new Error(`The model download failed (HTTP ${response.status}).`);
    }
    modelStatus.totalBytes = Number(response.headers.get('content-length')) || MODEL_SIZE_BYTES;
    const hash = crypto.createHash('sha256');
    const progress = new Transform({
      transform(chunk, encoding, callback) {
        modelStatus.downloadedBytes += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), progress, fs.createWriteStream(temporaryPath));

    const downloadedHash = hash.digest('hex');
    if (downloadedHash !== MODEL_SHA256) {
      throw new Error('The downloaded model did not pass its integrity check.');
    }
    const file = await fsp.open(temporaryPath, 'r');
    try {
      const header = Buffer.alloc(4);
      await file.read(header, 0, header.length, 0);
      if (header.toString('ascii') !== 'GGUF') throw new Error('The downloaded file is not a valid model.');
    } finally {
      await file.close();
    }
    await fsp.rename(temporaryPath, modelPath);
  } catch (error) {
    await fsp.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function ensureLocalModel() {
  if (!['win32', 'linux'].includes(process.platform)) {
    modelStatus.status = 'unsupported';
    modelStatus.error = 'The local model is currently available in the Windows and Linux desktop apps.';
    return;
  }
  if (modelDownloadPromise) return modelDownloadPromise;

  modelDownloadPromise = (async () => {
    const modelPath = getModelPath();
    try {
      if (!fs.existsSync(modelPath)) await downloadLocalModel(modelPath);
      modelStatus.status = 'starting';
      modelStatus.error = '';
      startLocalAiServer();
      await waitForLocalAiServer();
      modelStatus.status = 'ready';
    } catch (error) {
      modelStatus.status = 'error';
      modelStatus.error = error instanceof Error ? error.message : 'Could not download or start the local model.';
      console.error('Local AI setup failed:', error);
    } finally {
      modelDownloadPromise = undefined;
    }
  })();
  return modelDownloadPromise;
}

function stopLocalAiServer() {
  if (localAiServer && !localAiServer.killed) localAiServer.kill();
  localAiServer = undefined;
}

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

    if (pathname === '/_electron/local-model-status' && request.method === 'GET') {
      return Response.json({ ...modelStatus, modelFilename: MODEL_FILENAME });
    }
    if (pathname === '/_electron/local-model-retry' && request.method === 'POST') {
      void ensureLocalModel();
      return Response.json({ accepted: true }, { status: 202 });
    }

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
  frame: true,
  autoHideMenuBar: true,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }
});

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
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
  void ensureLocalModel();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void ensureLocalModel();
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopLocalAiServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', stopLocalAiServer);
