import { HttpClient } from '../utils/http-client.ts';
import { type QBotPlugin, type QBot } from '../qbot/index.ts';

interface EpicFreeGame {
  name: string;
  original_price: string;
  introduce: string;
  end_time: string;
}

interface EpicFreeResponse {
  code: number;
  msg: string;
  data: EpicFreeGame[];
  api_source: string;
}

const client = new HttpClient();

export class EpicFree implements QBotPlugin {
  name = 'epic-free';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: 'epic-free',
      alias: ['喜加一'],
      description: '/epic-free 查询当前 Epic 免费游戏，该指令没有参数',
      handler: () => this.sendEpicFreeGames(),
      handlerForLLM: () => this.getEpicFreeGamesForLLM(),
    });
  };

  async sendEpicFreeGames() {
    const [data, error] = await client.get<EpicFreeResponse>('/apis/free');

    if (error) {
      await this.qbot.sendGroupMessage('EpicFree 接口请求失败了喵\n' + error?.message || '未知错误');
      console.log('❌ EpicFree 获取免费游戏失败');
      console.log(error);
      return;
    }

    let message = `🎮 ${data.msg}\n\n`;

    for (const game of data.data) {
      message += `📦 ${game.name}\n`;
      message += `💰 原价: ${game.original_price}\n`;
      message += `⏰ 截止: ${game.end_time}\n`;
      message += `📝 介绍: ${game.introduce.substring(0, 100)}${game.introduce.length > 100 ? '...' : ''}\n\n`;
    }

    await this.qbot.sendGroupMessage(message.trim());
    console.log('✅ EpicFree 发送免费游戏信息成功');
    console.log(data);
  }

  async getEpicFreeGamesForLLM(): Promise<string> {
    const [data, error] = await client.get<EpicFreeResponse>('/apis/free');

    if (error) {
      console.log('❌ EpicFree 获取免费游戏失败');
      console.log(error);
      return 'EpicFree 接口请求失败了喵\n' + error?.message || '未知错误';
    }

    let message = `🎮 ${data.msg}\n\n`;

    for (const game of data.data) {
      message += `📦 ${game.name}\n`;
      message += `💰 原价: ${game.original_price}\n`;
      message += `⏰ 截止: ${game.end_time}\n`;
      message += `📝 介绍: ${game.introduce.substring(0, 100)}${game.introduce.length > 100 ? '...' : ''}\n\n`;
    }

    console.log('✅ EpicFree 发送免费游戏信息成功');
    console.log(data);

    return message.trim();
  }
}
