import OpenAI from 'openai';
import {
  Agent,
  run,
  tool,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from '@openai/agents';
import { z } from 'zod';
import type { AppConfig } from './config';
import { getWindowContent } from './windowStore';
import { refreshWindowContent } from './uia';

let configured = false;
let missingKey = false;
let currentModel = 'gpt-4o-mini';

/**
 * 读取当前（或最近缓存的）前台窗口内容。
 * 后续可在此旁增加 click / type / key 等执行类工具，支撑多步任务。
 */
const getCurrentWindowContent = tool({
  name: 'get_current_window_content',
  description:
    '获取用户桌面上当前关注/前台窗口的标题、进程名与可见文本（通过 Windows UI Automation）。回答与屏幕内容有关的问题时请先调用此工具。',
  parameters: z.object({
    refresh: z
      .boolean()
      .default(true)
      .describe('是否先刷新一次前台窗口读取；默认 true'),
  }),
  execute: async ({ refresh }) => {
    if (refresh) {
      try {
        await refreshWindowContent();
      } catch {
        // fall through to cache
      }
    }
    const win = getWindowContent();
    if (!win.title && !win.text) {
      return JSON.stringify({
        ok: false,
        message:
          win.error ||
          '暂无窗口内容。请先切换到目标窗口（浏览器或软件），稍等自动同步后再问。',
        error: win.error,
      });
    }
    return JSON.stringify({
      ok: true,
      title: win.title,
      processName: win.processName,
      processId: win.processId,
      text: win.text,
      updatedAt: win.updatedAt,
      error: win.error,
    });
  },
});

/*
 * --- 后续多步任务执行工具（占位，尚未实现）---
 *
 * const clickElement = tool({
 *   name: 'click_element',
 *   description: '点击当前窗口中符合条件的控件（UIA）',
 *   parameters: z.object({ name: z.string(), controlType: z.string().optional() }),
 *   execute: async () => ({ ok: false, message: '尚未实现' }),
 * });
 *
 * const typeText = tool({
 *   name: 'type_text',
 *   description: '向当前焦点或指定控件输入文字',
 *   parameters: z.object({ text: z.string() }),
 *   execute: async () => ({ ok: false, message: '尚未实现' }),
 * });
 *
 * const pressKeys = tool({
 *   name: 'press_keys',
 *   description: '发送组合键，例如 Ctrl+C',
 *   parameters: z.object({ keys: z.string() }),
 *   execute: async () => ({ ok: false, message: '尚未实现' }),
 * });
 */

export function configureAgent(config: AppConfig): { ok: boolean; error?: string } {
  missingKey = !config.apiKey;
  configured = false;

  if (!config.apiKey) {
    return {
      ok: false,
      error:
        '未配置 API Key。请点击对话窗口右上角「设置」，填写 API Key（可选 Base URL / 模型）后保存。也可使用项目 .env。',
    };
  }

  if (
    config.apiKey.includes('your-key') ||
    config.apiKey === 'sk-your-key-here'
  ) {
    missingKey = true;
    return {
      ok: false,
      error:
        '检测到占位 API Key。请打开「设置」填写真实密钥并保存。',
    };
  }

  try {
    setTracingDisabled(true);
    setOpenAIAPI(config.apiMode);

    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      timeout: 60_000,
      maxRetries: 1,
    });
    setDefaultOpenAIClient(client);
    currentModel = config.model;
    configured = true;
    missingKey = false;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `初始化 Agent 失败：${message}` };
  }
}

function createAgent(): Agent {
  return new Agent({
    name: 'blueBot',
    model: currentModel,
    instructions: [
      '你是 blueBot，一个运行在用户 Windows 桌面上的悬浮宠物助手。',
      '你可以调用工具 get_current_window_content，读取用户当前前台窗口（浏览器或任意软件）的标题与可见文本。',
      '用户说「根据这个页面 / 这个软件 / 当前窗口」时，先调用工具再回答。',
      '回答使用简体中文，除非用户要求其他语言。',
      '不要编造窗口上不存在的内容；若读取失败或为空，请如实说明，并提示可能原因（管理员窗口、无障碍未开、浏览器限制等）。',
      '你目前只能「读」窗口内容，还不能点击或输入；若用户要求操作界面，说明该能力即将支持，并给出可手动完成的步骤建议。',
      '为后续多步任务做好规划：需要多步时先简述计划，再逐步执行（当前仅有读取工具）。',
    ].join('\n'),
    tools: [getCurrentWindowContent],
  });
}

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (missingKey || /api key|authentication|401|unauthorized/i.test(message)) {
    return (
      'API Key 无效或未配置。请点击右上角「设置」检查 API Key / Base URL / 模型并保存。\n' +
      `技术细节：${message}`
    );
  }
  if (/timeout|timed out|etimedout|aborted/i.test(lower)) {
    return (
      '请求超时。请检查网络、OPENAI_BASE_URL 是否可访问，或稍后重试。' +
      `若使用中转，确认地址形如 https://host/v1。\n技术细节：${message}`
    );
  }
  if (/enotfound|econnrefused|fetch failed|network/i.test(lower)) {
    return (
      '无法连接模型接口。请检查网络与 OPENAI_BASE_URL。\n' +
      `技术细节：${message}`
    );
  }
  if (/429|rate limit/i.test(lower)) {
    return `调用频率过高或额度不足：${message}`;
  }
  return `对话失败：${message}`;
}

export async function chatWithAgent(
  userMessage: string,
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  if (!configured) {
    return {
      ok: false,
      error: missingKey
        ? '尚未配置有效的 API Key。请点击右上角「设置」填写并保存。'
        : 'Agent 尚未就绪。请打开「设置」检查 API Key / Base URL / 模型。',
    };
  }

  try {
    const agent = createAgent();
    const win = getWindowContent();
    const contextHint =
      win.title || win.processName
        ? `\n\n（系统提示：用户最近关注的窗口是「${win.title || '无标题'}」` +
          `${win.processName ? `（${win.processName}）` : ''}。` +
          `如需引用屏幕内容，请调用 get_current_window_content。）`
        : '\n\n（系统提示：尚未缓存到前台窗口。若问题与屏幕有关，请先调用 get_current_window_content。）';

    const result = await run(agent, `${userMessage}${contextHint}`);
    const reply =
      typeof result.finalOutput === 'string'
        ? result.finalOutput
        : result.finalOutput != null
          ? JSON.stringify(result.finalOutput)
          : '（模型没有返回文本）';
    return { ok: true, reply };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}
