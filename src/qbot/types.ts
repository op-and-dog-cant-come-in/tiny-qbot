/** WorkerData 数据格式 */
export interface DatabaseWorkerData {
  /** 机器人所在的群号 */
  groupId: number | string;
}

/** 向数据库添加一条历史记录的参数格式 */
export interface AddHistoryParams {
  /** 任务类型 */
  type: 'add-history';

  /** 消息的 ID */
  messageId: string;

  /** 消息时间，使用 unix 时间戳表示 */
  timeStamp: number;

  /** 发送者的 QQ 号 */
  sender: string;

  /** 消息内容的 raw_message */
  rawMessage: string;
}

/** 读取最近的 n 条消息记录的参数格式 */
export interface GetRecentHistoryParams {
  /** 任务类型 */
  type: 'get-recent-history';

  /** 要读取的消息记录数量 */
  recent: number;
}

/** 消息记录格式 */
export interface MessageRecord {
  /** 数据库 id */
  id: number;

  /** 消息 id */
  message_id: string;

  /** 发送者的 QQ 号 */
  sender: string;

  /** 消息内容的 raw_message */
  raw_message: string;

  /** 消息时间，使用 unix 时间戳表示 */
  timestamp: number;
}
