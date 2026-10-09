import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { setWindowContent, type WindowContent } from './windowStore';

export interface UiaReadResult {
  ok: boolean;
  title?: string;
  processName?: string;
  processId?: number;
  text?: string;
  textLength?: number;
  error?: string;
  truncated?: boolean;
}

function scriptPath(): string {
  const candidates = [
    path.join(process.cwd(), 'scripts', 'read-foreground-window.ps1'),
    path.join(app.getAppPath(), 'scripts', 'read-foreground-window.ps1'),
    path.join(__dirname, '..', '..', 'scripts', 'read-foreground-window.ps1'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function ourPids(): string {
  const list = new Set<number>();
  list.add(process.pid);
  if (typeof process.ppid === 'number') list.add(process.ppid);
  return [...list].join(',');
}

function runPowerShell(script: string, extraArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      ...extraArgs,
    ];
    const child = spawn('powershell.exe', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('读取窗口超时（UI Automation 超过 12 秒未返回）'));
    }, 12_000);
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(
          new Error(
            stderr.trim() || `PowerShell 退出码 ${code ?? 'unknown'}`,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function readForegroundWindow(): Promise<UiaReadResult> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      error:
        '当前系统不是 Windows。前台窗口读取依赖 Windows UI Automation，仅在 Windows 上可用。',
    };
  }

  const script = scriptPath();
  if (!fs.existsSync(script)) {
    return { ok: false, error: `找不到脚本：${script}` };
  }

  try {
    const raw = await runPowerShell(script, ['-ExcludePids', ourPids()]);
    // PowerShell may emit BOM or trailing noise; take last JSON-looking line
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let parsed: UiaReadResult | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.startsWith('{')) continue;
      try {
        parsed = JSON.parse(line) as UiaReadResult;
        break;
      } catch {
        // continue
      }
    }
    if (!parsed) {
      return {
        ok: false,
        error: `无法解析 UI Automation 输出：${raw.slice(0, 200)}`,
      };
    }
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/** 读取并写入 windowStore；成功或失败都会更新状态。 */
export async function refreshWindowContent(): Promise<WindowContent> {
  const result = await readForegroundWindow();
  if (!result.ok) {
    return setWindowContent({
      title: result.title || '',
      processName: result.processName || '',
      processId: result.processId || 0,
      text: '',
      source: 'uia',
      error: result.error || '读取失败',
    });
  }
  return setWindowContent({
    title: result.title || '',
    processName: result.processName || '',
    processId: result.processId || 0,
    text: result.text || '',
    source: 'uia',
  });
}
