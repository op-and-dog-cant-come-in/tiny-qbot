import { type GroupMessageEvent } from '@naplink/naplink';
import { type QBotPlugin, type QBot, type QBotMessageInfo } from '../qbot.ts';

export class HajimiMusic implements QBotPlugin {
  name = 'hajimi-music';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;
  };

  onGroupMessage = async (data: GroupMessageEvent, info: QBotMessageInfo) => {
    const message = info.resolvedRawMessage;

    if (message.includes('/哈基米')) {
      await this.sendHajimiMusic(data.group_id);
    }
  };

  async sendHajimiMusic(groupId: number | string) {
    const { naplink } = this.qbot;

    try {
      const res = await fetch('http://api.ocoa.cn/api/hjm.php');
      const data = (await res.json()) as any;

      if (!data || !data.url) {
        console.log('❌ HajimiMusic 获取音乐链接失败', res, data);
        return;
      }

      await naplink.sendGroupMessage(groupId, `[CQ:record,file=${data.url}]`);
      console.log('✅ HajimiMusic 发送哈基米音乐成功', data);
    } catch (e) {
      console.log('❌ HajimiMusic 发送失败:', e);
    }
  }
}
