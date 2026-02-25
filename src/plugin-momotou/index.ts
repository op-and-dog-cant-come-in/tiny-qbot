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

  // 摸摸头在后台执行没有意义，因此会无视 silent 参数总是发送消息
  sendMomotouImage = async (params: CommandHandlerParams): Promise<string> => {
    try {
      const qq = params.params.trim();
      const imageUrl = `https://uapis.cn/api/v1/image/motou?qq=${qq}`;
      const message = `[CQ:image,file=${imageUrl}]`;

      await this.qbot.sendGroupMessage(message);
      console.log('✅ Momotou 发送摸摸头图片成功');
      console.log(`QQ: ${qq}, Image URL: ${imageUrl}`);

      return message;
    } catch (e) {
      const text = '发送摸摸头图片失败了喵\n' + e?.message || '未知错误';
      console.log('❌ Momotou 发送摸摸头图片失败');
      console.log(e);
      await this.qbot.sendGroupMessage(text);
      return text;
    }
  };
}
