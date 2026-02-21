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
      handler: (args: string) => this.recognizeImage(this.qbot.targetGroup, args),
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

  async recognizeImage(groupId: number | string, args: string) {
    const { naplink } = this.qbot;

    let imageUrl = this.extractImageUrl(args);

    // 当前消息没有提供图片的话，尝试使用上一条消息再试一次
    if (!imageUrl) {
      const [prevMsg] = await this.qbot.getRecentHistory(1);
      imageUrl = this.extractImageUrl(prevMsg.raw_message);

      // 也没找到图片的话就报错
      if (!imageUrl) {
        await naplink.sendGroupMessage(groupId, '没有找到图片喵，请发送带图片的消息');
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
        await naplink.sendGroupMessage(groupId, `识图失败了喵\n${data?.msg || '未知错误'}`);
        console.log('❌ ImageRecognize 识图失败');
        console.log(res);
        console.log(data);
        return;
      }

      await naplink.sendGroupMessage(groupId, `🔍 识图结果：\n${data.result}`);
      console.log('✅ ImageRecognize 识图成功');
      console.log(data);
    } catch (e) {
      console.log('❌ ImageRecognize 识图失败:');
      console.log(e);
      await naplink.sendGroupMessage(groupId, `识图失败了喵\n${e?.message || '未知错误'}`);
    }
  }
}
