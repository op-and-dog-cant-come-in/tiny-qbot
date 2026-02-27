import { client } from '../utils/index.ts';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

interface ImageRecognizeResponse {
  code: number;
  msg: string;
  result: string;
  api_source: string;
}

export class ImageRecognize implements QBotPlugin {
  name = 'image-recognize';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '识图',
      // alias: ['image', 'img'],
      description: '/识图 <图片> 使用AI识别图片内容，以文本形式描述',
      handler: this.recognizeImage,
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

  recognizeImage = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;
    let imageUrl = this.extractImageUrl(params.params);

    // 当前消息没有提供图片的话，尝试使用上两条消息再试一次
    if (!imageUrl) {
      // 找出最近 5 条消息中发送者的消息的前两条进行尝试
      const [prev1, prev2] = (await this.qbot.getRecentHistory(5)).filter(
        item => Number(item.sender) === params.sender
      );
      imageUrl = this.extractImageUrl(prev1?.raw_message || '') || this.extractImageUrl(prev2?.raw_message || '');

      // 也没找到图片的话就报错
      if (!imageUrl) {
        const text = '没有找到图片喵，请发送带图片的消息';
        console.log('❌ ImageRecognize 未找到图片URL');
        !silent && (await this.qbot.sendGroupMessage(text));
        return text;
      }
    }

    const [data, error] = await client.post<any, ImageRecognizeResponse>(
      'https://api.milorapart.top/apis/airecognizeimg',
      { file: imageUrl },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (error) {
      const text = '识图失败了喵\n' + error?.message || '未知错误';
      console.log('❌ ImageRecognize 识图失败');
      console.log(error);
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const result = `🔍 识图结果：\n${data.result}`;
    !silent && (await this.qbot.sendGroupMessage(result));
    console.log('✅ ImageRecognize 识图成功');
    console.log(data);

    return result;
  };
}
