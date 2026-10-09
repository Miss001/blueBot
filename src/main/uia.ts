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
  nodeCount?: number;
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

function decodePsOutput(buf: Buffer): string {
  // Prefer UTF-8; strip BOM. Fallback to utf16le if it looks like UTF-16.
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le');
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    // rare BE — decode as utf16le after swap is overkill; try utf8
    return buf.toString('utf8');
  }
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

function runPowerShell(script: string, extraArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      ...extraArgs,
    ];
    const child = spawn('powershell.exe', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Reduce PS locale surprises for JSON
        PYTHONIOENCODING: 'utf-8',
      },
    });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('读取窗口超时（UI Automation 超过 12 秒未返回）'));
    }, 12_000);
    child.stdout.on('data', (d: Buffer) => {
      outChunks.push(d);
    });
    child.stderr.on('data', (d: Buffer) => {
      errChunks.push(d);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const stdout = decodePsOutput(Buffer.concat(outChunks)).trim();
      const stderr = decodePsOutput(Buffer.concat(errChunks)).trim();
      if (code !== 0 && !stdout) {
        reject(
          new Error(
            stderr || `PowerShell 退出码 ${code ?? 'unknown'}`,
          ),
        );
        return;
      }
      // If stderr has parser errors but we got JSON, still use stdout
      resolve(stdout || stderr);
    });
  });
}

function extractJson(raw: string): UiaReadResult | null {
  const cleaned = raw.replace(/^\uFEFF/, '').trim();
  // Try whole string first
  if (cleaned.startsWith('{')) {
    try {
      return JSON.parse(cleaned) as UiaReadResult;
    } catch {
      // fall through
    }
  }
  // Last JSON-looking line
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith('{')) continue;
    try {
      return JSON.parse(line) as UiaReadResult;
    } catch {
      // continue
    }
  }
  // Brace slice fallback
  const start = cleaned.lastIndexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as UiaReadResult;
    } catch {
      return null;
    }
  }
  return null;
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
    const parsed = extractJson(raw);
    if (!parsed) {
      // Avoid dumping garbled Chinese; show short ASCII-safe preview
      const preview = raw
        .replace(/[^\x20-\x7E\n\r]/g, '?')
        .slice(0, 180);
      return {
        ok: false,
        error: `无法解析 UI Automation 输出：${preview || '(empty)'}`,
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
    error: result.error,
  });
}
