import { type QBotPlugin, type QBot } from '../qbot/index.ts';

export class Menu implements QBotPlugin {
  name = 'menu';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '菜单',
      alias: ['menu', 'help', '帮助'],
      description: '/菜单 获取当前可用的所有指令列表',
      handler: () => this.sendMenu(),
      handlerForLLM: () => this.getMenuForLLM(),
    });
  };

  async sendMenu() {
    const commands = Array.from(this.qbot.command.metaMap.values());

    if (commands.length === 0) {
      await this.qbot.sendGroupMessage('当前没有可用的指令喵');
      return;
    }

    let message = '📋 可用指令列表（指令前的斜杠可省略）：\n\n';

    for (const cmd of commands) {
      const aliasText = cmd.alias && cmd.alias.length > 0 ? ` (别名: ${cmd.alias.join(', ')})` : '';
      message += `/${cmd.name}${aliasText}\n`;
      message += `${cmd.description}\n\n`;
    }

    await this.qbot.sendGroupMessage(message.trim());
    console.log('✅ Menu 发送菜单成功');
  }

  async getMenuForLLM(): Promise<string> {
    const commands = Array.from(this.qbot.command.metaMap.values());

    if (commands.length === 0) {
      return Promise.resolve('当前没有可用的指令');
    }

    let message = '可用指令列表：\n\n';

    for (const cmd of commands) {
      const aliasText = cmd.alias && cmd.alias.length > 0 ? ` (别名: ${cmd.alias.join(', ')})` : '';
      message += `/${cmd.name}${aliasText}\n`;
      message += `${cmd.description}\n\n`;
    }

    return message.trim();
  }
}
