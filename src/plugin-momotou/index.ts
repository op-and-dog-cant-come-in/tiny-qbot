import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

export class Momotou implements QBotPlugin {
  name = 'momotou';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '摸摸头',
      alias: ['momotou'],
      description: '/摸摸头 <qq号> 生成一张摸摸指定用户头像的 gif 动画，注意参数是被摸头的人',
      handler: this.sendMomotouImage,
    });
  };

  sendMomotouImage = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;

    try {
      const qq = params.params.trim();
      const imageUrl = `https://uapis.cn/api/v1/image/motou?qq=${qq}`;
      const message = `[CQ:image,file=${imageUrl}]`;

      !silent && (await this.qbot.sendGroupMessage(message));
      console.log('✅ Momotou 发送摸摸头图片成功');
      console.log(`QQ: ${qq}, Image URL: ${imageUrl}`);

      return message;
    } catch (e) {
      const text = '发送摸摸头图片失败了喵\n' + e?.message || '未知错误';
      console.log('❌ Momotou 发送摸摸头图片失败');
      console.log(e);
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }
  };
}
