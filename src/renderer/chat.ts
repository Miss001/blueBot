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
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const settingsPanel = document.getElementById('settings-panel') as HTMLElement;
const settingsStatus = document.getElementById('settings-status') as HTMLDivElement;
const btnSettingsClose = document.getElementById(
  'btn-settings-close',
) as HTMLButtonElement;
const btnSettingsSave = document.getElementById(
  'btn-settings-save',
) as HTMLButtonElement;
const btnToggleKey = document.getElementById('btn-toggle-key') as HTMLButtonElement;
const setApiKey = document.getElementById('set-api-key') as HTMLInputElement;
const setBaseUrl = document.getElementById('set-base-url') as HTMLInputElement;
const setModel = document.getElementById('set-model') as HTMLInputElement;
const setApiMode = document.getElementById('set-api-mode') as HTMLSelectElement;

let busy = false;
let warnedKey = false;
let settingsOpen = false;
let existingMasked = '';

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

function applySettingsToForm(s: PublicSettings): void {
  existingMasked = s.apiKeyMasked || '';
  setApiKey.value = '';
  setApiKey.placeholder = s.hasApiKey
    ? `已保存 ${s.apiKeyMasked}（留空保留）`
    : 'sk-…';
  setBaseUrl.value = s.baseURL || '';
  setModel.value = s.model || 'gpt-4o-mini';
  setApiMode.value =
    s.apiMode === 'responses' ? 'responses' : 'chat_completions';
  settingsStatus.textContent = s.statusLabel;
  settingsStatus.className =
    'settings-status' + (s.hasApiKey ? ' ok' : '');
}

async function refreshAgentStatus(): Promise<void> {
  try {
    const status = await window.blueBot.getAgentStatus();
    if (status.hasApiKey) {
      agentStatus.textContent = `${status.statusLabel || '已配置'} · ${status.model}`;
      agentStatus.className = 'agent-status ok';
      agentStatus.title = `模型：${status.model}\n接口：${status.baseURL}\n模式：${status.apiMode}`;
      btnSettings.classList.remove('needs-key');
    } else {
      agentStatus.textContent = status.statusLabel || '未配置 · 点右上角「设置」';
      agentStatus.className = 'agent-status warn';
      agentStatus.title = '点击右上角「⚙ 设置」填写 API Key';
      btnSettings.classList.add('needs-key');
      if (!warnedKey) {
        warnedKey = true;
        appendMessage(
          'error',
          '尚未配置有效的 API Key。请点击右上角「⚙ 设置」，填写 API Key（可选 Base URL / 模型），点「保存并应用」。无需手动改 .env。',
        );
        if (!settingsOpen) {
          void openSettings();
        }
      }
    }
    if (!status.uiaAvailable) {
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

async function openSettings(): Promise<void> {
  settingsOpen = true;
  settingsPanel.classList.remove('hidden');
  settingsPanel.setAttribute('aria-hidden', 'false');
  try {
    const s = await window.blueBot.getSettings();
    applySettingsToForm(s);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendMessage('error', `读取设置失败：${message}`);
  }
}

function closeSettings(): void {
  settingsOpen = false;
  settingsPanel.classList.add('hidden');
  settingsPanel.setAttribute('aria-hidden', 'true');
}

btnSettings.addEventListener('click', () => {
  if (settingsOpen) closeSettings();
  else void openSettings();
});

btnSettingsClose.addEventListener('click', () => {
  closeSettings();
});

btnToggleKey.addEventListener('click', () => {
  const show = setApiKey.type === 'password';
  setApiKey.type = show ? 'text' : 'password';
  btnToggleKey.textContent = show ? '隐藏密钥' : '显示密钥';
});

btnSettingsSave.addEventListener('click', async () => {
  btnSettingsSave.disabled = true;
  btnSettingsSave.textContent = '保存中…';
  try {
    const result = await window.blueBot.saveSettings({
      apiKey: setApiKey.value,
      baseURL: setBaseUrl.value,
      model: setModel.value,
      apiMode: setApiMode.value,
      keepExistingKey: true,
    });
    if (!result.ok) {
      appendMessage('error', result.error || '保存失败');
      return;
    }
    if (result.settings) applySettingsToForm(result.settings);
    await refreshAgentStatus();
    if (result.agentOk === false) {
      appendMessage(
        'error',
        result.agentError ||
          '设置已保存，但 Agent 仍未就绪，请检查 API Key / Base URL。',
      );
    } else {
      appendMessage(
        'bot',
        result.settings?.hasApiKey
          ? `设置已保存并应用（${result.settings.statusLabel} · ${result.settings.model}）。现在可以对话了。`
          : '设置已保存，但仍未检测到有效 API Key。',
      );
      if (result.settings?.hasApiKey) closeSettings();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendMessage('error', message);
  } finally {
    btnSettingsSave.disabled = false;
    btnSettingsSave.textContent = '保存并应用';
  }
});

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
  '你好，我是 blueBot。我是桌面上的小助手：你打开浏览器或任意软件后，我会尽量读取当前前台窗口内容。点右上角「⚙ 设置」可配置 API Key / Base URL / 模型。',
);

void refreshAgentStatus();
void window.blueBot.getWindowMeta().then(renderFocus);
chatInput.focus();
