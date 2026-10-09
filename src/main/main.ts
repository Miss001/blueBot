import fs from 'fs';
import path from 'path';
import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  nativeImage,
} from 'electron';
import { loadConfig, getPublicSettings, saveSettings, type SaveSettingsInput } from './config';
import { getWindowMeta, clearWindowContent } from './windowStore';
import { refreshWindowContent } from './uia';
import { configureAgent, chatWithAgent } from './agent';

let petWindow: BrowserWindow | null = null;
let chatWindow: BrowserWindow | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let refreshing = false;

const PET_SIZE = { width: 120, height: 140 };
const CHAT_SIZE = { width: 380, height: 520 };

function rendererFile(...parts: string[]): string {
  return path.join(__dirname, '..', 'renderer', ...parts);
}

function asset(...parts: string[]): string {
  const candidates = [
    path.join(__dirname, '..', 'assets', ...parts),
    path.join(__dirname, '..', '..', 'assets', ...parts),
    path.join(process.cwd(), 'assets', ...parts),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function createPetWindow(): void {
  const display = screen.getPrimaryDisplay().workArea;
  const x = display.x + display.width - PET_SIZE.width - 24;
  const y = display.y + display.height - PET_SIZE.height - 24;

  petWindow = new BrowserWindow({
    width: PET_SIZE.width,
    height: PET_SIZE.height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    hasShadow: false,
    title: 'blueBot',
    icon: nativeImage.createFromPath(asset('icon.png')),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.loadFile(rendererFile('pet.html'));

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function positionChatNearPet(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay().workArea;
  let x = display.x + display.width - CHAT_SIZE.width - 24;
  let y = display.y + display.height - CHAT_SIZE.height - PET_SIZE.height - 36;

  if (petWindow && !petWindow.isDestroyed()) {
    const b = petWindow.getBounds();
    x = Math.min(
      Math.max(display.x, b.x + b.width - CHAT_SIZE.width),
      display.x + display.width - CHAT_SIZE.width,
    );
    y = Math.min(
      Math.max(display.y, b.y - CHAT_SIZE.height - 8),
      display.y + display.height - CHAT_SIZE.height,
    );
    if (y < display.y + 8) {
      y = Math.min(b.y + b.height + 8, display.y + display.height - CHAT_SIZE.height);
    }
  }
  return { x, y };
}

function createChatWindow(): void {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.show();
    chatWindow.focus();
    return;
  }

  const { x, y } = positionChatNearPet();
  chatWindow = new BrowserWindow({
    width: CHAT_SIZE.width,
    height: CHAT_SIZE.height,
    x,
    y,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 320,
    minHeight: 400,
    title: 'blueBot 对话',
    backgroundColor: '#0f1419',
    icon: nativeImage.createFromPath(asset('icon.png')),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  chatWindow.setAlwaysOnTop(true, 'floating');
  chatWindow.loadFile(rendererFile('chat.html'));

  chatWindow.on('closed', () => {
    chatWindow = null;
  });
}

function broadcastWindowMeta(): void {
  const meta = getWindowMeta();
  for (const win of [petWindow, chatWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('window:updated', meta);
    }
  }
}

async function pollForeground(): Promise<void> {
  if (refreshing || process.platform !== 'win32') return;
  // 对话窗口聚焦时不要覆盖缓存，继续保留上一次「外部」窗口
  if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isFocused()) {
    return;
  }
  if (petWindow && !petWindow.isDestroyed() && petWindow.isFocused()) {
    return;
  }
  refreshing = true;
  try {
    await refreshWindowContent();
    broadcastWindowMeta();
  } catch (err) {
    console.warn('[blueBot] 前台窗口轮询失败', err);
  } finally {
    refreshing = false;
  }
}

function registerIpc(): void {
  ipcMain.handle('agent:status', () => {
    const pub = getPublicSettings();
    return {
      hasApiKey: pub.hasApiKey,
      model: pub.model,
      baseURL: pub.baseURL || '(官方默认)',
      apiMode: pub.apiMode,
      platform: process.platform,
      uiaAvailable: process.platform === 'win32',
      statusLabel: pub.statusLabel,
      apiKeyMasked: pub.apiKeyMasked,
      source: pub.source,
    };
  });

  ipcMain.handle('settings:get', () => getPublicSettings());

  ipcMain.handle('settings:save', (_event, raw: unknown) => {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: '无效的设置参数' };
    }
    const body = raw as Record<string, unknown>;
    const input: SaveSettingsInput = {
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      baseURL: typeof body.baseURL === 'string' ? body.baseURL : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      apiMode:
        body.apiMode === 'responses' || body.apiMode === 'chat_completions'
          ? body.apiMode
          : undefined,
      keepExistingKey: body.keepExistingKey !== false,
    };
    const saved = saveSettings(input);
    if (!saved.ok) return saved;
    const config = loadConfig();
    const setup = configureAgent(config);
    if (!setup.ok) {
      return {
        ok: true,
        settings: saved.settings,
        agentOk: false,
        agentError: setup.error,
      };
    }
    return {
      ok: true,
      settings: saved.settings,
      agentOk: true,
    };
  });

  ipcMain.handle('agent:chat', async (_event, message: unknown) => {
    if (typeof message !== 'string' || !message.trim()) {
      return { ok: false, error: '消息不能为空' };
    }
    return chatWithAgent(message.trim());
  });

  ipcMain.handle('window:get', () => getWindowMeta());

  ipcMain.handle('window:refresh', async () => {
    const content = await refreshWindowContent();
    broadcastWindowMeta();
    return {
      ok: !content.error || Boolean(content.text || content.title),
      meta: getWindowMeta(),
      error: content.error,
    };
  });

  ipcMain.handle('window:clear', () => {
    clearWindowContent();
    broadcastWindowMeta();
    return { ok: true };
  });

  ipcMain.handle('ui:openChat', () => {
    createChatWindow();
    return { ok: true };
  });

  ipcMain.handle('ui:closeChat', () => {
    if (chatWindow && !chatWindow.isDestroyed()) chatWindow.close();
    return { ok: true };
  });

  ipcMain.handle('ui:toggleChat', () => {
    if (chatWindow && !chatWindow.isDestroyed()) {
      if (chatWindow.isVisible()) {
        chatWindow.close();
        return { ok: true, open: false };
      }
    }
    createChatWindow();
    return { ok: true, open: true };
  });

  ipcMain.handle('ui:movePet', (_event, dx: unknown, dy: unknown) => {
    if (!petWindow || petWindow.isDestroyed()) return { ok: false };
    if (typeof dx !== 'number' || typeof dy !== 'number') return { ok: false };
    const b = petWindow.getBounds();
    petWindow.setPosition(Math.round(b.x + dx), Math.round(b.y + dy));
    return { ok: true };
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
  createPetWindow();

  // 启动后立刻读一次，再定时轮询
  void pollForeground();
  pollTimer = setInterval(() => {
    void pollForeground();
  }, 2000);

  app.on('activate', () => {
    if (!petWindow) createPetWindow();
  });
});

app.on('window-all-closed', () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
