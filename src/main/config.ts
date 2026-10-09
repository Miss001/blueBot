import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface AppConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  /** 多数兼容中转只支持 Chat Completions */
  apiMode: 'chat_completions' | 'responses';
}

export interface PublicSettings {
  hasApiKey: boolean;
  apiKeyMasked: string;
  baseURL: string;
  model: string;
  apiMode: AppConfig['apiMode'];
  statusLabel: '已配置' | '未配置';
  source: 'userData' | 'env' | 'none';
}

function isPlaceholderKey(key: string): boolean {
  const k = key.trim();
  if (!k) return true;
  if (k.includes('your-key')) return true;
  if (k === 'sk-your-key-here') return true;
  return false;
}

function maskKey(key: string): string {
  if (!key || isPlaceholderKey(key)) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function loadDotEnv(): void {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(app.getAppPath(), '.env'),
    path.join(__dirname, '..', '..', '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || process.env[key] === '') {
        process.env[key] = value;
      }
    }
    break;
  }
}

function userDataSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function parseSettingsObject(raw: Record<string, unknown>): Partial<AppConfig> {
  return {
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : undefined,
    baseURL: typeof raw.baseURL === 'string' ? raw.baseURL : undefined,
    model: typeof raw.model === 'string' ? raw.model : undefined,
    apiMode:
      raw.apiMode === 'responses' || raw.apiMode === 'chat_completions'
        ? raw.apiMode
        : undefined,
  };
}

function loadUserDataSettings(): Partial<AppConfig> | null {
  try {
    const file = userDataSettingsPath();
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
      string,
      unknown
    >;
    return parseSettingsObject(raw);
  } catch {
    return null;
  }
}

function loadProjectSettingsFile(): Partial<AppConfig> {
  const candidates = [
    path.join(process.cwd(), 'settings.json'),
    path.join(app.getAppPath(), 'settings.json'),
    path.join(__dirname, '..', '..', 'settings.json'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
        string,
        unknown
      >;
      return parseSettingsObject(raw);
    } catch {
      // ignore
    }
  }
  return {};
}

export function loadConfig(): AppConfig {
  loadDotEnv();
  const userData = loadUserDataSettings();
  const project = loadProjectSettingsFile();

  // Priority: userData settings.json > env > project settings.json > defaults
  const apiKey =
    userData?.apiKey?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    project.apiKey?.trim() ||
    '';
  const baseURL =
    userData?.baseURL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    project.baseURL?.trim() ||
    undefined;
  const model =
    userData?.model?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    project.model?.trim() ||
    'gpt-4o-mini';
  const apiModeEnv = process.env.OPENAI_API_MODE?.trim();
  const apiMode: AppConfig['apiMode'] =
    userData?.apiMode === 'responses' ||
    userData?.apiMode === 'chat_completions'
      ? userData.apiMode
      : apiModeEnv === 'responses' || project.apiMode === 'responses'
        ? 'responses'
        : 'chat_completions';

  return { apiKey, baseURL: baseURL || undefined, model, apiMode };
}

export function getConfigSource(): PublicSettings['source'] {
  const userData = loadUserDataSettings();
  if (userData?.apiKey?.trim() && !isPlaceholderKey(userData.apiKey)) {
    return 'userData';
  }
  loadDotEnv();
  if (
    process.env.OPENAI_API_KEY?.trim() &&
    !isPlaceholderKey(process.env.OPENAI_API_KEY)
  ) {
    return 'env';
  }
  const project = loadProjectSettingsFile();
  if (project.apiKey?.trim() && !isPlaceholderKey(project.apiKey)) {
    return 'userData';
  }
  return 'none';
}

export function getPublicSettings(): PublicSettings {
  const config = loadConfig();
  const configured = Boolean(config.apiKey) && !isPlaceholderKey(config.apiKey);
  return {
    hasApiKey: configured,
    apiKeyMasked: configured ? maskKey(config.apiKey) : '',
    baseURL: config.baseURL || '',
    model: config.model,
    apiMode: config.apiMode,
    statusLabel: configured ? '已配置' : '未配置',
    source: getConfigSource(),
  };
}

export interface SaveSettingsInput {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  apiMode?: AppConfig['apiMode'];
  /** If true and apiKey is empty/blank, keep existing key */
  keepExistingKey?: boolean;
}

export function saveSettings(
  input: SaveSettingsInput,
): { ok: true; settings: PublicSettings } | { ok: false; error: string } {
  const current = loadConfig();
  let apiKey = current.apiKey;

  if (typeof input.apiKey === 'string') {
    const trimmed = input.apiKey.trim();
    // Empty or unchanged masked placeholder -> keep existing
    if (!trimmed || trimmed.includes('••••')) {
      if (!input.keepExistingKey && !trimmed) {
        // Explicit clear only when keepExistingKey is false and empty string sent with intent
        // UI always sends keepExistingKey=true when leaving blank
        if (input.keepExistingKey === false) {
          apiKey = '';
        }
      }
    } else {
      apiKey = trimmed;
    }
  }

  const baseURL =
    typeof input.baseURL === 'string'
      ? input.baseURL.trim() || undefined
      : current.baseURL;
  const model =
    typeof input.model === 'string' && input.model.trim()
      ? input.model.trim()
      : current.model || 'gpt-4o-mini';
  const apiMode: AppConfig['apiMode'] =
    input.apiMode === 'responses' || input.apiMode === 'chat_completions'
      ? input.apiMode
      : current.apiMode;

  const payload = {
    apiKey,
    baseURL: baseURL || '',
    model,
    apiMode,
  };

  try {
    const file = userDataSettingsPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');

    // Reflect into process.env so subsequent loadConfig / agents see it
    process.env.OPENAI_API_KEY = apiKey;
    if (baseURL) process.env.OPENAI_BASE_URL = baseURL;
    else delete process.env.OPENAI_BASE_URL;
    process.env.OPENAI_MODEL = model;
    process.env.OPENAI_API_MODE = apiMode;

    return { ok: true, settings: getPublicSettings() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `保存设置失败：${message}` };
  }
}

export { isPlaceholderKey };
