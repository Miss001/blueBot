# blueBot

Windows 桌面**悬浮宠物**助手：安装/启动后出现在桌面上，点击打开对话。Agent 通过 **Windows UI Automation（无障碍）** 读取**当前前台窗口**的标题与可见文本（浏览器网页、普通软件界面），再按你的要求回答。后续可扩展多步任务（点击、输入等）。

技术栈：Electron + TypeScript + [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/)（`@openai/agents`）。支持 OpenAI 官方及 **OpenAI 兼容**接口（自定义 `baseURL`，默认 `chat_completions` 模式）。

> 已移除内置网页浏览器。读取的是系统里**正在前台的那个窗口**，不是 App 自己嵌的网页。

## 功能（当前版本）

- 右下角置顶、无边框悬浮宠物（可拖动）；点击打开中文对话面板
- 后台轮询前台窗口；对话聚焦时保留上一次「外部窗口」缓存，避免读到自己
- Agent 工具：`get_current_window_content`（可读标题 / 进程名 / 文本）
- 配置：`.env` 或 `settings.json`（密钥不要提交到 Git）
- 更清晰的 API Key / 超时 / 网络错误提示

## 环境要求

- **Windows**（前台窗口读取依赖 UI Automation；其他系统可启动宠物与对话，但无法读窗口）
- Node.js **22+** 推荐
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

仅类型检查：

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

若对话提示「未配置 / 无效 Key」或「请求超时」，请先确认 Key 与 `OPENAI_BASE_URL` 是否正确，保存后**重启**应用。

## 项目结构

```
assets/                 宠物形象等静态资源
scripts/                构建脚本、Windows UIA 读取脚本
src/main/               Electron 主进程、Agent、窗口读取
src/renderer/           宠物窗口 + 对话面板（中文 UI）
```

关键文件：

- `src/main/agent.ts` — Agents SDK、`get_current_window_content`（含后续 click/type 占位注释）
- `src/main/uia.ts` + `scripts/read-foreground-window.ps1` — Windows 前台窗口读取
- `src/main/windowStore.ts` — 窗口内容缓存
- `src/main/main.ts` — 悬浮宠物、对话窗、轮询与 IPC
- `src/renderer/pet.*` / `chat.*` — 界面

## Windows UI Automation 限制（请务必了解）

- 读取的是**前台/焦点相关窗口**的无障碍树，不是像素级 OCR；控件若未暴露文本则可能读不全。
- **以管理员权限运行的应用**：若 blueBot 非管理员，可能读不到，需同源权限或改用较低权限目标。
- **浏览器**：部分页面/扩展对无障碍支持一般；Chrome 等可在 `chrome://accessibility` 查看；受保护内容、跨域 iframe、画布文字可能读不到。
- 密码框、安全桌面、部分游戏/直绘界面通常无法读取。
- 对话面板打开并聚焦时，会**跳过**把自己当成前台目标，继续使用上一次外部窗口缓存；也可点「刷新窗口」。

## 后续扩展

工具层已预留多步任务位置（点击、输入、按键等占位注释）。当前仅实现「读窗口 + 对话」。安装包与开机启动可用 `electron-builder` 再加。

## 许可证

MIT
