import path from 'node:path';
import { styleText } from 'node:util';
import fs from 'fs-extra';
import NapLink, { type GroupMessageEvent } from '@naplink/naplink';
import getPort from 'get-port';
import { execa } from 'execa';
import { debounce, replaceAllAsync, tryReadJson } from './utils/index.ts';
import dayjs from 'dayjs';

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

  /** 保存消息记录 */
  history: string[] = [];
  saveHistory = debounce(async () => {
    await fs.writeJson(HISTORY_PATH, this.history, { spaces: 2 });
    console.log('✅ 消息记录保存成功');
  }, 5000);

  constructor(options: QBotInitOptions) {
    this.account = options.account;
    this.targetGroup = options.group;
    this.plugins = options.plugins;
  }

  async setup() {
    // 读取历史记录文件，记录最近 30 条消息
    const history = (this.history = await tryReadJson(HISTORY_PATH, []));

    // 初始化插件
    await Promise.all(
      this.plugins.map(async item => {
        await item.install?.(this);
        console.log(`✅ 插件${styleText('green', item.name)} 初始化完毕`);
      })
    );

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

    client.on('message.group', async (data: GroupMessageEvent) => {
      console.log('*️⃣ 收到群组消息\n', data);

      // 如果不是目标群组的消息，直接忽略
      if (this.targetGroup !== String(data.group_id)) return;

      /** 去除两侧空白，将 @ 命令进行简写，并将 reply 字段消息展开后的 raw_message 结果 */
      let message = data.raw_message;

      // 提取出 reply 字段的消息，最多提取三层
      for (let i = 0; i < 3; ++i) {
        const result = await replaceAllAsync(message, /\[CQ:reply,id=\d+\]/g, async matched => {
          const id = matched.slice(13, -1);
          const refer = await this.naplink.getMessage(id).catch(() => ({ raw_message: `消息不存在` }));
          return `<refer>${refer.raw_message}</refer>`;
        });

        if (result === message) break;

        message = result;
      }

      // 记录群组历史消息，按 [time] [user_id]: [raw_message] 格式
      message = message
        .replaceAll(/\[CQ:at,qq=(\d+)\]/g, '@$1')
        .replaceAll(/\[CQ:[^\]]+\]/g, '')
        .trim();

      if (message) {
        history.push(`${dayjs.unix(data.time).format('YY:MM:DD:HH:mm')} ${data.user_id}: ${message}`);
        this.saveHistory();
      }

      const info = {
        resolvedRawMessage: message,
      };

      for (const item of this.plugins) {
        item.onGroupMessage?.(data, info);
      }
    });

    await client.connect();
    await client.sendGroupMessage(this.targetGroup, '猫猫上线了喵');
    console.log(`🚀 ${styleText('green', 'QBot 启动完毕')}`);
  }
}

export interface QBotInitOptions {
  /** 机器人登录的 qq 号 */
  account: string;

  /** 机器人服务的群组，以群号数组表示 */
  group: string;

  /** 插件 */
  plugins: QBotPlugin[];
}

export interface QBotPlugin {
  /** 插件名称 */
  name: string;

  /** 在 QBot 构造函数执行完毕时调用的钩子函数，此时 napcat 尚未初始化 */
  install?: (qbot: QBot) => Promise<void>;

  /** 在收到群消息时触发的 hook 函数 */
  onGroupMessage?: (data: GroupMessageEvent, info: QBotMessageInfo) => void;

  /** 在戳一戳时触发的 hook 函数 */
  onPoke?: (data: GroupMessageEvent) => void;
}

export interface QBotMessageInfo {
  resolvedRawMessage: string;
}
