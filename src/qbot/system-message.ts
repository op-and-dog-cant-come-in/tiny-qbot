import { ensureStringId } from '../utils/index.ts';

/**
 * 用于不通过 napcat 手动触发消息的伪造消息对象，
 * 仅包含 napcat 消息的部分必要字段，未来可根据需要继续补充
 */
export class SystemMessage {
  /** 注意 napcat 的时间戳是秒为单位的 unix 时间戳 */
  time = Date.now() / 1000;
  message_id = '0';
  message_type = 'group';
  user_id: string | number;
  raw_message = '';
  message = [];
  group_id: number | string;
  group_name = '';

  constructor(options: SystemMessageInitOptions) {
    this.message_id = ensureStringId(options.messageId);
    this.group_id = ensureStringId(options.groupId);
    this.raw_message = options.rawMessage;
    this.user_id = ensureStringId(options.account);
    this.message.push({
      type: 'text',
      data: {
        text: options.rawMessage,
      },
    });
  }
}

export interface SystemMessageInitOptions {
  groupId: string | number;
  account: string | number;
  rawMessage: string;
  messageId: string | number;
}
