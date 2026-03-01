import { client } from '../utils/http-client.ts';
import { type AIClient, type AIMessageItem, type ResponseMessage } from '../ai-client/ai-client.ts';

export class ModelZhipu implements AIClient {
  apiKey: string;
  currentModel = 'glm-4.7-flash';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: AIMessageItem[], tools: any): Promise<[true, ResponseMessage] | [false, string]> {
    try {
      const [data, error] = await client.post(
        'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        {
          model: this.currentModel,
          messages,
          stream: false,
          tools,
          thinking: {
            type: 'enabled',
          },
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
    } catch (e) {
      return [false, e.toString()];
    }
  }
}
