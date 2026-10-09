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
import { getPageContent } from './pageStore';

let configured = false;
let currentModel = 'gpt-4o-mini';

const getCurrentPage = tool({
  name: 'get_current_page',
  description:
    '获取用户在 blueBot 内置浏览器中当前打开页面的标题、URL 与正文文本。回答与页面相关的问题时请先调用此工具。',
  parameters: z.object({}),
  execute: async () => {
    const page = getPageContent();
    if (!page.url && !page.text) {
      return JSON.stringify({
        ok: false,
        message: '当前还没有打开任何页面，或页面内容尚未同步。',
      });
    }
    return JSON.stringify({
      ok: true,
      title: page.title,
      url: page.url,
      text: page.text,
      updatedAt: page.updatedAt,
    });
  },
});

export function configureAgent(config: AppConfig): { ok: boolean; error?: string } {
  if (!config.apiKey) {
    return {
      ok: false,
      error:
        '未配置 API Key。请在项目根目录创建 .env（参考 .env.example），设置 OPENAI_API_KEY。',
    };
  }

  try {
    setTracingDisabled(true);
    setOpenAIAPI(config.apiMode);

    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    setDefaultOpenAIClient(client);
    currentModel = config.model;
    configured = true;
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
      '你是 blueBot，一个运行在用户桌面的助手。',
      '用户在应用内置浏览器中浏览网页；你可以通过工具 get_current_page 读取当前页面标题、URL 和正文。',
      '当用户的问题与当前网页有关时，先调用 get_current_page，再基于页面内容回答。',
      '回答使用简体中文，除非用户要求其他语言。',
      '不要编造页面上不存在的内容；若页面为空或无法读取，请如实说明。',
    ].join('\n'),
    tools: [getCurrentPage],
  });
}

export async function chatWithAgent(
  userMessage: string,
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  if (!configured) {
    return {
      ok: false,
      error: 'Agent 尚未配置。请检查 OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL。',
    };
  }

  try {
    const agent = createAgent();
    const page = getPageContent();
    const contextHint =
      page.url || page.title
        ? `\n\n（系统提示：用户当前可能在浏览「${page.title || '未命名页面'}」— ${page.url || '无 URL'}。如需引用页面内容，请调用 get_current_page。）`
        : '';

    const result = await run(agent, `${userMessage}${contextHint}`);
    const reply =
      typeof result.finalOutput === 'string'
        ? result.finalOutput
        : result.finalOutput != null
          ? JSON.stringify(result.finalOutput)
          : '（模型没有返回文本）';
    return { ok: true, reply };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `对话失败：${message}` };
  }
}
