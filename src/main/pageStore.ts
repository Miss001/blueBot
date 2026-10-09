export interface PageContent {
  title: string;
  url: string;
  text: string;
  updatedAt: number;
}

const MAX_TEXT_CHARS = 50_000;

let current: PageContent = {
  title: '',
  url: '',
  text: '',
  updatedAt: 0,
};

export function setPageContent(input: {
  title: string;
  url: string;
  text: string;
}): PageContent {
  const text =
    input.text.length > MAX_TEXT_CHARS
      ? `${input.text.slice(0, MAX_TEXT_CHARS)}\n\n…（正文已截断至 ${MAX_TEXT_CHARS} 字符）`
      : input.text;

  current = {
    title: input.title || '',
    url: input.url || '',
    text,
    updatedAt: Date.now(),
  };
  return current;
}

export function getPageContent(): PageContent {
  return current;
}

export function clearPageContent(): void {
  current = { title: '', url: '', text: '', updatedAt: 0 };
}
