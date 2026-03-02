import { client } from '../utils/http-client.ts';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

interface BaiduSearchMessage {
  content: string;
  role: string;
}

interface BaiduSearchRequest {
  messages: BaiduSearchMessage[];
  stream: boolean;
}

interface BaiduSearchReference {
  id: number;
  url: string;
  title: string;
  date: string;
  content: string;
  icon: string;
  web_anchor: string;
  type: string;
  website: string;
  video: null;
  image: null;
  is_aladdin: boolean;
  aladdin: null;
  snippet: string;
  web_extensions?: {
    images?: { url: string; height: string; width: string }[];
  };
  rerank_score: number;
  authority_score: number;
  markdown_text: string;
}

interface BaiduSearchResponse {
  request_id: string;
  references: BaiduSearchReference[];
}

export class BaiduWebSearch implements QBotPlugin {
  name = 'baidu-web-search';
  qbot: QBot;
  apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: 'web-search',
      alias: ['搜索', '百度搜索'],
      description: '/web-search <关键词> 使用百度搜索查询网络内容',
      handler: this.sendSearchResult,
    });
  };

  sendSearchResult = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;
    let query = params.params.trim();

    if (!query) {
      const text = '❌ 请提供搜索关键词，例如: /web-search 今日新闻';
      throw new Error(text);
    }

    const [data, error] = await client.post<BaiduSearchRequest, BaiduSearchResponse>(
      'https://qianfan.baidubce.com/v2/ai_search/chat/completions',
      {
        messages: [{ content: query, role: 'user' }],
        stream: false,
      },
      {
        headers: {
          Host: 'qianfan.baidubce.com',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    if (error) {
      const text = '❌ 百度搜索请求失败了喵\n' + (error?.message || '未知错误');
      console.log(error);
      throw new Error(text);
    }

    const references = data.references || [];

    if (references.length === 0) {
      const text = `🔍 搜索结果: ${query}\n\n未找到相关结果`;
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    let message = `搜索结果: ${query}\n\n`;

    for (let i = 0; i < Math.min(references.length, 5); i++) {
      const ref = references[i];
      message += `📌 ${ref.title}\n`;
      message += `📅 ${ref.date}\n`;
      message += `📝 ${ref.snippet.substring(0, 800)}${ref.snippet.length > 800 ? '...' : ''}\n`;
      message += `🔗 ${ref.url}\n\n`;
    }

    message = message.trim();

    !silent && (await this.qbot.sendGroupMessage(message));
    console.log('✅ BaiduWebSearch 发送搜索结果成功');

    return message;
  };
}
