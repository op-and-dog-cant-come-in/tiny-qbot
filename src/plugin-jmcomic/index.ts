import { execa } from 'execa';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

export class JMComic implements QBotPlugin {
  name = 'jmcomic';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: 'jm-album',
      alias: ['jm'],
      description: '/jm-album <album_id> 下载jm本子，以pdf格式发送',
      handler: this.downloadAlbum,
    });
  };

  downloadAlbum = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;
    const album_id = params.params.trim();

    if (!album_id) {
      const text = '请输入本子id';
      !silent && (await this.qbot.sendGroupMessage(text));
      console.log('❌ 下载jm本子失败，未输入本子id');
      return text;
    }

    const { exitCode } = await execa(`uv`, ['run', 'src/plugin-jmcomic/download-album.py', album_id], {
      stdout: 'inherit',
      reject: false,
    });

    if (exitCode) {
      const text = `下载jm本子失败，exitCode: ${exitCode}`;
      !silent && (await this.qbot.sendGroupMessage(text));
      console.log(text);
      return text;
    }

    const fileName = `${album_id}.pdf`;
    const filePath = `/app/napcat/data/jmpdf/${fileName}`;

    try {
      const message_id = await this.qbot.sendGroupMessage(`[CQ:file,file=${filePath},name=${fileName}]`);
      console.log(`✅ 成功发送文件: ${fileName}`);

      // 10分钟后删除文件
      setTimeout(
        async () => {
          await this.qbot.naplink.deleteMessage(message_id);
          console.log(`✅ 已删除文件: ${fileName}`);
        },
        10 * 60 * 1000
      );
    } catch (error) {
      console.log(`❌ 发送文件失败: ${fileName}`);
      console.log(error);
      const text = `发送文件失败: ${error.message}`;
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }
  };
}
