import path from 'node:path';
import { styleText } from 'node:util';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import NapLink, { type GroupMessageEvent, type PokeNotice } from '@naplink/naplink';
import getPort from 'get-port';
import { execa } from 'execa';
import { ensureStringId, WorkerScheduler } from '../utils/index.ts';
import type { AddHistoryParams, GetRecentHistoryParams, MessageRecord } from './types.ts';
import type { SystemMessage } from './system-message.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class QBot {
  /** 机器人登录的 QQ 账号 */
  account: string;

  /** 机器人服务的群组，以群号数组表示 */
  targetGroup: string;

  /** 插件列表 */
  plugins: QBotPlugin[];

  /** naplink 实例 */
  naplink: NapLink;

  /** napcat 的 ws 连接端口 */
  wsPort: number;

  /** 保存消息记录等内容的数据库 worker 句柄 */
  db: WorkerScheduler;

  /** 记录最新一条群消息的 id */
  latestMessageId: string = '';

  constructor(options: QBotInitOptions) {
    this.account = options.account;
    this.targetGroup = options.group;
    this.plugins = options.plugins;
    this.db = new WorkerScheduler(path.join(__dirname, 'database.worker.ts'), { groupId: this.targetGroup });
  }

  /** 指令相关逻辑 */
  command = {
    /** 当前已注册的指令执行函数 */
    handlerMap: new Map<string, (params: CommandHandlerParams) => Promise<string>>(),

    /** 当前已注册的指令元信息 */
    metaMap: new Map<string, CommandParams>(),

    /** 注册一条指令，该操作无法撤销 */
    register: (params: CommandParams) => {
      const { handlerMap, metaMap } = this.command;

      if (handlerMap.has(params.name)) {
        throw new Error(`指令 ${params.name} 已注册`);
      }

      for (const item of params.alias || []) {
        if (handlerMap.has(item)) {
          throw new Error(`指令别名 ${item} 已注册`);
        }
      }

      handlerMap.set(params.name, params.handler);

      for (const item of params.alias || []) {
        handlerMap.set(item, params.handler);
      }

      metaMap.set(params.name, params);
    },

    /**
     * 执行一条指令，返回 [是否存在该指令, 指令的执行结果]
     * 需注意：第一个返回值为 true 仅代表该指令存在，指令是否报错仍需根据第二个返回值判断
     */
    invoke: async (command: string, sender: string, silent = false): Promise<[boolean, string]> => {
      try {
        // 有时 ai 会忘记填写 command 字段，这里做下容错
        if (!command) return [false, '指令为空，请提供指令内容'];

        let [name, args] = command.trim().replace(/\s+/, '\u200B').split('\u200B');

        // 允许省略指令开头的斜杠
        if (name.startsWith('/')) {
          name = name.slice(1);
        }

        const handler = this.command.handlerMap.get(name.toLowerCase());

        if (!handler) {
          return [false, `指令 ${name} 不存在`];
        }

        const result = await handler({ params: args, sender, silent });

        return [true, result];
      } catch (e) {
        console.log(`❌ 指令执行出错 ${sender}: ${command}`);
        console.dir(e);
        !silent && (await this.sendGroupMessage(`指令执行失败了喵:${command}\n${e.toString()}`));
        return [false, e.toString()];
      }
    },
  };

  async setup() {
    /** 获取一个空闲的端口用作 ws 连接 */
    const wsPort = (this.wsPort = await getPort());

    // 构造 docker-compose.yml 配置文件
    fs.writeFileSync(
      'docker-compose.yml',
      fs
        .readFileSync('docker-compose.template.yml', 'utf-8')
        .replaceAll('<%= ACCOUNT %>', this.account)
        .replaceAll('<%= WS_PORT %>', wsPort.toString())
    );

    const napcatProcess = execa('docker-compose up --no-color');
    napcatProcess.stdout.pipe(process.stdout);

    const { promise, resolve } = Promise.withResolvers<void>();
    const watchWsServerStarted = (data: any) => {
      if (data.toString().includes(`[OneBot] [WebSocket Server] Server Started`)) {
        resolve();
      }

      // 实际测试表明断连消息不一定发送成功，只是作为一种提醒方案
      if (data.toString().includes('[KickedOffLine]')) {
        this.naplink.sendGroupMessage(this.targetGroup, '登录要失效了喵，赶紧重新登录喵');
      }
    };

    // 等待 ws 服务启动完毕
    napcatProcess.stdout.on('data', watchWsServerStarted);
    await promise;

    // 启动 naplink 服务
    const client = (this.naplink = new NapLink({
      connection: {
        url: `ws://localhost:${wsPort}`,
      },
    }));

    // naplink 事件统一由 qbot 监听，触发对应的插件监听器函数
    // 插件通常不应独立监听 naplink 事件
    client.on('message.group', async (data: GroupMessageEvent) => {
      // 如果不是目标群组的消息，直接忽略
      // 自己发送的消息也会忽略（理论上不会收到自己发送的消息，但还是保险起见加下）
      const groupId = ensureStringId(data.group_id);
      const senderId = ensureStringId(data.user_id);

      if (this.targetGroup !== groupId || senderId === this.account) return;

      console.log('✍️ 收到群组消息');
      console.dir(data, { depth: null });

      this.latestMessageId = ensureStringId(data.message_id);

      // 忽略空消息
      if (!data.raw_message.trim()) return;

      // 尝试执行指令调用，如果成功匹配指令，则不触发插件的 onGroupMessage 回调
      const [success] = await this.command.invoke(data.raw_message, senderId);

      if (!success) {
        this.invokeGroupMessage(data);
      }
    });

    client.on('notice.notify.poke', async (data: PokeNotice) => {
      const fromUserId = ensureStringId(data.user_id);
      const toUserId = ensureStringId(data.target_id);
      const messageId = 'poke:' + data.time; // 戳一戳没有消息 id，使用 poke:时间戳代替

      this.latestMessageId = messageId;

      let cnt = 0;
      const message = data.raw_info
        .map(item => {
          if (item.type === 'nor') return item.txt;
          if (item.type === 'qq') {
            const result = cnt === 0 ? fromUserId : toUserId;
            cnt++;
            return result;
          }

          return '';
        })
        .join('');

      console.log('✍️ 收到戳一戳消息');
      console.dir(data, { depth: null });

      // 如果不是目标群组的消息，直接忽略
      if (this.targetGroup !== String(data.group_id)) return;

      // 添加消息记录
      await this.addHistory(messageId, fromUserId, message, data.time);

      for (const item of this.plugins) {
        item.onPoke?.(data, messageId, message, fromUserId, toUserId);
      }
    });

    // client.on('raw', data => {
    //   console.log('✍️ 收到原始事件消息:');
    //   console.log(data);
    // });

    await client.connect();
    // await client.sendGroupMessage(this.targetGroup, '猫猫上线了喵');

    // 初始化插件
    await Promise.all(
      this.plugins.map(async item => {
        await item.install?.(this);
        console.log(`✅ 插件初始化完毕: ${styleText('green', item.name)}`);
      })
    );

    console.log(`🚀 ${styleText('green', 'QBot 启动完毕')}`);
  }

  /** 手动触发插件的 onGroupMessage 消息，方法不会在 QQ 中真实发送 data 消息，但会记录在消息历史中 */
  async invokeGroupMessage(data: GroupMessageEvent | SystemMessage) {
    // 记录历史消息
    await this.addHistory(String(data.message_id), String(data.user_id), data.raw_message, data.time);

    // 触发 onGroupMessage 回调
    for (const item of this.plugins) {
      item.onGroupMessage?.(data as GroupMessageEvent);
    }
  }

  /** 向数据库添加一条消息记录 */
  async addHistory(messageId: string, sender: string, rawMessage: string, timeStamp: number) {
    // 注意 id 可能由于精度原因存在小数部分，需仅保留整数
    const params: AddHistoryParams = {
      type: 'add-history',
      messageId: String(messageId).split('.')[0],
      sender: String(sender).split('.')[0],
      rawMessage,
      timeStamp,
    };

    await this.db.runTask(params);
  }

  /** 获取最近的第 start 到第 end 条记录（左闭右开区间），新发的消息在前 */
  async getRecentHistory(start: number, end: number): Promise<MessageRecord[]> {
    const params: GetRecentHistoryParams = {
      type: 'get-recent-history',
      start,
      end,
    };

    const result = await this.db.runTask(params);

    return (result as any).result;
  }

  /** 向目标群组发送消息，并更新消息记录。返回发送的消息 id，特殊的消息会通过 prefix 参数添加前缀 */
  async sendGroupMessage(raw_message: string, prefix: '' | 'corn' = ''): Promise<string> {
    const { message_id } = await this.naplink.sendGroupMessage(this.targetGroup, raw_message);
    const msg = await this.naplink.getMessage(message_id);

    // 非空消息才记录
    if (msg.raw_message.trim()) {
      await this.addHistory((prefix ? prefix + ':' : '') + msg.message_id, msg.user_id, msg.raw_message, msg.time);
    }

    return message_id;
  }
}

