import { client } from '../utils/http-client.ts';
import { type AIClient, type AIMessageItem, type ResponseMessage } from './ai-client.ts';

const models = [
  'deepseek-ai/DeepSeek-V3.2',
  'ZhipuAI/GLM-5',
  'ZhipuAI/GLM-4.6:ZhipuAI',
  'ZhipuAI/GLM-4.5:ZhipuAI',
  'MiniMax/MiniMax-M2.5',
  'ZhipuAI/GLM-4.7-Flash',
  'Qwen/Qwen3-235B-A22B',
  'deepseek-ai/DeepSeek-R1-0528',
  'Qwen/Qwen3-235B-A22B-Instruct-2507',
  'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  'MiniMax/MiniMax-M1-80k',
];

export class ModelScope implements AIClient {
  apiKey: string;
  currentModel = models[0];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: AIMessageItem[], tools: any): Promise<[true, ResponseMessage] | [false, string]> {
    try {
      let loop = true;

      while (loop) {
        const [data, error, res] = await client.post(
          'https://api-inference.modelscope.cn/v1/chat/completions',
          {
            model: this.currentModel,
            messages,
            stream: false,
            enable_thinking: true,
            tools,
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
          return [true, choice.message || {}];
        }

        // 如果是 429 报错，则更换模型重新请求
        if (res.status === 429) {
          console.log(`❌ 模型 ${this.currentModel} 额度用完了喵，尝试更换模型喵...`);
          this.currentModel = models[models.indexOf(this.currentModel) + 1];

          if (!this.currentModel) {
            return [false, '模型额度用完了喵，没法回复了喵'];
          }

          continue;
        }

        // 服务器错误
        return [false, error.toString()];
      }
    } catch (e) {
      return [false, e.toString()];
    }
  }
}
