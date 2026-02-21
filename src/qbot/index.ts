import path from 'node:path';
import { styleText } from 'node:util';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import NapLink, { type GroupMessageEvent } from '@naplink/naplink';
import getPort from 'get-port';
import { execa } from 'execa';
import { debounce, replaceAllAsync, tryReadJson, WorkerScheduler } from '../utils/index.ts';
import dayjs from 'dayjs';
import type { AddHistoryParams, GetRecentHistoryParams, MessageRecord } from './types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 保存消息记录的文件路径 */
const HISTORY_PATH = 'history.json';

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

  constructor(options: QBotInitOptions) {
    this.account = options.account;
    this.targetGroup = options.group;
    this.plugins = options.plugins;
    this.db = new WorkerScheduler(path.join(__dirname, 'database.worker.ts'), { groupId: this.targetGroup });
  }

  async setup() {
    // 初始化插件
    await Promise.all(
      this.plugins.map(async item => {
        await item.install?.(this);
        console.log(`✅ 插件初始化完毕: ${styleText('green', item.name)}`);
      })
    );

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
        this.naplink.sendGroupMessage(this.targetGroup, '[CQ:at,qq=2548705244] 登录要失效了喵，赶紧重新登录喵');
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
      console.log('✍️ 收到群组消息');
      console.dir(data, { depth: null });

      // 如果不是目标群组的消息，直接忽略
      if (this.targetGroup !== String(data.group_id)) return;

      // 记录消息结果
      await this.addHistory(String(data.message_id), String(data.user_id), data.raw_message, data.time);

      for (const item of this.plugins) {
        item.onGroupMessage?.(data);
      }
    });

    client.on('notice.notify.poke', async (data: GroupMessageEvent) => {
      console.log('✍️ 收到戳一戳消息');
      console.log(data);

      // 如果不是目标群组的消息，直接忽略
      if (this.targetGroup !== String(data.group_id)) return;

      for (const item of this.plugins) {
        item.onPoke?.(data);
      }
    });

    // client.on('raw', data => {
    //   console.log('✍️ 收到原始事件消息:');
    //   console.log(data);
    // });

    await client.connect();
    await client.sendGroupMessage(this.targetGroup, '猫猫上线了喵');
    console.log(`🚀 ${styleText('green', 'QBot 启动完毕')}`);
  }

  /** 向数据库添加一条消息记录 */
  async addHistory(messageId: string | number, sender: string | number, rawMessage: string, timeStamp: number) {
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

  /** 获取最近的 n 条记录 */
  async getRecentHistory(count: number): Promise<MessageRecord[]> {
    const params: GetRecentHistoryParams = {
      type: 'get-recent-history',
      recent: count,
    };

    const result = await this.db.runTask(params);

    return (result as any).result;
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
  onPoke?: (data: GroupMessageEvent) => void;
}
