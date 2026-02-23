/**
 * 用于不通过 napcat 手动触发消息的伪造消息对象，
 * 仅包含 napcat 消息的部分必要字段，未来可根据需要继续补充
 */
export class SystemMessage {
  /** 注意 napcat 的时间戳是秒为单位的 unix 时间戳 */
  time = Date.now() / 1000;
  message_id = 0;
  message_type = 'group';
  user_id: string | number;
  raw_message = '';
  message = [];
  group_id: number;
  group_name = '';

  constructor(options: SystemMessageInitOptions) {
    this.group_id = Number(options.group_id);
    this.raw_message = options.rawMessage;
    this.user_id = Number(options.account);
    this.message.push({
      type: 'text',
      data: {
        text: options.rawMessage,
      },
    });
  }
}

export interface SystemMessageInitOptions {
  group_id: string | number;
  account: string | number;
  rawMessage: string;
}
