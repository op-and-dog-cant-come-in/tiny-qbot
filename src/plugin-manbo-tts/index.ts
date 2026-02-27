import { client } from '../utils/index.ts';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

export class ManboTTS implements QBotPlugin {
  name = 'manbo-tts';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '曼波',
      alias: ['manbo'],
      description: '/曼波 <文本内容> 将文本转换为曼波语音发送',
      handler: this.sendManboVoice,
    });
  };

  sendManboVoice = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;
    const text = params.params.trim();

    if (!text) {
      console.log('❌ ManboTTS 文本内容为空');
      const text = '文本内容为空，无法生成曼波语音';
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const [data, error] = await client.get(`https://api.milorapart.top/apis/mbAIsc?text=${encodeURIComponent(text)}`);

    if (error) {
      const text = '生成曼波语音失败了喵\n' + error?.message || '未知错误';
      console.log('❌ ManboTTS 生成语音失败');
      console.log(error);
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const result = `[CQ:record,file=${data.url}]`;
    !silent && (await this.qbot.sendGroupMessage(result));
    console.log('✅ ManboTTS 生成语音成功');
    console.log(data);

    return result;
  };
}
