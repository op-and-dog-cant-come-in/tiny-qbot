import { HttpClient } from '../utils/http-client.ts';
import { type QBotPlugin, type QBot } from '../qbot/index.ts';

const client = new HttpClient();

export class HajimiMusic implements QBotPlugin {
  name = 'hajimi-music';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '哈基米',
      alias: ['hajimi', '哈吉米'],
      description: '/哈基米 发送一段随机的哈吉米音乐，该指令没有参数',
      handler: () => this.sendHajimiMusic(),
      handlerForLLM: () => this.sendHajimiMusicForLLM(),
    });
  };

  async sendHajimiMusic() {
    const [data, error] = await client.get<any>('http://api.ocoa.cn/api/hjm.php');

    if (error) {
      console.log('❌ HajimiMusic 获取音乐链接失败');
      console.log(error);
      await this.qbot.sendGroupMessage('哈基米音乐获取失败了喵\n' + error?.message || '未知错误');
      return;
    }

    await this.qbot.sendGroupMessage(`[CQ:record,file=${data.url}]`);
    console.log('✅ HajimiMusic 发送哈基米音乐成功');
    console.log(data);
  }

  async sendHajimiMusicForLLM(): Promise<string> {
    const [data, error] = await client.get<any>('/api/hjm.php');

    if (error) {
      console.log('❌ HajimiMusic 获取音乐链接失败');
      console.log(error);
      return '哈基米音乐获取失败了喵\n' + error?.message || '未知错误';
    }

    return `[CQ:record,file=${data.url}]`;
  }
}
