import { client } from '../utils/http-client.ts';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

export class HajimiMusic implements QBotPlugin {
  name = 'hajimi-music';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '哈基米',
      alias: ['hajimi', '哈吉米'],
      description: '/哈基米 发送一段随机的哈吉米音乐，该指令没有参数',
      handler: this.sendHajimiMusic,
    });
  };

  sendHajimiMusic = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;
    const [data, error] = await client.get<any>('http://api.ocoa.cn/api/hjm.php');

    if (error) {
      const text = '哈基米音乐获取失败了喵\n' + error?.message || '未知错误';
      console.log('❌ HajimiMusic 获取音乐链接失败');
      console.log(error);
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const result = `[CQ:record,file=${data.url}]`;
    !silent && (await this.qbot.sendGroupMessage(result));
    console.log('✅ HajimiMusic 发送哈基米音乐成功');
    console.log(data);

    return result;
  };
}
