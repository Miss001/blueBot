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
      openChat: () => Promise<{ ok: boolean }>;
      closeChat: () => Promise<{ ok: boolean }>;
      toggleChat: () => Promise<{ ok: boolean; open?: boolean }>;
      movePet: (dx: number, dy: number) => Promise<{ ok: boolean }>;
      onWindowUpdated: (cb: (meta: WindowMeta) => void) => () => void;
    };
  }
}
