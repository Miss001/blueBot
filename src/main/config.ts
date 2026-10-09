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

function loadSettingsFile(): Partial<AppConfig> {
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
      return {
        apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : undefined,
        baseURL: typeof raw.baseURL === 'string' ? raw.baseURL : undefined,
        model: typeof raw.model === 'string' ? raw.model : undefined,
        apiMode:
          raw.apiMode === 'responses' || raw.apiMode === 'chat_completions'
            ? raw.apiMode
            : undefined,
      };
    } catch {
      // ignore invalid settings
    }
  }
  return {};
}

export function loadConfig(): AppConfig {
  loadDotEnv();
  const file = loadSettingsFile();

  const apiKey =
    process.env.OPENAI_API_KEY?.trim() || file.apiKey?.trim() || '';
  const baseURL =
    process.env.OPENAI_BASE_URL?.trim() || file.baseURL?.trim() || undefined;
  const model =
    process.env.OPENAI_MODEL?.trim() || file.model?.trim() || 'gpt-4o-mini';
  const apiModeEnv = process.env.OPENAI_API_MODE?.trim();
  const apiMode: AppConfig['apiMode'] =
    apiModeEnv === 'responses' || file.apiMode === 'responses'
      ? 'responses'
      : 'chat_completions';

  return { apiKey, baseURL: baseURL || undefined, model, apiMode };
}
