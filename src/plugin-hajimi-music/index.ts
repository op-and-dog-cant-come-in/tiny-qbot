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
      handler: () => this.sendHajimiMusic(),
      handlerForLLM: () => this.sendHajimiMusicForLLM(),
    });
  };

  async sendHajimiMusic() {
    try {
      const res = await fetch('http://api.ocoa.cn/api/hjm.php');
      const data = (await res.json()) as any;

      if (!data || !data.url) {
        console.log('❌ HajimiMusic 获取音乐链接失败');
        console.log(res);
        console.log(data);
        return;
      }

      await this.qbot.sendGroupMessage(`[CQ:record,file=${data.url}]`);
      console.log('✅ HajimiMusic 发送哈基米音乐成功');
      console.log(data);
    } catch (e) {
      console.log('❌ HajimiMusic 发送失败:');
      console.log(e);
    }
  }

  async sendHajimiMusicForLLM(): Promise<string> {
    try {
      const res = await fetch('http://api.ocoa.cn/api/hjm.php');
      const data = (await res.json()) as any;

      if (!data || !data.url) {
        return '获取哈基米音乐失败';
      }

      return `[CQ:record,file=${data.url}]`;
    } catch (e) {
      return `发送哈基米音乐失败: ${e?.message || '未知错误'}`;
    }
  }
}
