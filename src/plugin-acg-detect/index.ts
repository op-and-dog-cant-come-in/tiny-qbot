import { client } from '../utils/index.ts';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

interface SauceNAOResult {
  header: {
    similarity: string;
    thumbnail: string;
    index_id: number;
    index_name: string;
    dupes: number;
    hidden: number;
  };
  data: any;
}

interface SauceNAOResponse {
  header: {
    status: number;
    results_returned: number;
  };
  results: SauceNAOResult[];
}

export class ACGDetect implements QBotPlugin {
  name = 'acg-detect';
  qbot: QBot;
  apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: 'acg-detect',
      description: '/acg-detect <图片> 使用SauceNAO识别二次元角色，图片为 CQ 命令格式',
      handler: this.detectACG,
    });
  };

  extractImageUrl(message: string = ''): string | null {
    const cqPattern = /\[CQ:image.*?url=([^,\]]+)/;
    const match = message.match(cqPattern);

    if (match && match[1]) {
      let url = match[1];
      url = url.replace(/&amp;/g, '&');
      return url;
    }

    return null;
  }

  detectACG = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;
    let imageUrl = this.extractImageUrl(params.params);

    if (!imageUrl) {
      const [prev1, prev2] = (await this.qbot.getRecentHistory(0, 5)).filter(
        item => item.sender === params.sender
      );

      imageUrl = this.extractImageUrl(prev1?.raw_message || '') || this.extractImageUrl(prev2?.raw_message || '');

      if (!imageUrl) {
        const text = '没有找到图片喵，请发送带图片的消息';
        console.log('❌ ACGDetect 未找到图片URL');
        !silent && (await this.qbot.sendGroupMessage(text));
        return text;
      }
    }

    const apiUrl = `https://saucenao.com/search.php?api_key=${this.apiKey}&db=999&output_type=2&numres=20&url=${encodeURIComponent(imageUrl)}`;

    const [data, error] = await client.get<SauceNAOResponse>(apiUrl);

    if (error) {
      const text = '识别失败了喵\n' + error?.message || '未知错误';
      console.log('❌ ACGDetect 识别失败');
      console.log(error);
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    if (!data.results || data.results.length === 0) {
      const text = '未找到匹配的二次元角色喵';
      console.log('⚠️ ACGDetect 未找到匹配结果');
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    let report: string[] = ['🎭 二次元角色识别结果：\n'];

    for (const item of data.results) {
      const { material, characters, jp_name, eng_name } = item.data;

      if (!material && !characters && !jp_name && !eng_name) continue;

      report.push(`相似度：${item.header.similarity}%`);
      report.push(`${material || ''} ${characters || ''} ${jp_name || eng_name || ''}`);
      report.push(`[CQ:image,file=${item.header.thumbnail}]\n`);
      report.push(item.data.ext_urls?.join('\n') || '');
    }

    // report += `共找到 ${data.results.length} 个匹配结果`;

    const result = report.join('\n');

    if (!silent) {
      const msgId = await this.qbot.sendGroupMessage(result);
      setTimeout(() => this.qbot.naplink.deleteMessage(msgId), 1000 * 60);
    }

    console.log('✅ ACGDetect 识别成功');
    // console.dir(data, { depth: null });

    return result;
  };
}
