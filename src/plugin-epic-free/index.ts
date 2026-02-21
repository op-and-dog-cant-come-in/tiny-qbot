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

export class EpicFree implements QBotPlugin {
  name = 'epic-free';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: 'epic-free',
      alias: ['喜加一'],
      description: '/epic-free 查询当前 Epic 免费游戏，该指令没有参数',
      handler: () => this.sendEpicFreeGames(this.qbot.targetGroup),
    });
  };

  async sendEpicFreeGames(groupId: number | string) {
    const { naplink } = this.qbot;

    try {
      const res = await fetch('https://api.milorapart.top/apis/free');
      const data = (await res.json()) as EpicFreeResponse;

      if (!data || data.code !== 200 || !data.data || data.data.length === 0) {
        await naplink.sendGroupMessage(groupId, 'EpicFree 接口请求失败了喵\n' + JSON.stringify(data, null, 2));
        console.log('❌ EpicFree 获取免费游戏失败');
        console.log(res);
        console.log(data);
        return;
      }

      let message = `🎮 ${data.msg}\n\n`;

      for (const game of data.data) {
        message += `📦 ${game.name}\n`;
        message += `💰 原价: ${game.original_price}\n`;
        message += `⏰ 截止: ${game.end_time}\n`;
        message += `📝 介绍: ${game.introduce.substring(0, 100)}${game.introduce.length > 100 ? '...' : ''}\n\n`;
      }

      await naplink.sendGroupMessage(groupId, message.trim());
      console.log('✅ EpicFree 发送免费游戏信息成功');
      console.log(data);
    } catch (e) {
      await naplink.sendGroupMessage(groupId, 'EpicFree 发送免费游戏信息失败了喵\n' + e.message);
      console.log('❌ EpicFree 发送失败:');
      console.log(e);
    }
  }
}
