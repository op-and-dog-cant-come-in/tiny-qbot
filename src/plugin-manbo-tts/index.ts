import { type QBotPlugin, type QBot } from '../qbot/index.ts';

export class ManboTTS implements QBotPlugin {
  name = 'manbo-tts';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '曼波',
      alias: ['manbo'],
      description: '/曼波 <文本内容> 将文本转换为曼波语音发送',
      handler: (args: string) => this.sendManboVoice(this.qbot.targetGroup, args),
    });
  };

  async sendManboVoice(groupId: number | string, text: string) {
    const { naplink } = this.qbot;
    text = text.trim();

    if (!text) {
      console.log('❌ ManboTTS 文本内容为空');
      return;
    }

    try {
      const url = `https://api.milorapart.top/apis/mbAIsc?text=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      const data = (await res.json()) as any;

      if (!data || data.code !== 200 || !data.url) {
        console.log('❌ ManboTTS 生成语音失败');
        console.log(res);
        console.log(data);
        return;
      }

      await naplink.sendGroupMessage(groupId, `[CQ:record,file=${data.url}]`);
      console.log('✅ ManboTTS 发送曼波语音成功');
      console.log(data);
    } catch (e) {
      console.log('❌ ManboTTS 发送失败:');
      console.log(e);
    }
  }
}
