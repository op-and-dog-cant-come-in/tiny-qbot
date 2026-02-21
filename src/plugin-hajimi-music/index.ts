import { type QBotPlugin, type QBot } from '../qbot/index.ts';

export class HajimiMusic implements QBotPlugin {
  name = 'hajimi-music';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '哈基米',
      alias: ['hajimi', '哈吉米'],
      description: '/哈基米 发送一段随机的哈吉米音乐，该指令没有参数',
      handler: () => this.sendHajimiMusic(this.qbot.targetGroup),
    });
  };

  async sendHajimiMusic(groupId: number | string) {
    const { naplink } = this.qbot;

    try {
      const res = await fetch('http://api.ocoa.cn/api/hjm.php');
      const data = (await res.json()) as any;

      if (!data || !data.url) {
        console.log('❌ HajimiMusic 获取音乐链接失败');
        console.log(res);
        console.log(data);
        return;
      }

      await naplink.sendGroupMessage(groupId, `[CQ:record,file=${data.url}]`);
      console.log('✅ HajimiMusic 发送哈基米音乐成功');
      console.log(data);
    } catch (e) {
      console.log('❌ HajimiMusic 发送失败:');
      console.log(e);
    }
  }
}
