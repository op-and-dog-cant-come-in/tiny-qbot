export interface AIMessageItem {
  role: any;
  content: any;
  tool_call_id?: string;
  tool_calls?: any[];
}

/** 封装 ai 的通用接口 */
export interface AIClient {
  /** 当前使用的模型 */
  currentModel: string;

  /** 返回的结果为 [是否成功, message 对象] message 对象里包含文本回复与工具调用 */
  chat(messages: AIMessageItem[], tools: any): Promise<[true, ResponseMessage] | [false, string]>;
}

export interface ResponseMessage {
  role: string;
  content: string;
  reasoning_content: string;
  tool_calls: {
    function: {
      name: string;
      arguments: string;
    };
    id: string;
    index: number;
    type: string;
  }[];
}
