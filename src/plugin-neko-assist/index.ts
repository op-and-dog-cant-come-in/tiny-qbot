import { type GroupMessageEvent } from '@naplink/naplink';
import fs from 'fs-extra';
import { jsonrepair } from 'jsonrepair';
import dayjs from 'dayjs';
import schedule from 'node-schedule';
import { type AIClient, type AIMessageItem } from '../ai-client.ts';
import { type QBotPlugin, type QBot } from '../qbot/index.ts';
import { debounce, tryReadJson } from '../utils/index.ts';
import { VolcesArk } from './volces-ark.ts';
import { ModelScope } from './model-scope.ts';
import { SystemMessage } from '../qbot/system-message.ts';

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

  /** 保存定时任务信息 */
  cornTasks: Record<string, { type: 'at' | 'corn'; time: string; desc: string }> = {};
  saveCornTasks = debounce(async () => {
    await fs.writeJson('corn.json', this.cornTasks, { spaces: 2 });
    console.log('✅ NekoAssist 定时任务保存成功');
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
    [this.systemPrompts, this.memory, this.cornTasks] = await Promise.all([
      fs.readFile('system-prompts.md', 'utf-8'),
      tryReadJson('memory.json', {}),
      tryReadJson('corn.json', {}),
    ]);

    // 创建定时任务，注意过滤掉已经过期的任务
    for (const [key, value] of Object.entries(this.cornTasks)) {
      if (value.type === 'at' && dayjs().isAfter(dayjs(value.time, 'YYYY-MM-DD HH:mm'))) {
        continue;
      }

      this.createCornTask(key, value.type, value.time, value.desc);
    }
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
    // 其他消息优先级最低，且保持 5s 后仍是最新消息时再处理
    else if (data.message.some(item => item.type === 'text' && item.data.text.trim())) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      if (this.qbot.latestMessageId === messageId) {
        await this.reply(data.user_id, message, messageId, 0);
      }
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

      const messageList: AIMessageItem[] = [{ role: 'user', content: message }];

      let continueLoop = true;

      // 开始 agent 循环，在 llm 返回的 continue 字段为 true 时循环调用对话接口
      while (continueLoop) {
        let json: any;
        let llmRes = '';

        // 如果是定时任务等系统消息（id 为 0），则不添加历史消息记录
        const systemPrompts = await this.generateSystemPrompt(Number(messageId) !== 0);
        const list: AIMessageItem[] = [{ role: 'system', content: systemPrompts }, ...messageList];

        console.log('*️⃣ NekoAssit 提示词生成完毕');
        console.log(list);

        // 调用 ai 接口，如果 json 解析失败了，则重试一次，再失败则报错
        for (let i = 0; i < 2; ++i) {
          const [success, res] = await this.aiClient.chat(list);

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

        // 如果 action 为 silent，则不进行任何操作
        // 为 reply 时生成回复消息
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
                this.memory[key] = `[${dayjs().format('YYYY-MM-DD HH:mm')}] ${value}`;
              }
            }

            if (Array.isArray(delKeys)) {
              for (const key of delKeys) {
                delete this.memory[key];
              }
            }

            this.saveMemory();
          }

          // 检查是否需要删除定时任务
          if (json.deleteCorn) {
            for (const item of json.deleteCorn) {
              this.removeCornTask(item);
            }
          }

          // 检查是否需要添加定时任务
          if (json.corn) {
            const corn = json.corn;
            this.createCornTask(corn.name, corn.type, corn.time, corn.desc);
          }

          // 过滤掉 emoji 字符
          reply = reply.replace(/\p{Emoji}/gu, '');

          // 如果当前最新消息不是提问消息，则添加 reply
          if (qbot.latestMessageId !== messageId) {
            reply = `[CQ:reply,id=${messageId}] ${reply}`;
          }

          reply = reply.trim();

          if (reply) {
            await qbot.sendGroupMessage(reply);
          }

          messageList.push({ role: 'assistant', content: llmRes });

          // 检查是否需要执行指令，创建定时任务时不执行
          if (!json.corn && json.command) {
            for (const item of Array.isArray(json.command) ? json.command : [json.command]) {
              await qbot.command.invoke(item, userId);
            }
          }
        }
        // 为 command-background 时，执行后台指令
        else if (json.action === 'command-background') {
          let commandRes = '[系统操作]\n\n';

          for (const item of Array.isArray(json.command) ? json.command : [json.command]) {
            commandRes += `指令 ${item} 的执行结果：\n${await qbot.command.invokeForLLM(item, userId)}\n\n`;
          }

          messageList.push({ role: 'user', content: commandRes });
        }

        continueLoop = json.continue || json.action === 'command-background';
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

  /** 生成系统提示词 */
  async generateSystemPrompt(need_history = true) {
    const { qbot } = this;
    const currentTime = dayjs().format('YYYY-MM-DD HH:mm');

    const recentHistory = need_history
      ? (await qbot.getRecentHistory(15))
          .map(item => {
            return `${item.message_id} ${dayjs(item.timestamp * 1000).format('YYYY-MM-DD HH:mm')} ${item.sender} ${item.raw_message}`;
          })
          .join('\n')
      : '';

    const commandsDescription = Array.from(qbot.command.metaMap.values())
      .map(cmd => cmd.description)
      .join('\n');

    return this.systemPrompts
      .replace('<%= ACCOUNT %>', qbot.account)
      .replace('<%= COMMANDS %>', commandsDescription)
      .replace('<%= MEMORY %>', JSON.stringify(this.memory))
      .replace('<%= HISTORY %>', recentHistory)
      .replace('<%= CORN_TASKS %>', this.getCornTasksPrompts())
      .replace('<%= CURRENT_TIME %>', currentTime);
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

  /** 创建单个定时任务 */
  createCornTask(name: string, type: 'at' | 'corn', time: string, desc: string) {
    const cornTasks = this.cornTasks;

    // 存在重名任务时，先销毁旧任务
    this.removeCornTask(name);

    const spec = type === 'at' ? dayjs(time, 'YYYY-MM-DD HH:mm').valueOf() : time;
    const { qbot } = this;
    const job = schedule.scheduleJob(name, spec, () => {
      console.log('🚀 定时任务已触发', name, type, time, desc);
      qbot.invokeGroupMessage(
        new SystemMessage({
          group_id: qbot.targetGroup,
          account: qbot.account,
          rawMessage: `[CQ:at,qq=${this.qbot.account}] [定时任务触发 ${name}] ${desc}`,
        })
      );

      // 一次性的任务要在执行后删除
      if (type === 'at') {
        this.removeCornTask(name);
      }
    });

    cornTasks[name] = { type, time, desc };
    this.saveCornTasks();
    qbot.sendGroupMessage(`定时任务已创建：${type} ${time}\n${desc}`);
    console.log('✅ 定时任务已创建：', name, type, time, desc);
  }

  /** 移除单个定时任务 */
  removeCornTask(name: string) {
    const cornTasks = this.cornTasks;

    if (cornTasks[name]) {
      schedule.cancelJob(name);
      delete cornTasks[name];
      this.saveCornTasks();
      console.log('✅ 定时任务已删除：', name);
    }
  }

  /** 获取描述现有定时任务的提示词 */
  getCornTasksPrompts() {
    let prompts: string[] = [];

    for (const [key, value] of Object.entries(this.cornTasks)) {
      prompts.push(`${key}[${value.type} ${value.time}]: ${value.desc}`);
    }

    return prompts.join('\n') || '暂无定时任务';
  }
}
