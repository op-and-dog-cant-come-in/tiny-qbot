import { client } from '../utils/index.ts';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

const models = ['moonshotai/Kimi-K2.5', 'Qwen/Qwen3.5-397B-A17B'];

export class ImageRecognize implements QBotPlugin {
  name = 'image-recognize';
  qbot: QBot;
  apiKey: string;
  currentModel = models[0];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '识图',
      // alias: ['image', 'img'],
      description: '/识图 <图片> 使用AI识别图片内容，以文本形式描述',
      handler: this.recognizeImage,
    });
  };

  extractImageUrl(message: string = ''): string | null {
    const cqPattern = /\[CQ:image.*?url=([^,\]]+)/;
    const match = message.match(cqPattern);

    if (match && match[1]) {
      let url = match[1];
      url = url.replace(/&amp;/g, '&');
      return url;
    }

    return null;
  }

  recognizeImage = async (params: CommandHandlerParams): Promise<string> => {
    try {
      const { silent = false } = params;
      let imageUrl = this.extractImageUrl(params.params);

      // 当前消息没有提供图片的话，尝试使用上两条消息再试一次
      if (!imageUrl) {
        // 找出最近 5 条消息中发送者的消息的前两条进行尝试
        const [prev1, prev2] = (await this.qbot.getRecentHistory(5)).filter(
          item => Number(item.sender) === params.sender
        );
        imageUrl = this.extractImageUrl(prev1?.raw_message || '') || this.extractImageUrl(prev2?.raw_message || '');

        // 也没找到图片的话就报错
        if (!imageUrl) {
          const text = '没有找到图片喵，请发送带图片的消息';
          console.log('❌ ImageRecognize 未找到图片URL');
          !silent && (await this.qbot.sendGroupMessage(text));
          return text;
        }
      }

      let loop = true;

      while (loop) {
        const [data, error, res] = await client.post(
          'https://api-inference.modelscope.cn/v1/chat/completions',
          {
            model: this.currentModel,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: '请描述这张图片的内容，生成100字以内的回复' },
                  {
                    type: 'image_url',
                    image_url: {
                      url: imageUrl,
                    },
                  },
                ],
              },
            ],
            stream: false,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!error) {
          const choice = data.choices?.[0];
          const result = choice.message.content || choice.delta.content;

          !silent && (await this.qbot.sendGroupMessage(result));
          console.log('✅ ImageRecognize 识图成功');
          console.log(data);

          return result;
        }

        // 如果是 429 报错，则更换模型重新请求
        if (res.status === 429) {
          console.log(`❌ 模型 ${this.currentModel} 额度用完了喵，尝试更换模型喵...`);
          this.currentModel = models[models.indexOf(this.currentModel) + 1];

          if (!this.currentModel) {
            return '模型额度用完了喵，没法回复了喵';
          }

          continue;
        }

        return '图片识别失败了喵';
      }
    } catch (e) {
      return '图片识别失败了喵\n' + e?.message || '未知错误';
    }
  };
}
