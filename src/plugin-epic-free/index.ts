import { client } from '../utils/http-client.ts';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

interface EpicFreeGame {
  id: string;
  title: string;
  cover: string;
  original_price: number;
  original_price_desc: string;
  description: string;
  seller: string;
  is_free_now: boolean;
  free_start: string;
  free_start_at: number;
  free_end: string;
  free_end_at: number;
  link: string;
}

interface EpicFreeResponse {
  message: string;
  data: EpicFreeGame[];
}

export class EpicFree implements QBotPlugin {
  name = 'epic-free';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: 'epic-free',
      alias: ['喜加一'],
      description: '/epic-free 查询当前 Epic 免费游戏，该指令没有参数',
      handler: this.sendEpicFreeGames,
    });
  };

  sendEpicFreeGames = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;
    const [data, error] = await client.get<EpicFreeResponse>('https://uapis.cn/api/v1/game/epic-free');

    if (error) {
      const text = '❌ EpicFree 接口请求失败了喵\n' + error?.message || '未知错误';
      console.log(error);
      throw new Error(text);
    }

    let message = `🎮 ${data.message}\n\n`;

    for (const game of data.data) {
      const coverUrl = game.cover.trim().replace(/`/g, '');
      message += `📦 ${game.title}\n`;
      message += `💰 原价: ${game.original_price_desc}\n`;
      message += `⏰ 截止: ${game.free_end}\n`;
      message += `📝 介绍: ${game.description.substring(0, 100)}${game.description.length > 100 ? '...' : ''}\n`;
      message += `[CQ:image,file=${coverUrl}]\n\n`;
    }

    message = message.trim();
    !silent && (await this.qbot.sendGroupMessage(message));
    console.log('✅ EpicFree 发送免费游戏信息成功');
    console.log(data);

    return message;
  };
}
