export {};

declare global {
  interface Window {
    blueBot: {
      updatePage: (payload: {
        title: string;
        url: string;
        text: string;
      }) => Promise<{ ok: boolean; page?: { title: string; url: string; updatedAt: number }; error?: string }>;
      getPageMeta: () => Promise<{
        title: string;
        url: string;
        textLength: number;
        updatedAt: number;
      }>;
      clearPage: () => Promise<{ ok: boolean }>;
      getAgentStatus: () => Promise<{
        hasApiKey: boolean;
        model: string;
        baseURL: string;
        apiMode: string;
      }>;
      chat: (
        message: string,
      ) => Promise<
        { ok: true; reply: string } | { ok: false; error: string }
      >;
    };
  }

  namespace Electron {
    interface WebviewTag extends HTMLElement {
      src: string;
      executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
      canGoBack: () => boolean;
      canGoForward: () => boolean;
      goBack: () => void;
      goForward: () => void;
      reload: () => void;
    }
  }
}
