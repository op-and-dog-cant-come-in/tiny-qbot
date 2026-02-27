// 将 QBot 中可能导致性能问题的数据库等操作移动到 worker 线程中完成

import { parentPort, workerData } from 'worker_threads';
import { DatabaseSync } from 'node:sqlite';
import type { WorkerTaskResult } from 'src/utils/worker.ts';
import type { AddHistoryParams, DatabaseWorkerData, GetRecentHistoryParams } from './types.ts';

// 将数据保存在 {群号}.db 文件中
const db = new DatabaseSync(`${(workerData as DatabaseWorkerData).groupId}.db`);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// 创建保存消息记录的表
db.exec(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  message_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  raw_message TEXT NOT NULL,
  timestamp INTEGER NOT NULL
)`);

// 创建发送者和时间的索引
db.exec('CREATE INDEX IF NOT EXISTS idx_sender ON messages(sender)');
db.exec('CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp)');

/** 向数据库添加一条历史记录的语句 */
const ADD_HISTORY_STMT = db.prepare(
  `INSERT INTO messages (sender, raw_message, timestamp, message_id) VALUES (?, ?, ?, ?)`
);

/** 读取最近的第 start 到第 end 条消息记录的语句 */
const GET_RECENT_HISTORY_STMT = db.prepare(
  `SELECT message_id, sender, raw_message, timestamp FROM messages ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`
);

type TaskId = { taskId: number };
export type Params = (AddHistoryParams | GetRecentHistoryParams) & TaskId;

const handlerMap: Record<string, (params: Params) => WorkerTaskResult> = {
  // 向数据库添加消息记录
  'add-history': (params: AddHistoryParams & TaskId) => {
    ADD_HISTORY_STMT.run(params.sender, params.rawMessage, params.timeStamp, params.messageId);
    return { taskId: params.taskId, success: true };
  },
  // 读取最近的第 start 到第 end 条消息记录
  'get-recent-history': (params: GetRecentHistoryParams & TaskId) => {
    const limit = params.end - params.start;
    const offset = params.start;
    const records = GET_RECENT_HISTORY_STMT.all(limit, offset);
    return { taskId: params.taskId, success: true, result: records };
  },
};

parentPort.on('message', async (params: Params) => {
  try {
    parentPort.postMessage(await handlerMap[params.type](params));
  } catch (error) {
    parentPort.postMessage({ taskId: params.taskId, success: false, error: error.message });
  }
});
