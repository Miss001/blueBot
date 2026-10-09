/// <reference path="./bluebot-api.d.ts" />

const agentStatus = document.getElementById('agent-status') as HTMLDivElement;
const focusTitle = document.getElementById('focus-title') as HTMLDivElement;
const focusMeta = document.getElementById('focus-meta') as HTMLDivElement;
const chatLog = document.getElementById('chat-log') as HTMLDivElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const btnSend = document.getElementById('btn-send') as HTMLButtonElement;
const btnClose = document.getElementById('btn-close') as HTMLButtonElement;
const btnRefresh = document.getElementById('btn-refresh') as HTMLButtonElement;

let busy = false;
let warnedKey = false;

function appendMessage(role: 'user' | 'bot' | 'error', text: string): void {
  const el = document.createElement('div');
  el.className = `msg ${role === 'error' ? 'error' : role}`;
  const label = role === 'user' ? '你' : role === 'bot' ? 'blueBot' : '错误';
  const roleSpan = document.createElement('span');
  roleSpan.className = 'role';
  roleSpan.textContent = label;
  el.appendChild(roleSpan);
  el.appendChild(document.createTextNode(text));
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function formatTime(ts: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
  } catch {
    return '';
  }
}

function renderFocus(meta: WindowMeta): void {
  if (!meta.title && !meta.processName) {
    focusTitle.textContent = meta.error ? '读取失败' : '等待同步…';
    focusMeta.textContent = meta.error
      ? meta.error
      : '切换到浏览器或其他软件窗口后，我会自动读取';
    return;
  }
  focusTitle.textContent = meta.title || '（无标题）';
  const parts = [
    meta.processName ? `进程 ${meta.processName}` : '',
    meta.textLength ? `${meta.textLength.toLocaleString()} 字符` : '0 字符',
    meta.updatedAt ? `更新 ${formatTime(meta.updatedAt)}` : '',
  ].filter(Boolean);
  focusMeta.textContent = parts.join(' · ');
  if (meta.error) {
    focusMeta.textContent += ` · 警告：${meta.error}`;
  }
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
      if (!warnedKey) {
        warnedKey = true;
        appendMessage(
          'error',
          '尚未配置有效的 API Key。请复制 .env.example 为 .env，填写 OPENAI_API_KEY（可选 OPENAI_BASE_URL / OPENAI_MODEL），保存后重启应用。若出现「请求超时」，多数也是 Key/接口地址不正确。',
        );
      }
    }
    if (!status.uiaAvailable && !warnedKey) {
      appendMessage(
        'error',
        `当前系统是 ${status.platform}，前台窗口读取仅支持 Windows（UI Automation）。`,
      );
    }
  } catch {
    agentStatus.textContent = '状态未知';
    agentStatus.className = 'agent-status warn';
  }
}

btnClose.addEventListener('click', () => {
  void window.blueBot.closeChat();
});

btnRefresh.addEventListener('click', async () => {
  btnRefresh.disabled = true;
  btnRefresh.textContent = '读取中…';
  try {
    const result = await window.blueBot.refreshWindow();
    renderFocus(result.meta);
    if (result.error && !result.meta.textLength) {
      appendMessage('error', `刷新窗口失败：${result.error}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendMessage('error', message);
  } finally {
    btnRefresh.disabled = false;
    btnRefresh.textContent = '刷新窗口';
  }
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

window.blueBot.onWindowUpdated((meta) => {
  renderFocus(meta);
});

appendMessage(
  'bot',
  '你好，我是 blueBot。我是桌面上的小助手：你打开浏览器或任意软件后，我会尽量读取当前前台窗口内容。点我旁边可以问「根据当前窗口……」。',
);

void refreshAgentStatus();
void window.blueBot.getWindowMeta().then(renderFocus);
chatInput.focus();
