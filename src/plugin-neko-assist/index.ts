import { type GroupMessageEvent } from '@naplink/naplink';
import fs from 'fs-extra';
import { jsonrepair } from 'jsonrepair';
import dayjs from 'dayjs';
import { type AIClient, type AIMessageItem } from '../ai-client.ts';
import { type QBotPlugin, type QBot } from '../qbot/index.ts';
import { debounce, tryReadJson } from '../utils/index.ts';
import { VolcesArk } from './volces-ark.ts';
import { ModelScope } from './model-scope.ts';

export interface NekoAssistInitOptions {
  apiKey: string;
}

export class NekoAssist implements QBotPlugin {
  name = 'neko-assist';
  qbot: QBot;

  /** 系统提示词 */
  systemPrompts: string;

  /** 长期记忆 */
  memory: Record<string, string> = {};
  saveMemory = debounce(async () => {
    await fs.writeJson('memory.json', this.memory, { spaces: 2 });
    console.log('✅ NekoAssist 长期记忆保存成功');
  }, 60000);

  /** ai 对话接口 */
  aiClient: AIClient;

  /** 当前是否正在执行 reply 函数 */
  isReplying = false;

  /** 当前 reply 函数正在回复的 user_id */
  replyingUserId: number = 0;

  /**
   * 在 reply 期间收到的可能需要回复的新消息先暂存在这里
   * 处理逻辑为 @ 机器人的消息优先级最高，消息中包含关键词的次之，其余消息优先级最低
   * 同一个用户 id 只会保留优先级最高的消息中最新的哪一条
   * 每次处理时优先选出优先级最高的消息中最早的那一条进行处理
   */
  replyQueue: { userId: number; message: string; messageId: number; priority: number }[] = [];

  constructor(options: NekoAssistInitOptions) {
    // this.aiClient = new VolcesArk(options.apiKey);
    this.aiClient = new ModelScope(options.apiKey);
  }

  install = async (qbot: QBot) => {
    this.qbot = qbot;
    [this.systemPrompts, this.memory] = await Promise.all([
      fs.readFile('system-prompts.md', 'utf-8'),
      tryReadJson('memory.json', {}),
    ]);
  };

  onGroupMessage = async (data: GroupMessageEvent) => {
    const message = data.raw_message;
    const messageId = Number(data.message_id);

    // 直接 @ 机器人的优先级最高
    if (message.includes(`[CQ:at,qq=${this.qbot.account}]`)) {
      await this.reply(data.user_id, message, messageId, 100);
    }
    // 包含关键词的优先级次之
    if (message.includes('猫猫')) {
      await this.reply(data.user_id, message, messageId, 50);
    } else if (message.includes('猫')) {
      await this.reply(data.user_id, message, messageId, 10);
    }
    // 其他消息优先级最低
    else if (data.message.some(item => item.type === 'text' && item.data.text.trim())) {
      await this.reply(data.user_id, message, messageId, 0);
    }
  };

  onPoke = async (data: GroupMessageEvent) => {
    await this.reply(data.user_id, `${data.user_id} 戳了戳了猫猫`, data.message_id, 1);
  };

