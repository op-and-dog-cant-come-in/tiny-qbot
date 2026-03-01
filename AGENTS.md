# 项目概述

TinyQBot 是一个基于 [NapCatQQ](https://github.com/NapNeko/NapCatQQ) 的 QQ 群机器人项目，使用 TypeScript 开发。通过 Docker 运行 NapCatQQ 服务，配合 NapLink 库实现 QQ 机器人能力。核心功能包括 AI 对话、定时任务、图片识别、语音合成等。

## 技术栈

- **运行时**: Node.js 24.13.1 (通过 Volta 管理)
- **包管理器**: pnpm 10.30.0 (通过 Volta 管理)
- **语言**: TypeScript 5.9.3，使用 ts-node 直接运行
- **QQ 机器人**: NapCatQQ (Docker) + @naplink/naplink
- **数据库**: node:sqlite (Worker 线程)
- **定时任务**: node-schedule

## 项目结构

```
qbot/
├── src/
│   ├── index.ts                    # 入口文件，初始化 QBot 和插件
│   ├── ai-client.ts                # AI 客户端接口定义
│   ├── qbot/
│   │   ├── index.ts                # QBot 核心类
│   │   ├── types.ts                # 类型定义
│   │   ├── database.worker.ts      # 数据库 Worker 线程
│   │   └── system-message.ts       # 系统消息类
│   ├── utils/
│   │   ├── index.ts                # 工具函数
│   │   ├── worker.ts               # Worker 调度器
│   │   └── http-client.ts          # HTTP 客户端封装
│   └── plugin-xxx/                 # 插件目录
│       └── index.ts
├── system-prompts.md               # AI 系统提示词
├── memory.json                     # AI 长期记忆
├── corn.json                       # 定时任务配置
├── docker-compose.template.yml     # Docker Compose 模板
├── ecosystem.config.cjs            # PM2 配置
└── package.json
```

## 核心架构

### QBot 类 ([src/qbot/index.ts](src/qbot/index.ts))

主控制器，负责：
- 管理 NapLink 连接
- 插件生命周期管理
- 指令注册与执行
- 消息历史记录
- 群消息发送

```typescript
const qbot = new QBot({
  account: 'QQ号',
  group: '群号',
  plugins: [/* 插件实例数组 */],
});
await qbot.setup();
```

### 插件系统

插件需实现 `QBotPlugin` 接口：

```typescript
interface QBotPlugin {
  name: string;                                                    // 插件名称
  install?: (qbot: QBot) => Promise<void>;                        // 安装钩子
  onGroupMessage?: (data: GroupMessageEvent) => void;             // 群消息钩子
  onPoke?: (data: PokeNotice, messageId, message, from, to) => void;  // 戳一戳钩子
}
```

### 指令系统

在插件的 `install` 钩子中注册指令：

```typescript
qbot.command.register({
  name: '指令名',
  alias: ['别名1', '别名2'],           // 可选
  description: '指令描述',
  handler: async (params: CommandHandlerParams) => {
    // params.params - 指令参数字符串
    // params.sender - 发送者 QQ 号
    // params.silent - 是否静默执行
    return '返回结果描述';
  },
});
```

### Worker 线程

数据库操作在 Worker 线程中执行，避免阻塞主线程：

```typescript
// 主线程调用
const records = await qbot.getRecentHistory(0, 10);

// Worker 实现 (database.worker.ts)
parentPort.on('message', async (params) => {
  // 处理数据库操作
  parentPort.postMessage(result);
});
```

## 开发规范

### 代码风格

- 使用 ES Module 语法 (`import`/`export`)
- 文件路径使用 `.ts` 扩展名
- 使用 `verbatimModuleSyntax: true`，类型导入需使用 `import type`
- 不添加代码注释（除非用户要求）

### 新增插件流程

1. 在 `src/` 下创建 `plugin-xxx/index.ts`
2. 实现 `QBotPlugin` 接口
3. 在 `src/index.ts` 中导入并添加到 `plugins` 数组

### 消息发送

```typescript
// 发送群消息
await qbot.sendGroupMessage('消息内容');

// CQ 码语法
'[CQ:at,qq=123456]'           // @ 用户
'[CQ:image,file=path]'        // 发送图片
'[CQ:reply,id=xxx]'           // 引用消息
'[CQ:record,file=url]'        // 发送语音
```

### AI 客户端

项目使用魔搭 (ModelScope) 或火山引擎 (VolcesArk) 作为 LLM 服务：

```typescript
interface AIClient {
  currentModel: string;
  chat(messages: AIMessageItem[]): Promise<[boolean, string]>;
}
```

## 环境要求

- Docker (运行 NapCatQQ)
- Volta (管理 Node.js 版本)
- uv (部分插件需要执行 Python 脚本)

## 注意事项

- 项目仅支持单群组服务，不支持私聊
- AI 系统提示词在 `system-prompts.md` 中定义
- 长期记忆保存在 `memory.json` 中
- 定时任务保存在 `corn.json` 中
- 消息历史保存在 `{群号}.db` SQLite 数据库中
