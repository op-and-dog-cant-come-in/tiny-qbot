import fs from 'fs-extra';
import schedule from 'node-schedule';

import { debounce } from '../utils/index.ts';
import type { QBot, QBotPlugin } from '../qbot/index.ts';
import dayjs from 'dayjs';
import { SystemMessage } from '../qbot/system-message.ts';

const CORN_TIME_FORMAT = 'YYYY-MM-DD HH:mm';

export class CornTask implements QBotPlugin {
  name = 'corn-task';
  qbot: QBot;

  /** 定时任务信息 */
  cornTasks: Record<string, { type: 'at' | 'corn'; time: string; desc: string }> = {};
  saveCornTasks = debounce(async () => {
    await fs.writeJson('corn.json', this.cornTasks, { spaces: 2 });
    console.log('✅ NekoAssist 定时任务保存成功');
  }, 60000);

  install = async (qbot: QBot) => {
    this.qbot = qbot;
    this.cornTasks = await fs.readJson('corn.json');

    // 加载定时任务
    for (const [key, value] of Object.entries(this.cornTasks)) {
      // 忽略已经过期的一次性任务
      if (value.type === 'at' && dayjs().isAfter(dayjs(value.time, CORN_TIME_FORMAT))) {
        continue;
      }

      this.createCorn(key, value.type, value.time, value.desc, true);
    }

    qbot.command.register({
      name: 'corn-create',
      alias: ['创建定时任务'],
      description:
        `/corn-create <name> <type> <time> <desc> 创建定时触发的任务，<name> 为唯一的任务名称字符串（不能包含空白字符），<desc> 为任务描述\n` +
        `当 <type> 为 at 时，表示创建一个在指定时间点触发的一次性定时任务，此时 <time> 为一个 ${CORN_TIME_FORMAT} 格式的时间字符串\n` +
        `当 <type> 为 corn 时，表示创建一个周期性触发的定时任务，此时 <time> 为一个 node-schedule 支持的 unix corn 表达式（* * * * * * 格式）\n` +
        `一些复杂的定时任务可通过在任务描述中递归创建定时任务实现，请确保任务描述足够详细，猫猫将仅根据描述内容完成任务`,
      handler: args => this.handleCornCreate(args),
      handlerForLLM: args => this.handleCornCreate(args),
    });

    qbot.command.register({
      name: 'corn-delete',
      alias: ['删除定时任务'],
      description: `/corn-delete <name> 删除指定名称的定时任务`,
      handler: args => this.handleCornDelete(args),
      handlerForLLM: args => this.handleCornDelete(args),
    });

    qbot.command.register({
      name: 'corn-list',
      alias: ['查看定时任务'],
      description: `/corn-list 列出当前已有的定时任务`,
      handler: () => this.getCornTasksPrompts(),
      handlerForLLM: async () => this.getCornTasksPrompts(),
    });
  };

  async handleCornCreate(args: string): Promise<string> {
    const matched = args.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/);

    if (!matched) {
      await this.qbot.sendGroupMessage('参数格式错误，正确格式为：/corn-create <name> <type> <time> <desc>');
      return '参数格式错误，正确格式为：/corn-create <name> <type> <time> <desc>';
    }

    const [_, name, type, time, desc] = matched;

    await this.createCorn(name, type as 'at' | 'corn', time, desc);
  }

  async handleCornDelete(args: string): Promise<string> {
    const matched = args.match(/^(\S+)$/);

    if (!matched) {
      await this.qbot.sendGroupMessage('参数格式错误，正确格式为：/corn-delete <name>');
      return '参数格式错误，正确格式为：/corn-delete <name>';
    }

    const [_, name] = matched;

    this.removeCornTask(name);

    return '定时任务删除成功';
  }

  /** 创建单个定时任务 */
  createCorn(name: string, type: 'at' | 'corn', time: string, desc: string, silent = false) {
    const cornTasks = this.cornTasks;

    // 存在重名任务时，先销毁旧任务
    this.removeCornTask(name);

    const spec = type === 'at' ? dayjs(time, 'YYYY-MM-DD HH:mm').valueOf() : time;
    const { qbot } = this;
    schedule.scheduleJob(name, spec, () => {
      console.log('🚀 定时任务已触发', name, type, time, desc);

      // 发送一条 at 猫猫的消息触发回复
      qbot.invokeGroupMessage(
        new SystemMessage({
          group_id: qbot.targetGroup,
          account: qbot.account,
          rawMessage: `[CQ:at,qq=${this.qbot.account}] [定时任务触发 ${name}] ${desc}`,
        })
      );

      // 一次性的任务要在执行后删除
      if (type === 'at') {
        this.removeCornTask(name);
      }
    });

    cornTasks[name] = { type, time, desc };
    this.saveCornTasks();
    !silent && qbot.sendGroupMessage(`定时任务已创建：${type} ${time}\n${desc}`);
    console.log('✅ 定时任务已创建：', name, type, time, desc);

    return '定时任务创建成功';
  }

  /** 移除单个定时任务 */
  removeCornTask(name: string) {
    const cornTasks = this.cornTasks;

    if (cornTasks[name]) {
      schedule.cancelJob(name);
      delete cornTasks[name];
      this.saveCornTasks();
      console.log('✅ 定时任务已删除：', name);
    }
  }

  /** 获取描述现有定时任务的提示词 */
  getCornTasksPrompts() {
    let prompts: string[] = [];

    for (const [key, value] of Object.entries(this.cornTasks)) {
      prompts.push(`${key}[${value.type} ${value.time}]: ${value.desc}`);
    }

    return prompts.join('\n') || '暂无定时任务';
  }
}
