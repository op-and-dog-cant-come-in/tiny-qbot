/**
 * 用于不通过 napcat 手动触发消息的伪造消息对象，
 * 仅包含 napcat 消息的部分必要字段，未来可根据需要继续补充
 */
export class SystemMessage {
  time = Date.now();
  message_id = 0;
  message_type = 'group';
  sender = {
    user_id: 0,
    nickname: '系统操作',
    card: '',
    role: 'admin',
  };
  raw_message = '';
  message = [];
  group_id: number;
  group_name = '';

  constructor(options: SystemMessageInitOptions) {
    this.group_id = Number(options.group_id);
    this.raw_message = options.rawMessage;
    this.sender.user_id = Number(options.account);
  }
}

export interface SystemMessageInitOptions {
  group_id: string | number;
  account: string | number;
  rawMessage: string;
}
