import { type AIClient, type AIMessageItem } from '../ai-client.ts';

const models = [
  'deepseek-ai/DeepSeek-V3.2',
  'deepseek-ai/DeepSeek-R1-0528',
  'ZhipuAI/GLM-5',
  'ZhipuAI/GLM-4.6:ZhipuAI',
  'ZhipuAI/GLM-4.5:ZhipuAI',
  'MiniMax/MiniMax-M2.5',
  'ZhipuAI/GLM-4.7-Flash',
  'Qwen/Qwen3-235B-A22B',
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

  async chat(messages: AIMessageItem[]): Promise<[boolean, string]> {
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; ++i) {
      try {
        const res = await fetch('https://api-inference.modelscope.cn/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.currentModel,
            messages,
            stream: false,
            enable_thinking: false,
          }),
        });

        // 如果是 429 报错，换一个模型重新试一次
        if (res.status === 429) {
          console.log(`❌ 模型 ${this.currentModel} 额度用完了喵，尝试更换模型喵...`);
          this.currentModel = models[models.indexOf(this.currentModel) + 1];

          if (!this.currentModel) {
            return [false, '模型额度用完了喵，没法回复了喵'];
          }

          --i;
          continue;
        }

        if (res.status >= 400 && res.status < 500) {
          console.log('❌ chat 接口请求失败\n', res);
          throw new Error(`Client error: ${res.status} ${res.statusText}`);
        }

        const json: any = await res.json();

        console.log('✅ chat 接口请求成功');
        console.dir(json, { depth: null });

        const choice = json.choices?.[0];

        if (!choice) {
          return [false, '响应格式错误'];
        }

        return [true, choice.message.content || choice.delta.content || ''];
      } catch (e) {
        console.error(e);
        return [false, e.toString()];
      }
    }

    return [false, '连接超时，请稍后再试'];
  }
}
