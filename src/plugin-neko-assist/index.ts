import { type GroupMessageEvent, type PokeNotice } from '@naplink/naplink';
import fs from 'fs-extra';
import { jsonrepair } from 'jsonrepair';
import dayjs from 'dayjs';
import { type AIClient, type AIMessageItem } from '../ai-client.ts';
import { type QBotPlugin, type QBot } from '../qbot/index.ts';
import { debounce, ensureArray, ensureStringId, tryReadJson } from '../utils/index.ts';
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
  replyingUserId: string = '';

  /** 最近一次回复的消息 id */
  lastReplyMessageId: string = '';

  /**
   * 在 reply 期间收到的可能需要回复的新消息先暂存在这里
   * 处理逻辑为 @ 机器人的消息优先级最高，消息中包含关键词的次之，其余消息优先级最低
   * 同一个用户 id 只会保留优先级最高的消息中最新的哪一条
   * 每次处理时优先选出优先级最高的消息中最早的那一条进行处理
   */
  replyQueue: { userId: string; message: string; messageId: string; priority: number }[] = [];

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

    qbot.command.register({
      name: 'current-model',
      alias: ['当前模型'],
      description: '查看猫猫当前使用的ai模型',
      handler: async params => {
        const model = this.aiClient.currentModel;
        !params.silent && (await qbot.sendGroupMessage(`猫猫当前使用的ai模型为 ${model}`));
        return model;
      },
    });

    qbot.command.register({
      name: 'memory',
      alias: ['长期记忆'],
      description: '查看猫猫的长期记忆',
      handler: async params => {
        const memory = JSON.stringify(this.memory, null, 2);
        !params.silent && (await qbot.sendGroupMessage(`猫猫的长期记忆为 ${memory}`));
        return memory;
      },
    });

    qbot.command.register({
      name: 'recent',
      alias: ['历史消息'],
      description:
        '获取最近的第 start 到 end 条历史消息，格式：/recent <start> <end>（左闭右开区间），该指令仅供猫猫后台使用',
      handler: async params => {
        const { params: args, silent } = params;
        const [startStr, endStr] = args?.split(' ') || [];
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);

        if (isNaN(start) || isNaN(end) || start < 0 || end <= start) {
          const errorMsg = '参数格式错误，请使用：/recent <start> <end>，其中 start 和 end 为非负整数，且 end > start';
          !silent && (await qbot.sendGroupMessage(errorMsg));
          return errorMsg;
        }

        try {
          const recentHistory = await qbot.getRecentHistory(start, end);
          const historyStr = recentHistory
            .map(item => {
              return `${item.message_id} ${dayjs(item.timestamp * 1000).format('YYYY-MM-DD HH:mm')} ${item.sender} ${item.raw_message}`;
            })
            .join('\n');

          const result = historyStr || '未找到历史消息';

          return result;
        } catch (e) {
          return `获取历史消息失败：${e.toString()}`;
        }
      },
    });
  };

  onGroupMessage = async (data: GroupMessageEvent) => {
    const message = data.raw_message;
    const messageId = ensureStringId(data.message_id);
    const senderId = ensureStringId(data.user_id);

    // 自己发送的消息
    if (senderId === this.qbot.account) {
      // id 以 corn: 开头表示为定时任务，这是唯一需要处理的自己发送的消息
      if (messageId.startsWith('corn:')) {
        await this.reply(senderId, message, messageId, 100);
      }
    }
    // 直接 @ 机器人的优先级最高
    else if (message.includes(`[CQ:at,qq=${this.qbot.account}]`)) {
      await this.reply(senderId, message, messageId, 100);
    }
    // 包含关键词的优先级次之
    else if (message.includes('猫猫')) {
      await this.reply(senderId, message, messageId, 50);
    } else if (message.includes('猫')) {
      await this.reply(senderId, message, messageId, 10);
    }
    // 其他消息优先级最低，且保持 5s 后仍是最新消息时再处理
    else {
      // 等待 15s 后再处理，避免连续发送消息的场景
      await new Promise(resolve => setTimeout(resolve, 15000));

      if (this.qbot.latestMessageId === messageId) {
        await this.reply(senderId, message, messageId, 0);
      }
    }
  };

  onPoke = async (data: PokeNotice, messageId: string, message: string, fromUserId: string, toUserId: string) => {
    // 如果是戳猫猫的话，则立即回复，
    if (toUserId === this.qbot.account) {
      await this.reply(fromUserId, message, messageId, 1);
    }
    // 如果是戳别人的话，在 15s 内没有其他消息的话才回复
    else {
      await new Promise(resolve => setTimeout(resolve, 15000));

      if (this.qbot.latestMessageId === messageId) {
        await this.reply(fromUserId, message, messageId, 1);
      }
    }
  };

  /**
   * 通过群消息或戳一戳触发的 llm 回复操作
   * 同一时间是会进行一个 reply 操作，其余的消息先暂存在 replyQueue 中等待后续处理
   */
  async reply(userId: string, message: string, messageId: string, priority: number) {
    const { qbot } = this;

    // 如果当前正在 reply 的话，则先把消息加入队列，等待后续处理
    if (this.isReplying) {
      this.queueMessage(userId, message, messageId, priority);
      console.log(`✅ NekoAssist 加入队列 ${userId} ${messageId} ${priority} ${message}`);
      return;
    }

    // 没有其他 reply() 函数在执行的话就直接开始回复当前消息
    try {
      // 先设置 isReplying 为 true，防止并发调用
      this.isReplying = true;
      this.replyingUserId = userId;

      // 检查是否已经回复过此消息，id 为 0 表示为系统消息，重复是正常的
      if (this.lastReplyMessageId === messageId) {
        console.log(`⚠️ NekoAssist 跳过重复消息 ${messageId} ${message}`);
        return;
      }

      // 记录本次回复的消息 ID
      this.lastReplyMessageId = messageId;

      const messageList: AIMessageItem[] = [
        // 如果是定时任务等系统消息，则不添加历史消息记录
        { role: 'system', content: await this.generateSystemPrompt(!messageId.startsWith('corn:')) },
        { role: 'user', content: `[系统提示] 请猫猫回复 id 为 ${messageId} 的消息：${message}` },
      ];

      // 开始 agent 循环，在遇到 silent 和 memory 指令前持续对话
      let continueLoop = true;

      while (continueLoop) {
        let json: any;
        let llmRes = '';

        // 调用 ai 接口，如果 json 解析失败了，则重试一次，再失败则报错
        for (let i = 0; i < 2; ++i) {
          const [success, res] = await this.aiClient.chat(messageList);

          if (!success) {
            await qbot.sendGroupMessage(`接口请求失败了喵\n${res}`);
            return;
          }

          // 将回复解析为 JSON 数据
          try {
            llmRes = jsonrepair(res);
            json = JSON.parse(llmRes);
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

        // llm 可能以数组形式一次返回多条 action，我们适配下统一以数组形式处理
        for (const currentAction of ensureArray(json)) {
          // 如果 action 为 silent，则不进行任何操作
          if (currentAction.action === 'silent') {
            continueLoop = false;
          }

          messageList.push({ role: 'assistant', content: llmRes });

          // 为 reply 时生成回复消息
          if (currentAction.action === 'reply') {
            let reply = currentAction.reply || '';

            // 过滤掉 at 提问者的内容，at 其他人的内容保留
            reply = reply.replace(`[CQ:at,qq=${userId}]`, '');

            // 过滤掉 emoji 字符
            // reply = reply.replace(/\p{Emoji}/gu, '');

            // 如果当前最新消息不是提问消息，则添加 reply
            if (qbot.latestMessageId !== messageId) {
              reply = `[CQ:reply,id=${messageId}] ${reply}`;
            }

            // 避免发送空消息
            if ((reply = reply.trim())) {
              await qbot.sendGroupMessage(reply);
            } else continue;

            messageList.push(
              { role: 'user', content: '[系统消息] 等待猫猫的下一步操作' } // 确保接口拿到的对话记录满足 assistant > user > assistant 顺序
            );
          }
          // 为 command 时，执行系统指令
          else if (currentAction.action === 'command') {
            const commands = ensureArray(currentAction.command);
            const { background = false } = currentAction;
            let msg = '[系统消息]\n\n';

            // 理论上不应出现数组为空的情况
            if (!commands.length) continue;

            for (const item of commands) {
              const [success, result] = await qbot.command.invoke(item, userId, background);

              msg += `指令 ${item} 的执行结果：\n${result}\n\n`;
            }

            messageList.push({ role: 'user', content: '[系统消息] 指令执行完毕\n\n' + msg });
          }
          // 整理长期记忆
          else if (currentAction.action === 'memory') {
            for (const item of currentAction.delete || []) {
              delete this.memory[item];
            }

            for (let [key, value] of currentAction.create || []) {
              // ai 可能自己加上日期头，我们删除它仅保留系统生成的
              value = value.replace(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]\s/, '');
              this.memory[key] = `[${dayjs().format('YYYY-MM-DD HH:mm')}] ${value}`;
            }

            this.saveMemory();
            continueLoop = false; // 整理长期记忆后，结束循环
          }
        }
      }
    } catch (e) {
      console.log('❌ in NekoAssist.reply():', e);
      await qbot.sendGroupMessage(`程序出错了喵\n${e.toString()}`);
    } finally {
      // 故意降低机器人的回复频率
      // await new Promise(resolve => setTimeout(resolve, 1500));

      // 无论是否出错，都要重置状态
      this.isReplying = false;
      this.replyingUserId = '';
    }

    // 处理队列中的下一条消息
    const queue = this.replyQueue;
    const recentHistory = await qbot.getRecentHistory(0, 10);

    // 清理消息队列中过旧的消息（不在最近10条内的）
    while (queue.length > 0 && !recentHistory.some(x => x.message_id === queue[0].messageId)) {
      queue.shift();
    }

    if (queue.length > 0) {
      const item = queue.shift()!;
      // 直接调用 reply 处理下一条消息
      this.reply(item.userId, item.message, item.messageId, item.priority);
    }
  }

  /** 生成系统提示词 */
  async generateSystemPrompt(need_history = true) {
    const { qbot } = this;
    const currentTime = dayjs().format('YYYY-MM-DD HH:mm');

    const recentHistory = need_history
      ? (await qbot.getRecentHistory(0, 15))
          .map(item => {
            return `${item.message_id} ${dayjs(item.timestamp * 1000).format('YYYY-MM-DD HH:mm')} ${item.sender} ${item.raw_message}`;
          })
          .join('\n')
      : '';

    const commandsDescription = Array.from(qbot.command.metaMap.values())
      .map(cmd => cmd.description)
      .join('\n');

    const memory = Object.entries(this.memory)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    return this.systemPrompts
      .replace('<%= ACCOUNT %>', qbot.account)
      .replace('<%= COMMANDS %>', commandsDescription)
      .replace('<%= MEMORY %>', memory)
      .replace('<%= HISTORY %>', recentHistory)
      .replace('<%= CURRENT_TIME %>', currentTime);
  }

  /** 向 this.replyQueue 中添加一条新消息 */
  queueMessage(userId: string, message: string, messageId: string, priority: number) {
    // 不处理当前正在回复用户的新消息
    if (userId === this.replyingUserId) return;

    const queue = this.replyQueue;

    // 如果当前队列中存在此用户的优先级更高的消息，则忽略当前消息
    if (queue.some(item => (item.userId === userId && item.priority > priority) || item.messageId === messageId)) {
      return;
    }

    // 删除队列中相同 id 的其他消息
    for (let i = queue.length - 1; i >= 0; --i) {
      if (queue[i].userId === userId) {
        queue.splice(i, 1);
      }
    }

    // 找到第一个优先级小于当前消息的位置，插入消息记录
    let insertIndex = queue.length;

    for (let i = 0; i < queue.length; ++i) {
      if (queue[i].priority < priority) {
        insertIndex = i;
        break;
      }
    }
    queue.splice(insertIndex, 0, { userId, message, messageId, priority });

    this.replyQueue = queue.filter(x => !!x); // 过滤掉可能的空数据
    console.log('✅ 消息队列已更新');
    console.dir(queue, { depth: null });
  }
}
