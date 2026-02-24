import { HttpClient } from '../utils/http-client.ts';
import { type QBotPlugin, type QBot } from '../qbot/index.ts';

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

const BAIDU_API_URL = 'https://qianfan.baidubce.com';

const client = new HttpClient({ baseUrl: BAIDU_API_URL });

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
      handler: (args: string) => this.sendSearchResult(args),
      handlerForLLM: (args: string) => this.getSearchResultForLLM(args),
    });
  };

  async sendSearchResult(query: string) {
    if (!query || query.trim() === '') {
      await this.qbot.sendGroupMessage('请提供搜索关键词，例如: /web-search 北京景点');
      return;
    }

    const [data, error] = await client.post<BaiduSearchRequest, BaiduSearchResponse>(
      '/v2/ai_search/chat/completions',
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
      await this.qbot.sendGroupMessage('百度搜索请求失败了喵\n' + (error?.message || '未知错误'));
      console.log('❌ BaiduWebSearch 搜索失败');
      console.log(error);
      return;
    }

    const references = data.references || [];

    if (references.length === 0) {
      await this.qbot.sendGroupMessage(`🔍 搜索结果: ${query}\n\n未找到相关结果`);
      return;
    }

    let message = `搜索结果: ${query}\n\n`;

    for (let i = 0; i < Math.min(references.length, 5); i++) {
      const ref = references[i];
      message += `📌 ${ref.title}\n`;
      message += `📅 ${ref.date}\n`;
      message += `📝 ${ref.snippet.substring(0, 800)}${ref.snippet.length > 800 ? '...' : ''}\n`;
      message += `🔗 ${ref.url}\n\n`;
    }

    await this.qbot.sendGroupMessage(message.trim());
    console.log('✅ BaiduWebSearch 发送搜索结果成功');
  }

  async getSearchResultForLLM(query: string): Promise<string> {
    if (!query || query.trim() === '') {
      return '请提供搜索关键词';
    }

    const [data, error] = await client.post<BaiduSearchRequest, BaiduSearchResponse>(
      '/v2/ai_search/chat/completions',
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
      console.log('❌ BaiduWebSearch 搜索失败');
      console.log(error);
      return '百度搜索请求失败了喵\n' + (error?.message || '未知错误');
    }

    const references = data.references || [];

    if (references.length === 0) {
      return `搜索结果: ${query}\n\n未找到相关结果`;
    }

    let message = `搜索结果: ${query}\n\n`;

    for (let i = 0; i < Math.min(references.length, 5); i++) {
      const ref = references[i];
      message += `📌 ${ref.title}\n`;
      message += `📅 ${ref.date}\n`;
      message += `📝 ${ref.snippet.substring(0, 800)}${ref.snippet.length > 800 ? '...' : ''}\n`;
      message += `🔗 ${ref.url}\n\n`;
    }

    console.log('✅ BaiduWebSearch 获取搜索结果成功');

    return message.trim();
  }
}
