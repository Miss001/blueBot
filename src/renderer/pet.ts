/// <reference path="./bluebot-api.d.ts" />

const pet = document.getElementById('pet') as HTMLButtonElement;
const badge = document.getElementById('badge') as HTMLSpanElement;

let dragging = false;
let moved = false;
let lastX = 0;
let lastY = 0;

pet.addEventListener('pointerdown', (e) => {
  dragging = true;
  moved = false;
  lastX = e.screenX;
  lastY = e.screenY;
  pet.setPointerCapture(e.pointerId);
});

pet.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.screenX - lastX;
  const dy = e.screenY - lastY;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
  if (moved) {
    lastX = e.screenX;
    lastY = e.screenY;
    void window.blueBot.movePet(dx, dy);
  }
});

pet.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  try {
    pet.releasePointerCapture(e.pointerId);
  } catch {
    // ignore
  }
  if (!moved) {
    void window.blueBot.toggleChat();
  }
});

pet.addEventListener('pointercancel', () => {
  dragging = false;
});

async function refreshBadge(): Promise<void> {
  try {
    const status = await window.blueBot.getAgentStatus();
    badge.hidden = false;
    badge.className = 'badge';
    if (!status.hasApiKey) {
      badge.classList.add('warn');
      badge.title = '未配置 API Key · 点击打开对话后点「设置」';
    } else {
      badge.classList.add('ok');
      badge.title = `已配置 · ${status.model}`;
    }
  } catch {
    badge.hidden = false;
    badge.className = 'badge warn';
  }
}

void refreshBadge();
setInterval(() => {
  void refreshBadge();
}, 8000);
