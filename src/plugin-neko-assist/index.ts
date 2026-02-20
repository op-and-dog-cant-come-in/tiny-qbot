import { type GroupMessageEvent } from '@naplink/naplink';
import fs from 'fs-extra';
import { jsonrepair } from 'jsonrepair';
import dayjs from 'dayjs';
import { type AIClient, type AIMessageItem } from '../ai-client.ts';
import { type QBotPlugin, type QBot, type QBotMessageInfo } from '../qbot.ts';
import { debounce, replaceAllAsync, tryReadJson } from '../utils/index.ts';
import { VolcesArk } from './volces-ark.ts';

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

  constructor(options: NekoAssistInitOptions) {
    this.aiClient = new VolcesArk(options.apiKey);
  }

  install = async (qbot: QBot) => {
    this.qbot = qbot;
    [this.systemPrompts, this.memory] = await Promise.all([
      fs.readFile('system-prompts.md', 'utf-8'),
      tryReadJson('memory.json', {}),
    ]);
  };

  onGroupMessage = async (data: GroupMessageEvent, info: QBotMessageInfo) => {
    // TODO: 匹配一些调试指令

    // 在消息 @ 了当前账号时进行 llm 回复，at 操作可以在消息任意位置
    // 如果包含若干猫猫感兴趣的关键词，也会触发 llm 回复
    const message = info.resolvedRawMessage;

    if (data.raw_message.includes(`[CQ:at,qq=${this.qbot.account}]`) || message.includes('猫')) {
      await this.reply(data.group_id, data.user_id, info.resolvedRawMessage);
    }
  };

  onPoke = async (data: GroupMessageEvent) => {
    await this.reply(data.group_id, data.user_id, `${data.user_id} 戳了戳了猫猫`);
  };

  /** 通过群消息或戳一戳触发的 llm 回复操作 */
  async reply(groupId: number | string, userId: number | string, message: string) {
    const { qbot } = this;
    const { naplink } = qbot;
    const currentTime = dayjs().format('YYYY-MM-DD HH:mm');

    // 拼接提示词
    const messageList: AIMessageItem[] = [
      {
        role: 'system',
        content: this.systemPrompts
          .replace('<%= ACCOUNT %>', qbot.account)
          .replace('<%= MEMORY %>', JSON.stringify(this.memory))
          .replace('<%= HISTORY %>', qbot.history.slice(-15).join('\n'))
          .replace('<%= CURRENT_TIME %>', currentTime),
      },
      { role: 'user', content: message },
    ];

    console.log('*️⃣ NekoAssit 提示词生成完毕\n', messageList);

    // 调用 ai 接口
    const [success, res] = await this.aiClient.chat(messageList);

    if (!success) {
      await naplink.sendGroupMessage(groupId, `接口请求失败了喵\n${res}`);
      return;
    }

    try {
      // 将回复解析为 JSON 数据
      const json = JSON.parse(jsonrepair(res));

      console.log('✅ NekoAssist chat 接口 JSON 指令解析完毕\n', json);

      // 如果 action 为 silent，则不进行任何操作
      if (json.action === 'silent') {
        return;
      }

      if (json.action === 'reply') {
        const { memory, at } = json;
        let reply = json.reply;

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
        }

        // 过滤掉 emoji 字符
        reply = reply.replace(/\p{Emoji}/gu, '');

        // napcat 不会捕获自己发送的消息事件，发送消息后要把自己的消息添加到 history 中
        await naplink.sendGroupMessage(groupId, reply);
        qbot.history.push(`${currentTime} ${qbot.account}: ${reply}`);
        qbot.saveHistory();
      }
    } catch (e) {
      await naplink.sendGroupMessage(groupId, `解析回复为 JSON 数据失败了喵\n${e}`);
    }
  }
}