/** QBot 类初始化参数 */
export interface QBotInitOptions {
  /** 机器人登录的 qq 号 */
  account: string;

  /** 机器人服务的群组，以群号数组表示 */
  group: string;

  /** 插件 */
  plugins: QBotPlugin[];
}

/** QBot 插件需要满足的格式 */
export interface QBotPlugin {
  /** 插件名称 */
  name: string;

  /** 在 QBot 构造函数执行完毕时调用的钩子函数，此时 napcat 尚未初始化 */
  install?: (qbot: QBot) => Promise<void>;

  /** 在收到群消息时触发的 hook 函数 */
  onGroupMessage?: (data: GroupMessageEvent) => void;

  /** 在戳一戳时触发的 hook 函数 */
  onPoke?: (data: PokeNotice, messageId: string, message: string, fromUserId: string, toUserId: string) => void;
}

export interface CommandParams {
  /** 指令名称 */
  name: string;

  /** 指令别名 */
  alias?: string[];

  /** 指令描述 */
  description: string;

  /** 指令执行函数，需以字符串形式返回 LLM 友好的执行结果描述 */
  handler: (params: CommandHandlerParams) => Promise<string>;
}

export interface CommandHandlerParams {
  /** 指令参数，固定为字符串内容，需指令根据需要自行解析格式 */
  params: string;

  /** 发送者 qq 号 */
  sender: string;

  /** 是否静默执行，不发送群消息提示 */
  silent: boolean;
}
