import { Worker } from 'node:worker_threads';

/** worker 线程返回数据需要满足的格式，可在此基础上扩展其他字段 */
export interface WorkerTaskResult {
  /** 任务 id，用于判断本次返回属于哪次 runTask 调用 */
  taskId: number;

  /** worker 线程执行是否成功 */
  success: boolean;

  /** worker 线程执行失败的原因 */
  reason?: string;
}

/** 保存 worker 正在执行的任务的信息 */
export interface WokerTaskInfo {
  promise: Promise<any>;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

/** 管理单个 worker 线程交互的包装类 */
export class WorkerScheduler {
  taskMap = new Map<number, WokerTaskInfo>();
  worker: Worker;
  workerUrl: string;
  workerData: any;

  constructor(workerUrl: string, workerData?: any) {
    this.workerUrl = workerUrl;
    this.workerData = workerData;
  }

  async runTask<T extends object, U extends WorkerTaskResult>(params: T): Promise<U> {
    // 在第一次执行 runTask 时惰性初始化 worker
    if (!this.worker) {
      this.worker = new Worker(this.workerUrl, {
        workerData: this.workerData,
      });

      this.worker.on('message', result => {
        const task = this.taskMap.get(result.taskId);

        if (task) {
          result.success ? task.resolve(result) : task.reject(result);
        }
      });
    }

    const task = Promise.withResolvers<any>();
    let taskId: number;

    // todo: 如果同时执行的任务过多，抛出异常

    // 确保任务 id 不重复
    do {
      taskId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    } while (this.taskMap.has(taskId));

    (params as any).taskId = taskId;
    this.taskMap.set(taskId, task);
    this.worker.postMessage(params);

    return (await task.promise) as U;
  }
}
