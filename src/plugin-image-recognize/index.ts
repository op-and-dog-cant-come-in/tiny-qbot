import { type QBotPlugin, type QBot } from '../qbot/index.ts';

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
      handler: (args: string, sender: number) => this.recognizeImage(args, sender),
      handlerForLLM: (args: string, sender: number) => this.recognizeImageForLLM(args, sender),
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

  async recognizeImage(args: string, sender: number) {
    let imageUrl = this.extractImageUrl(args);

    // 当前消息没有提供图片的话，尝试使用上两条消息再试一次
    if (!imageUrl) {
      // 找出最近 5 条消息中发送者的消息的前两条进行尝试
      const [prev1, prev2] = (await this.qbot.getRecentHistory(5)).filter(item => Number(item.sender) === sender);
      imageUrl = this.extractImageUrl(prev1?.raw_message || '') || this.extractImageUrl(prev2?.raw_message || '');

      // 也没找到图片的话就报错
      if (!imageUrl) {
        await this.qbot.sendGroupMessage('没有找到图片喵，请发送带图片的消息');
        console.log('❌ ImageRecognize 未找到图片URL');
        return;
      }
    }

    try {
      const res = await fetch('https://api.milorapart.top/apis/airecognizeimg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: imageUrl }),
      });

      const data = (await res.json()) as ImageRecognizeResponse;

      if (!data || data.code !== 200 || !data.result) {
        await this.qbot.sendGroupMessage(`识图失败了喵\n${data?.msg || '未知错误'}`);
        console.log('❌ ImageRecognize 识图失败');
        console.log(res);
        console.log(data);
        return;
      }

      await this.qbot.sendGroupMessage(`🔍 识图结果：\n${data.result}`);
      console.log('✅ ImageRecognize 识图成功');
      console.log(data);
    } catch (e) {
      console.log('❌ ImageRecognize 识图失败:');
      console.log(e);
      await this.qbot.sendGroupMessage(`识图失败了喵\n${e?.message || '未知错误'}`);
    }
  }

  async recognizeImageForLLM(args: string, sender: number): Promise<string> {
    let imageUrl = this.extractImageUrl(args);

    if (!imageUrl) {
      // 找出最近 5 条消息中发送者的消息的前两条进行尝试
      const [prev1, prev2] = (await this.qbot.getRecentHistory(5)).filter(item => Number(item.sender) === sender);
      imageUrl = this.extractImageUrl(prev1?.raw_message || '') || this.extractImageUrl(prev2?.raw_message || '');

      if (!imageUrl) {
        return '没找到图片数据喵，请在指令消息或指令消息的上一条消息中提供图片喵';
      }
    }

    try {
      const res = await fetch('https://api.milorapart.top/apis/airecognizeimg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: imageUrl }),
      });

      const data = (await res.json()) as ImageRecognizeResponse;

      if (!data || data.code !== 200 || !data.result) {
        return `识图失败: ${data?.msg || '未知错误'}`;
      }

      return `识图结果: ${data.result}`;
    } catch (e) {
      return `识图失败: ${e?.message || '未知错误'}`;
    }
  }
}
