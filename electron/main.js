const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  net,
  ipcMain,
  shell
} = require('electron');

const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

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

function startLocalAiServer() {
  if (localAiServer && !localAiServer.killed) return;
  const platformFolder = process.platform === 'win32' ? 'win' : process.platform === 'linux' ? 'linux' : null;
  if (!platformFolder) return;

  const resourceRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'llama')
    : path.join(app.getAppPath(), 'build');
  const serverName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  const serverPath = path.join(resourceRoot, platformFolder, serverName);
  const modelCandidates = app.isPackaged
    ? [path.join(resourceRoot, 'model.gguf')]
    : [path.join(resourceRoot, 'model.gguf'), path.join(resourceRoot, 'model1.gguf')];
  const modelPath = modelCandidates.find((candidate) => fs.existsSync(candidate));
  if (!fs.existsSync(serverPath) || !modelPath) {
    console.error('Local AI server or model is missing:', serverPath, modelCandidates);
    return;
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
    if (code !== null && code !== 0) console.error(`Local AI server stopped with code ${code}`);
  });
}

function stopLocalAiServer() {
  if (localAiServer && !localAiServer.killed) localAiServer.kill();
  localAiServer = undefined;
}

function isTrustedAiSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) return false;
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  return senderUrl.startsWith('app://app/') || senderUrl.startsWith('http://localhost:4200/');
}

function registerOnlineAiHandlers() {
  ipcMain.handle('online-ai:summarize', async (event, request) => {
    if (!isTrustedAiSender(event)) {
      throw new Error('Online summaries are only available from the app window.');
    }
    const apiKey = typeof request?.apiKey === 'string' ? request.apiKey.trim() : '';
    const sourceText = typeof request?.sourceText === 'string' ? request.sourceText : '';
    const prompt = typeof request?.prompt === 'string' ? request.prompt : '';
    const instructions = typeof request?.instructions === 'string' ? request.instructions : '';
    const maxOutputTokens = Number(request?.maxOutputTokens);
    if (!apiKey || apiKey.length > 512) throw new Error('Enter a valid Gemini API key.');
    if (!sourceText || sourceText.length > 24000) throw new Error('The extracted text is empty or too long for this request.');
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 1024) {
      throw new Error('The summary length setting is invalid.');
    }

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiVersion: 'v1beta',
        headers: { 'Api-Revision': '2026-05-20' },
      },
    });
    const stream = await ai.interactions.create({
      model: 'gemini-3.8-flash',
      input: `${instructions}\n\n${prompt}\n\n<extracted_pdf_text>\n${sourceText}\n</extracted_pdf_text>`,
      stream: true,
      generation_config: { max_output_tokens: maxOutputTokens, thinking_level: 'low' },
    });
    let summary = '';
    for await (const event of stream) {
      const delta = event;
      if (delta.event_type === 'step.delta' && delta.delta.type === 'text') summary += delta.delta.text;
    }
    summary = summary.trim();
    if (!summary) throw new Error('Gemini returned no summary. Try a shorter document or another summary style.');
    return summary;
  });

  ipcMain.handle('online-ai:open-key-page', async (event) => {
    if (!isTrustedAiSender(event)) {
      throw new Error('This action is only available from the app window.');
    }
    await shell.openExternal('https://aistudio.google.com/apikey');
  });
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
  registerOnlineAiHandlers();
  startLocalAiServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      startLocalAiServer();
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
