import { client } from '../utils/http-client.ts';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

interface HotboardItem {
  extra: Record<string, unknown>;
  hot_value: string;
  index: number;
  title: string;
  url: string;
  cover?: string;
}

interface HotboardResponse {
  list: HotboardItem[];
  type: string;
  update_time: string;
  snapshot_time?: number;
  keyword?: string;
  count?: number;
  results?: Array<{
    title: string;
    hot_value: string;
    url: string;
  }>;
  sources?: string[];
}

const SOURCE_MAP: Record<string, string> = {
  bilibili: '哔哩哔哩弹幕网',
  weibo: '新浪微博热搜',
  zhihu: '知乎热榜',
  douyin: '抖音热榜',
  tieba: '百度贴吧热帖',
  hupu: '虎扑热帖',
  ngabbs: 'NGA游戏论坛热帖',
  thepaper: '澎湃新闻热榜',
  toutiao: '今日头条热榜',
  lol: '英雄联盟热帖',
  genshin: '原神热帖',
  honkai: '崩坏3热帖',
  starrail: '星穹铁道热榜',
  'netease-music': '网易云音乐热歌榜',
  'qq-music': 'QQ音乐热歌榜',
  weatheralarm: '天气预警信息',
  earthquake: '地震速报',
  history: '历史上的今天',
};

export class Hotboard implements QBotPlugin {
  name = 'hotboard';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: 'hotboard',
      alias: ['热榜'],
      description:
        '/热榜 <来源> 查询各平台热榜，来源可选：bilibili, weibo, zhihu, douyin, tieba, hupu, ngabbs, thepaper, toutiao, lol, genshin, honkai, starrail, netease-music, qq-music, weatheralarm, earthquake, history',
      handler: this.sendHotboard,
    });
  };

  sendHotboard = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;
    const source = params.params || 'zhihu';

    if (!SOURCE_MAP[source]) {
      const availableSources = Object.keys(SOURCE_MAP).join(', ');
      const text = `❌ 不支持的来源喵\n\n可用来源：${availableSources}`;
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const [data, error] = await client.get<HotboardResponse>(
      `https://uapis.cn/api/v1/misc/hotboard?type=${source}&limit=10`
    );

    if (error) {
      const text = '热榜接口请求失败了喵\n' + (error?.message || '未知错误');
      !silent && (await this.qbot.sendGroupMessage(text));
      console.log('❌ Hotboard 获取热榜失败');
      console.log(error);
      return text;
    }

    const sourceName = SOURCE_MAP[source];
    let message = `🔥 ${sourceName}\n`;
    message += `📅 更新时间: ${data.update_time}\n\n`;

    for (const item of data.list) {
      message += `${item.index}. ${item.title}\n`;

      if (item.hot_value) {
        message += `   🔥 热度: ${item.hot_value}\n`;
      }

      if (item.cover) {
        const coverUrl = item.cover.trim().replace(/`/g, '');
        message += `   [CQ:image,file=${coverUrl}]\n`;
      }

      message += '\n';
    }

    message = message.trim();
    !silent && (await this.qbot.sendGroupMessage(message));
    console.log(`✅ Hotboard 发送${sourceName}成功`);
    console.log(data);

    return message;
  };
}