  /**
   * 通过群消息或戳一戳触发的 llm 回复操作
   * 同一时间是会进行一个 reply 操作，其余的消息先暂存在 replyQueue 中等待后续处理
   */
  async reply(userId: number, message: string, messageId: number, priority: number) {
    const { qbot } = this;

    userId = Number(userId);

    // 如果当前正在 reply 的话，则先把消息加入队列，等待后续处理
    if (this.isReplying) {
      this.queueMessage(userId, message, messageId, priority);
      return;
    }

    // 没有其他 reply() 函数在执行的话就直接开始回复当前消息
    try {
      this.isReplying = true;
      this.replyingUserId = userId;

      const currentTime = dayjs().format('YYYY-MM-DD HH:mm');

      const recentHistory = (await qbot.getRecentHistory(15))
        .map(item => {
          return `${item.message_id} ${dayjs(item.timestamp * 1000).format('YYYY-MM-DD HH:mm')} ${item.sender} ${item.raw_message}`;
        })
        .join('\n');

      const commandsDescription = Array.from(qbot.command.metaMap.values())
        .map(cmd => cmd.description)
        .join('\n');

      const messageList: AIMessageItem[] = [
        {
          role: 'system',
          content: this.systemPrompts
            .replace('<%= ACCOUNT %>', qbot.account)
            .replace('<%= COMMANDS %>', commandsDescription)
            .replace('<%= MEMORY %>', JSON.stringify(this.memory))
            .replace('<%= HISTORY %>', recentHistory)
            .replace('<%= CURRENT_TIME %>', currentTime),
        },
        { role: 'user', content: message },
      ];

      console.log('*️⃣ NekoAssit 提示词生成完毕');
      console.log(messageList);

      // 调用 ai 接口，如果 json 解析失败了，则重试一次，再失败则报错
      let json: any;

      for (let i = 0; i < 2; ++i) {
        const [success, res] = await this.aiClient.chat(messageList);

        if (!success) {
          await qbot.sendGroupMessage(`接口请求失败了喵\n${res}`);
          return;
        }

        // 将回复解析为 JSON 数据
        try {
          json = JSON.parse(jsonrepair(res));
          break;
        } catch (e) {
          json = null;
          console.log('❌ NekoAssist chat 接口 JSON 指令解析失败了喵');
          console.dir(res, { depth: null });
          continue;
        }
      }

      if (!json) {
        throw new Error('大模型返回的 JSON 数据格式错误喵');
      }

      console.log('✅ NekoAssist chat 接口 JSON 指令解析完毕');
      console.dir(json, { depth: null });

      // 如果 action 为 silent，则不进行任何操作
      if (json.action === 'silent') {
        return;
      }

      if (json.action === 'reply') {
        const { memory, at } = json;
        let reply = json.reply || '';

        // 添加 at 操作
        if (at && at !== String(userId)) {
          reply = `[CQ:at,qq=${at}] ${reply}`;
        }

        // 更新长期记忆
        if (memory) {
          const { remember, delete: delKeys } = memory;

          if (Array.isArray(remember)) {
            for (const [key, value] of remember) {
              this.memory[key] = value;
            }
          }

          if (Array.isArray(delKeys)) {
            for (const key of delKeys) {
              delete this.memory[key];
            }
          }

          this.saveMemory();
        }

        // 过滤掉 emoji 字符
        reply = reply.replace(/\p{Emoji}/gu, '');

        // 如果当前最新消息不是提问消息，则添加 reply
        if (qbot.latestMessageId !== messageId) {
          reply = `[CQ:reply,id=${messageId}] ${reply}`;
        }

        await qbot.sendGroupMessage(reply);

        // 检查是否需要执行指令
        if (json.command) {
          qbot.command.invoke(json.command);
        }
      }
    } catch (e) {
      console.log('❌ in NekoAssist.reply():', e);
      await qbot.sendGroupMessage(`程序出错了喵\n${e.toString()}`);
    }

    this.isReplying = false;
    this.replyingUserId = 0;

    // 判断队列是否为空，继续执行后续任务
    if (this.replyQueue.length > 0) {
      const item = this.replyQueue.shift()!;
      this.reply(item.userId, item.message, item.messageId, item.priority);
    }
  }

  /** 向 this.replyQueue 中添加一条新消息 */
  queueMessage(userId: number, message: string, messageId: number, priority: number) {
    // 不处理当前正在回复用户的新消息
    if (userId === this.replyingUserId) return;

    const queue = this.replyQueue;

    // 如果当前队列中存在此用户的优先级更高的消息，则忽略当前消息
    if (queue.some(item => item.userId === userId && item.priority > priority)) return;

    // 删除队列中相同 id 的其他消息
    for (let i = queue.length - 1; i >= 0; --i) {
      if (queue[i].userId === userId) {
        queue.splice(i, 1);
      }
    }

    // 找到第一个优先级小于当前消息的位置，插入消息记录
    for (let i = 0; i <= queue.length; ++i) {
      if (queue[i].priority < priority || i === queue.length) {
        queue.splice(i, 0, { userId, message, messageId, priority });
        break;
      }
    }
  }
}
