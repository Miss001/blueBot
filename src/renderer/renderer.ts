/// <reference path="./bluebot-api.d.ts" />

type WebviewEl = Electron.WebviewTag;

const urlInput = document.getElementById('url-input') as HTMLInputElement;
const btnGo = document.getElementById('btn-go') as HTMLButtonElement;
const btnBack = document.getElementById('btn-back') as HTMLButtonElement;
const btnForward = document.getElementById('btn-forward') as HTMLButtonElement;
const btnReload = document.getElementById('btn-reload') as HTMLButtonElement;
const pageTitle = document.getElementById('page-title') as HTMLSpanElement;
const pageUrl = document.getElementById('page-url') as HTMLSpanElement;
const pageSync = document.getElementById('page-sync') as HTMLSpanElement;
const agentStatus = document.getElementById('agent-status') as HTMLDivElement;
const chatLog = document.getElementById('chat-log') as HTMLDivElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const btnSend = document.getElementById('btn-send') as HTMLButtonElement;
const browser = document.getElementById('browser') as WebviewEl;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let busy = false;

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return 'https://example.com';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return value;
  return `https://${value}`;
}

function appendMessage(role: 'user' | 'bot' | 'error', text: string): void {
  const el = document.createElement('div');
  el.className = `msg ${role === 'error' ? 'error' : role}`;
  const label =
    role === 'user' ? '你' : role === 'bot' ? 'blueBot' : '错误';
  const roleSpan = document.createElement('span');
  roleSpan.className = 'role';
  roleSpan.textContent = label;
  el.appendChild(roleSpan);
  el.appendChild(document.createTextNode(text));
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setSync(state: 'pending' | 'ok' | 'err', detail: string): void {
  pageSync.textContent = detail;
  pageSync.classList.remove('ok', 'err');
  if (state === 'ok') pageSync.classList.add('ok');
  if (state === 'err') pageSync.classList.add('err');
}

async function extractAndSync(): Promise<void> {
  setSync('pending', '同步中…');
  try {
    const result = (await browser.executeJavaScript(`(() => {
      const title = document.title || '';
      const url = location.href || '';
      const body = document.body ? (document.body.innerText || '') : '';
      return { title, url, text: body };
    })()`)) as { title: string; url: string; text: string };

    const meta = await window.blueBot.updatePage(result);
    pageTitle.textContent = result.title || '（无标题）';
    pageUrl.textContent = result.url || '';
    urlInput.value = result.url || urlInput.value;

    if (meta && meta.ok) {
      const len = result.text ? result.text.length : 0;
      setSync('ok', `已同步 · ${len.toLocaleString()} 字符`);
    } else {
      setSync('err', '同步失败');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setSync('err', `同步失败：${message}`);
  }
}

function scheduleSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void extractAndSync();
  }, 400);
}

function navigate(): void {
  const url = normalizeUrl(urlInput.value);
  urlInput.value = url;
  browser.src = url;
}

async function refreshAgentStatus(): Promise<void> {
  try {
    const status = await window.blueBot.getAgentStatus();
    if (status.hasApiKey) {
      agentStatus.textContent = `已配置 · ${status.model}`;
      agentStatus.className = 'agent-status ok';
      agentStatus.title = `模型：${status.model}\n接口：${status.baseURL}\n模式：${status.apiMode}`;
    } else {
      agentStatus.textContent = '未配置 API Key';
      agentStatus.className = 'agent-status warn';
      agentStatus.title = '请在项目根目录创建 .env 并设置 OPENAI_API_KEY';
      appendMessage(
        'error',
        '尚未配置 API Key。请复制 .env.example 为 .env，填写 OPENAI_API_KEY（可选 OPENAI_BASE_URL / OPENAI_MODEL），然后重启应用。',
      );
    }
  } catch {
    agentStatus.textContent = '状态未知';
    agentStatus.className = 'agent-status warn';
  }
}

btnGo.addEventListener('click', navigate);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    navigate();
  }
});
btnBack.addEventListener('click', () => {
  if (browser.canGoBack()) browser.goBack();
});
btnForward.addEventListener('click', () => {
  if (browser.canGoForward()) browser.goForward();
});
btnReload.addEventListener('click', () => browser.reload());

browser.addEventListener('did-start-loading', () => {
  setSync('pending', '加载中…');
});
browser.addEventListener('did-navigate', (e) => {
  const event = e as Event & { url?: string };
  if (event.url) urlInput.value = event.url;
});
browser.addEventListener('did-navigate-in-page', (e) => {
  const event = e as Event & { url?: string };
  if (event.url) urlInput.value = event.url;
  scheduleSync();
});
browser.addEventListener('did-finish-load', () => {
  scheduleSync();
});
browser.addEventListener('did-stop-loading', () => {
  scheduleSync();
});
browser.addEventListener('page-title-updated', (e) => {
  const event = e as Event & { title?: string };
  if (event.title) pageTitle.textContent = event.title;
});
browser.addEventListener('dom-ready', () => {
  scheduleSync();
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  const text = chatInput.value.trim();
  if (!text) return;

  busy = true;
  btnSend.disabled = true;
  chatInput.value = '';
  appendMessage('user', text);

  try {
    const result = await window.blueBot.chat(text);
    if (result.ok) {
      appendMessage('bot', result.reply);
    } else {
      appendMessage('error', result.error);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendMessage('error', message);
  } finally {
    busy = false;
    btnSend.disabled = false;
    chatInput.focus();
  }
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

appendMessage(
  'bot',
  '你好，我是 blueBot。在左侧打开任意网页后，内容会自动同步；你可以直接问我与当前页面相关的问题。',
);
void refreshAgentStatus();
urlInput.value = 'https://example.com';
