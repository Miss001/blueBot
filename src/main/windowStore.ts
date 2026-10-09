export interface WindowContent {
  title: string;
  processName: string;
  processId: number;
  text: string;
  updatedAt: number;
  source: 'uia' | 'manual' | 'empty';
  error?: string;
}

const MAX_TEXT_CHARS = 50_000;

let current: WindowContent = {
  title: '',
  processName: '',
  processId: 0,
  text: '',
  updatedAt: 0,
  source: 'empty',
};

export function setWindowContent(input: {
  title: string;
  processName?: string;
  processId?: number;
  text: string;
  source?: WindowContent['source'];
  error?: string;
}): WindowContent {
  const text =
    input.text.length > MAX_TEXT_CHARS
      ? `${input.text.slice(0, MAX_TEXT_CHARS)}\n\n…（正文已截断至 ${MAX_TEXT_CHARS} 字符）`
      : input.text;

  current = {
    title: input.title || '',
    processName: input.processName || '',
    processId: input.processId || 0,
    text,
    updatedAt: Date.now(),
    source: input.source || 'uia',
    error: input.error,
  };
  return current;
}

export function getWindowContent(): WindowContent {
  return current;
}

export function clearWindowContent(): void {
  current = {
    title: '',
    processName: '',
    processId: 0,
    text: '',
    updatedAt: 0,
    source: 'empty',
  };
}

export function getWindowMeta(): {
  title: string;
  processName: string;
  processId: number;
  textLength: number;
  updatedAt: number;
  source: string;
  error?: string;
} {
  return {
    title: current.title,
    processName: current.processName,
    processId: current.processId,
    textLength: current.text.length,
    updatedAt: current.updatedAt,
    source: current.source,
    error: current.error,
  };
}
