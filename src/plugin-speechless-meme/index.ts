import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

export class SpeechlessMeme implements QBotPlugin {
  name = 'speechless-meme';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '求求',
      description: '/求求 <文本1> <文本2> 生成一张表情包图片，内容为 "你们怎么不说话，是不是在<文本1>，求求你们不要再<文本2>了"',
      handler: this.sendSpeechlessMeme,
    });
  };

  sendSpeechlessMeme = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;

    try {
      const args = params.params.trim().split(/\s+/);
      const [topText = '', bottomText = topText] = args;

      const response = await fetch('https://uapis.cn/api/v1/image/speechless', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          top_text: topText,
          bottom_text: bottomText,
        }),
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }

      const imageBuffer = await response.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString('base64');
      const message = `[CQ:image,file=base64://${base64Image}]`;

      !silent && (await this.qbot.sendGroupMessage(message));
      console.log('✅ SpeechlessMeme 发送表情包成功');
      console.log(`Top: ${topText}, Bottom: ${bottomText}`);

      return message;
    } catch (e) {
      const text = '发送表情包失败了喵\n' + (e?.message || '未知错误');
      console.log('❌ SpeechlessMeme 发送表情包失败');
      console.log(e);
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }
  };
}
