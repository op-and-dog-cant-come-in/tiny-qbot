export interface AIMessageItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** 封装 ai 的通用接口 */
export interface AIClient {
  /** 当前使用的模型 */
  currentModel: string;

  chat(messages: AIMessageItem[]): Promise<[boolean, string]>;
}
