import fs from 'fs-extra';
import schedule from 'node-schedule';

import { debounce } from '../utils/index.ts';
import type { CommandHandlerParams, QBot, QBotPlugin } from '../qbot/index.ts';
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
        `当 <type> 为 corn 时，表示创建一个周期性触发的定时任务，此时 <time> 为一个 node-schedule 支持的 corn 表达式（包含6个参数 秒 分 时 日 月 周）\n` +
        `一些复杂的定时任务可通过在任务描述中递归创建定时任务实现，请确保任务描述足够详细，猫猫将仅根据描述内容完成任务`,
      handler: this.handleCornCreate,
    });

    qbot.command.register({
      name: 'corn-delete',
      alias: ['删除定时任务'],
      description: `/corn-delete <name> 删除指定名称的定时任务`,
      handler: this.handleCornDelete,
    });

    qbot.command.register({
      name: 'corn-list',
      alias: ['查看定时任务'],
      description: `/corn-list 列出当前已有的定时任务`,
      handler: async (params: CommandHandlerParams) => {
        const result = this.getCornTasksPrompts();
        !params.silent && (await this.qbot.sendGroupMessage(result));
        return result;
      },
    });
  };

  handleCornCreate = async (params: CommandHandlerParams): Promise<string> => {
    const args = params.params.trim();
    const { silent = false } = params;

    // 先解析出第一个参数是 at 还是 corn，at 的话后面两个参数都是时间，corn 的话后面六个参数都是时间
    const [_, name, type, rest1] = args.match(/^(\S+)\s+(\S+)\s+(.*)$/);

    // 一次性任务
    if (type === 'at') {
      const [_, t1, t2, desc] = rest1.match(/^(\S+)\s+(\S+)\s+(.*)$/);

      // 检查时间格式是否为 YYYY-MM-DD HH:mm
      if (!dayjs(`${t1} ${t2}`, CORN_TIME_FORMAT).isValid()) {
        const text = `参数格式错误，<time> 参数必须为 ${CORN_TIME_FORMAT} 格式的时间字符串`;
        !silent && (await this.qbot.sendGroupMessage(text));
        return text;
      }

      return await this.createCorn(name, type, `${t1} ${t2}`, desc, silent);
    }
    // 周期任务
    else if (type === 'corn') {
      const [_, t1, t2, t3, t4, t5, t6, desc] = rest1.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/);

      // 检查是否存在空参数
      if (!t1 || !t2 || !t3 || !t4 || !t5 || !t6 || !desc) {
        const text = '参数格式错误，<time> 参数必须为 6 个非空参数，且 <desc> 不能为空';
        !silent && (await this.qbot.sendGroupMessage(text));
        return text;
      }

      return await this.createCorn(name, type, `${t1} ${t2} ${t3} ${t4} ${t5} ${t6}`, desc, silent);
    } else {
      const text = '参数格式错误，<type> 参数必须为 at 或 corn';
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }
  };

  handleCornDelete = async (params: CommandHandlerParams): Promise<string> => {
    const args = params.params.trim();
    const { silent = false } = params;
    const matched = args.match(/^(\S+)$/);

    if (!matched) {
      const text = '参数格式错误，正确格式为：/corn-delete <name>';
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const [_, name] = matched;

    this.removeCornTask(name);

    const text = `定时任务删除成功：${name}`;
    !silent && (await this.qbot.sendGroupMessage(text));
    return text;
  };

  /** 创建单个定时任务 */
  createCorn(name: string, type: 'at' | 'corn', time: string, desc: string, silent = false) {
    const cornTasks = this.cornTasks;

    // 存在重名任务时，先销毁旧任务
    this.removeCornTask(name);

    // 删除 time 和 desc 在开头结尾处可能存在的引号
    time = time.trim().replace(/^"|"$/g, '');
    desc = desc.trim().replace(/^"|"$/g, '');

    const spec = type === 'at' ? dayjs(time, 'YYYY-MM-DD HH:mm').valueOf() : time;
    const { qbot } = this;
    schedule.scheduleJob(name, spec, () => {
      console.log('🚀 定时任务已触发');
      console.dir({ name, type, time, desc });

      // 发送一条 at 猫猫的消息触发回复
      qbot.invokeGroupMessage(
        new SystemMessage({
          group_id: qbot.targetGroup,
          account: qbot.account,
          rawMessage: `[CQ:at,qq=${this.qbot.account}] [系统消息][定时任务触发 ${name}] 猫猫需执行以下任务：\n${desc}`,
        })
      );

      // 一次性的任务要在执行后删除
      if (type === 'at') {
        this.removeCornTask(name);
      }
    });

    cornTasks[name] = { type, time, desc };
    this.saveCornTasks();

    const text = `定时任务已创建：${name} ${type} ${time}\n${desc}`;
    !silent && qbot.sendGroupMessage(text);
    console.log('✅ 定时任务已创建：', name, type, time, desc);

    return text;
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
