import { type AIClient, type AIMessageItem } from '../ai-client.ts';

/** 封装字节火山方舟平台的相关 ai 接口 */
export class VolcesArk implements AIClient {
  apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: AIMessageItem[]): Promise<[boolean, string]> {
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; ++i) {
      try {
        const res = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'doubao-seed-1-8-251228',
            input: messages,
            tools: [
              {
                type: 'web_search',
              },
            ],
            thinking: { type: 'disabled' },
            stream: false,
          }),
        });

        if (res.status >= 400 && res.status < 500) {
          console.log('❌ chat 接口请求失败\n', res);
          throw new Error(`Client error: ${res.status} ${res.statusText}`);
        }

        const json: any = await res.json();

        console.log('✅ chat 接口请求成功');
        console.dir(json, { depth: null });

        // output 里可能有 web_search_call 和 message 两类信息
        const message = json.output.find(item => item.type === 'message');
        // const webSearch = json.output.find(item => item.type === 'web_search_call');

        return [true, message.content[0].text];
      } catch (e) {
        console.error(e);
        return [false, e.toString()];
      }
    }

    return [false, '连接超时，请稍后再试'];
  }
}
