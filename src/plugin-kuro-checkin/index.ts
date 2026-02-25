import fs from 'fs-extra';
import { execa } from 'execa';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

export class KuroCheckIn implements QBotPlugin {
  name = 'kuro-checkin';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: 'kuro-checkin',
      alias: ['kuro'],
      description: '/kuro-checkin <token> 进行库街区签到',
      handler: this.checkIn,
    });
  };

  checkIn = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;
    const token = params.params.trim();

    if (!token) {
      const text = '请输入token';
      !silent && (await this.qbot.sendGroupMessage(text));
      console.log('❌ 进行库街区签到失败，未输入token');
      return text;
    }

    // 生成配置文件
    const config = await fs.readFile('src/plugin-kuro-checkin/Kuro-autosignin-main/config/name.yaml.example', 'utf-8');
    await fs.writeFile(
      'src/plugin-kuro-checkin/Kuro-autosignin-main/config/player.yaml',
      config.replace('<%= TOKEN %>', token)
    );

    const { all } = await execa('uv', ['run', 'src/plugin-kuro-checkin/Kuro-autosignin-main/main.py'], {
      all: true,
      reject: false,
      extendEnv: true,
      env: {
        PYTHONIOENCODING: 'utf-8',
      },
    });

    const text = all.trim();
    !silent && (await this.qbot.sendGroupMessage(text));

    console.log('✅ 库街区签到结果：');
    console.log(text);

    return text;
  };
}
