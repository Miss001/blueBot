import path from 'path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { loadConfig } from './config';
import { setPageContent, getPageContent, clearPageContent } from './pageStore';
import { configureAgent, chatWithAgent } from './agent';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'blueBot',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('page:update', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, error: '无效的页面数据' };
    }
    const data = payload as { title?: unknown; url?: unknown; text?: unknown };
    const page = setPageContent({
      title: typeof data.title === 'string' ? data.title : '',
      url: typeof data.url === 'string' ? data.url : '',
      text: typeof data.text === 'string' ? data.text : '',
    });
    return { ok: true, page: { title: page.title, url: page.url, updatedAt: page.updatedAt } };
  });

  ipcMain.handle('page:get', () => {
    const page = getPageContent();
    return {
      title: page.title,
      url: page.url,
      textLength: page.text.length,
      updatedAt: page.updatedAt,
    };
  });

  ipcMain.handle('page:clear', () => {
    clearPageContent();
    return { ok: true };
  });

  ipcMain.handle('agent:status', () => {
    const config = loadConfig();
    return {
      hasApiKey: Boolean(config.apiKey),
      model: config.model,
      baseURL: config.baseURL || '(官方默认)',
      apiMode: config.apiMode,
    };
  });

  ipcMain.handle('agent:chat', async (_event, message: unknown) => {
    if (typeof message !== 'string' || !message.trim()) {
      return { ok: false, error: '消息不能为空' };
    }
    return chatWithAgent(message.trim());
  });
}

app.whenReady().then(() => {
  const config = loadConfig();
  const setup = configureAgent(config);
  if (!setup.ok) {
    console.warn('[blueBot]', setup.error);
  } else {
    console.log(
      `[blueBot] Agent 已就绪 · model=${config.model}` +
        (config.baseURL ? ` · baseURL=${config.baseURL}` : ''),
    );
  }

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
