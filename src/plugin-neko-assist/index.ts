import { type GroupMessageEvent, type PokeNotice } from '@naplink/naplink';
import fs from 'fs-extra';
import { jsonrepair } from 'jsonrepair';
import dayjs from 'dayjs';
import { type AIClient, type AIMessageItem } from '../ai-client/ai-client.ts';
import { type QBotPlugin, type QBot } from '../qbot/index.ts';
import { debounce, ensureArray, ensureStringId, tryReadJson, tryRun } from '../utils/index.ts';
import toolsData from './tools.ts';

export interface NekoAssistInitOptions {
  llm: AIClient;
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
    this.aiClient = options.llm;
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
      description: '/current-model 查看猫猫当前使用的ai模型',
      handler: async params => {
        const model = this.aiClient.currentModel;
        !params.silent && (await qbot.sendGroupMessage(`猫猫当前使用的ai模型为 ${model}`));
        return model;
      },
    });

    qbot.command.register({
      name: 'memory',
      alias: ['长期记忆'],
      description: '/memory 查看猫猫的长期记忆',
      handler: async params => {
        const memory = JSON.stringify(this.memory, null, 2);
        !params.silent && (await qbot.sendGroupMessage(`猫猫的长期记忆为 ${memory}`));
        return memory;
      },
    });

    qbot.command.register({
      name: 'memory-update',
      alias: ['更新长期记忆'],
      description: '/memory-update <名称> <内容> 更新猫猫的长期记忆，会覆盖已有的同名记忆',
      handler: async params => {
        const { params: args = '', silent } = params;
        const [name, content] = args.replace(/\s/, '\u200B').split('\u200B');

        if (!name || !content) {
          const errorMsg = '参数格式错误，请使用：/memory-update <名称> <内容>';
          !silent && (await qbot.sendGroupMessage(errorMsg));
          return errorMsg;
        }

        this.memory[name] = content;
        await this.saveMemory();
        const result = `已更新长期记忆 ${name}`;
        !silent && (await qbot.sendGroupMessage(result));
        return result;
      },
    });

    qbot.command.register({
      name: 'memory-delete',
      alias: ['删除长期记忆'],
      description: '/memory-delete <名称> 删除猫猫的长期记忆',
      handler: async params => {
        const { params: args = '', silent } = params;
        const [name] = args.replace(/\s/, '\u200B').split('\u200B');

        if (!name) {
          const errorMsg = '参数格式错误，请使用：/memory-delete <名称>';
          !silent && (await qbot.sendGroupMessage(errorMsg));
          return errorMsg;
        }

        delete this.memory[name];
        await this.saveMemory();
        const result = `已删除长期记忆 ${name}`;
        !silent && (await qbot.sendGroupMessage(result));
        return result;
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

    // 机器人自己发送的消息
    if (senderId === this.qbot.account) {
      // id 以 corn: 开头表示为定时任务，这是唯一需要处理的自己发送的消息
      if (messageId.startsWith('corn:')) {
        await this.reply(senderId, message, messageId, 100);
      }
      // 其他自己发送的消息直接忽略
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
   * 由于很多免费 api 接口仅限制并发数1，所以我们同一时间只进行一个 reply 操作，其余的消息先暂存在 replyQueue 中等待后续处理
   */
  async reply(userId: string, message: string, messageId: string, priority: number) {
    const { qbot } = this;

    // 如果当前正在 reply 的话，则先把消息加入队列，等待后续处理
    if (this.isReplying) {
      this.queueMessage(userId, message, messageId, priority);
      console.log(`✅ NekoAssist 加入队列 ${userId} ${messageId} ${priority} ${message}`);
      return;
    }

    // 没有其他 reply() 函数在执行的话开始回复当前消息
    try {
      this.isReplying = true;
      this.replyingUserId = userId;

      // 检查是否已经回复过此消息，理论上不应出现此情况，只是做个保险
      if (this.lastReplyMessageId === messageId) {
        console.log(`⚠️ NekoAssist 跳过重复消息 ${messageId} ${message}`);
        return;
      }

      // 记录本次回复的消息 ID
      this.lastReplyMessageId = messageId;

      const messageList: AIMessageItem[] = [
        // 如果是定时任务等系统消息，则不添加历史消息记录
        { role: 'system', content: await this.generateSystemPrompt(messageId) },
        {
          role: 'user',
          content: `请猫猫回复 id 为 ${messageId} 的消息：\n${message}`,
        },
      ];

      // 开始 agent 循环
      let continueLoop = true;

      while (continueLoop) {
        const [success, message] = await this.aiClient.chat(messageList, toolsData);

        if (!success) {
          await qbot.sendGroupMessage(`接口请求失败了喵\n${message}`);
          return;
        }

        const tools = message.tool_calls || [];

        // 如果存在 keep_silent 命令的话，则忽略其他工具与文本回复，直接结束对话
        if (tools.some(item => item.function.name === 'keep_silent')) {
          break;
        }

        messageList.push({
          role: 'assistant',
          content: message.content,
          tool_calls: message.tool_calls,
        });

        /** 模型的文本回复 */
        let text = message.content;

        // 移除 @ 消息发送者的内容，该内容不必要
        text = text.replace(`[CQ:at,qq=${userId}]`, '');

        // 如果不是当前最新消息，则需引用当前消息
        if (qbot.latestMessageId && qbot.latestMessageId !== messageId && !messageId.includes(':')) {
          text = `[CQ:reply,id=${messageId}] ${text}`;
        }

        text = text.trim();

        // 先发送消息，然后执行工具命令
        if (text) {
          await qbot.sendGroupMessage(text);
        }

        for (const [index, item] of (message.tool_calls || []).entries()) {
          const { name, arguments: args } = item.function;

          // 如果是 finished_chatting 的话，指令完当前命令并回复消息后再跳出循环
          if (name === 'finish_chatting') {
            continueLoop = false;
          }
          // 执行指令
          else if (name === 'command' || name === 'command_background') {
            const [error, json] = tryRun<any>(() => JSON.parse(jsonrepair(args)));

            if (error) {
              messageList.push({
                role: 'tool',
                tool_call_id: item.id,
                content: `指令${index}参数解析失败\n${error}\n`,
              });

              continue;
            }

            const { command } = json;
            const [success, commandResult] = await qbot.command.invoke(command, userId, name === 'command_background');

            if (!success) {
              messageList.push({
                role: 'tool',
                tool_call_id: item.id,
                content: `${command} 执行失败\n${commandResult}\n`,
              });
              continue;
            }

            messageList.push({
              role: 'tool',
              tool_call_id: item.id,
              content: `${command} 执行成功:\n${commandResult}\n`,
            });
          }
          // 更新记忆
          else if (name === 'memory_update') {
            const [error, json] = tryRun<any>(() => JSON.parse(jsonrepair(args)));

            if (error) {
              messageList.push({
                role: 'tool',
                tool_call_id: item.id,
                content: `指令${index}参数解析失败\n${error}\n`,
              });
              continue;
            }

            this.memory[json.name] = json.value;
            messageList.push({
              role: 'tool',
              tool_call_id: item.id,
              content: `已更新记忆: ${json.name}\n`,
            });
            this.saveMemory();
          }
          // 删除记忆
          else if (name === 'memory_delete') {
            const [error, json] = tryRun<any>(() => JSON.parse(jsonrepair(args)));

            if (error) {
              messageList.push({
                role: 'tool',
                tool_call_id: item.id,
                content: `指令${index}参数解析失败\n${error}\n`,
              });
              continue;
            }

            delete this.memory[json.name];
            messageList.push({
              role: 'tool',
              tool_call_id: item.id,
              content: `已删除记忆: ${json.name}\n`,
            });
            this.saveMemory();
          }
        }

        // 如果猫猫的回复没有执行任何 command 的话，也认为对话结束，
        // 避免出现猫猫忘记调用 finish_chatting 工具的情况
        if (!tools.some(item => item.function.name === 'command' || item.function.name === 'command_background')) {
          continueLoop = false;
        }
      }
    } catch (e) {
      console.log('❌ in NekoAssist.reply():');
      console.dir(e, { depth: null });
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
  async generateSystemPrompt(messageId: string) {
    const { qbot } = this;
    const currentTime = dayjs().format('YYYY-MM-DD HH:mm');

    /** 如果当前消息是自动触发的定时任务的话，则无需近期对话记录 */
    const need_history = !messageId.startsWith('corn:');

    /** 近期的消息历史 */
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

    const [memeListSuccess, memeList] = await qbot.command.invoke('meme-list', qbot.account, true);

    return this.systemPrompts
      .replace('<%= ACCOUNT %>', qbot.account)
      .replace('<%= COMMANDS %>', commandsDescription)
      .replace('<%= MEMORY %>', memory)
      .replace('<%= CURRENT_TIME %>', currentTime)
      .replace('<%= RECENT_HISTORY %>', recentHistory)
      .replace('<%= MEME_LIST %>', memeListSuccess ? memeList : '无');
  }

  /** 向 this.replyQueue 中添加一条新消息 */
  queueMessage(userId: string, message: string, messageId: string, priority: number) {
    const queue = this.replyQueue;

    // 如果当前队列中存在此用户的优先级更高的消息，则忽略当前消息
    // if (queue.some(item => (item.userId === userId && item.priority > priority) || item.messageId === messageId)) {
    //   return;
    // }

    // 删除队列中相同 id 的其他消息
    // for (let i = queue.length - 1; i >= 0; --i) {
    //   if (queue[i].userId === userId) {
    //     queue.splice(i, 1);
    //   }
    // }

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
