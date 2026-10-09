export {};

declare global {
  interface WindowMeta {
    title: string;
    processName: string;
    processId: number;
    textLength: number;
    updatedAt: number;
    source: string;
    error?: string;
  }

  interface AgentStatus {
    hasApiKey: boolean;
    model: string;
    baseURL: string;
    apiMode: string;
    platform: string;
    uiaAvailable: boolean;
    statusLabel?: '已配置' | '未配置';
    apiKeyMasked?: string;
    source?: string;
  }

  interface PublicSettings {
    hasApiKey: boolean;
    apiKeyMasked: string;
    baseURL: string;
    model: string;
    apiMode: string;
    statusLabel: '已配置' | '未配置';
    source: string;
  }

  interface Window {
    blueBot: {
      getAgentStatus: () => Promise<AgentStatus>;
      chat: (
        message: string,
      ) => Promise<{ ok: true; reply: string } | { ok: false; error: string }>;
      getWindowMeta: () => Promise<WindowMeta>;
      refreshWindow: () => Promise<{
        ok: boolean;
        meta: WindowMeta;
        error?: string;
      }>;
      getSettings: () => Promise<PublicSettings>;
      saveSettings: (input: {
        apiKey?: string;
        baseURL?: string;
        model?: string;
        apiMode?: string;
        keepExistingKey?: boolean;
      }) => Promise<{
        ok: boolean;
        settings?: PublicSettings;
        agentOk?: boolean;
        agentError?: string;
        error?: string;
      }>;
      openChat: () => Promise<{ ok: boolean }>;
      closeChat: () => Promise<{ ok: boolean }>;
      toggleChat: () => Promise<{ ok: boolean; open?: boolean }>;
      movePet: (dx: number, dy: number) => Promise<{ ok: boolean }>;
      onWindowUpdated: (cb: (meta: WindowMeta) => void) => () => void;
    };
  }
}
