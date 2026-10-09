# blueBot

独立桌面 Agent：内置浏览器打开网页后，**自动同步**当前页面标题 / URL / 正文；右侧对话可让 Agent 通过工具 `get_current_page` 参考页面内容回答。

技术栈：Electron + TypeScript + [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/)（`@openai/agents`）。支持 OpenAI 官方及 **OpenAI 兼容**接口（自定义 `baseURL`）。

## 功能（MVP）

- 左侧：地址栏 + 内置浏览器（前进 / 后退 / 刷新）
- 页面加载或导航后自动抽取 `document.body.innerText`（约 5 万字符上限）并同步给 Agent
- 右侧：对话面板；Agent 可调用 `get_current_page` 工具读取最新页面
- 配置：`.env` 或 `settings.json`（密钥不要提交到 Git）

## 环境要求

- Node.js **22+** 推荐（当前依赖 `openai` / Electron 新版本要求）；Node 20 可能仅能编译、运行告警
- 可访问你所选的大模型 API

## 安装与运行

```bash
git clone https://github.com/Miss001/blueBot.git
cd blueBot
npm install
cp .env.example .env
# 编辑 .env，填入你的 Key 与模型
npm start
```

开发同 `npm start`（先编译再启动 Electron）。仅类型检查：

```bash
npm run typecheck
```

## 配置说明

优先读取环境变量；也可使用项目根目录的 `settings.json`（参考 `settings.example.json`）。**不要**把真实 Key 提交进仓库。

| 变量 | 说明 |
| --- | --- |
| `OPENAI_API_KEY` | API Key（必填） |
| `OPENAI_BASE_URL` | 兼容接口地址，例如 `https://api.example.com/v1`；官方可留空 |
| `OPENAI_MODEL` | 模型名，默认 `gpt-4o-mini` |
| `OPENAI_API_MODE` | `chat_completions`（默认，兼容中转更友好）或 `responses` |

`.env` 示例：

```env
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_MODE=chat_completions
```

## 项目结构

```
src/main/          Electron 主进程、Agent、页面缓存
src/renderer/      界面（浏览器 + 对话）
scripts/           构建时复制静态资源
```

关键文件：

- `src/main/agent.ts` — Agents SDK、`get_current_page` 工具
- `src/main/pageStore.ts` — 当前页内容（自动同步写入）
- `src/main/main.ts` — 窗口与 IPC
- `src/renderer/renderer.ts` — 地址栏、webview 同步、聊天 UI

## 后续扩展

工具层已按「可插拔」方式组织，后续可继续加多步任务、更多工具（搜索、笔记、导出等）。安装包（桌面快捷方式）可用 `electron-builder` 再加，当前用 `npm start` 本地运行即可。

## 许可证

MIT
