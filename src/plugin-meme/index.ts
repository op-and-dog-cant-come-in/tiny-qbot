import path from 'node:path';
import fs from 'fs-extra';
import { blake3 } from 'hash-wasm';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

interface MemeItem {
  path: string;
  hash: string;
}

interface MemeData {
  [name: string]: MemeItem;
}

export class Meme implements QBotPlugin {
  name = 'meme';
  qbot: QBot;
  memeData: MemeData = {};

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    await fs.ensureDir('meme');
    this.memeData = await this.loadMemeData();

    qbot.command.register({
      name: 'meme',
      description: '/meme <表情包名称> 发送一个表情包',
      handler: this.sendMeme,
    });

    qbot.command.register({
      name: 'meme-save',
      description: '/meme-save <表情包名称> <图片地址> 保存一个表情包，表情包名称不能包含空白',
      handler: this.saveMeme,
    });

    qbot.command.register({
      name: 'meme-list',
      description: '/meme-list 查看所有表情包名称',
      handler: this.listMeme,
    });

    qbot.command.register({
      name: 'meme-del',
      description: '/meme-del <表情包名称> 删除一个表情包',
      handler: this.deleteMeme,
    });
  };

  loadMemeData = async (): Promise<MemeData> => {
    try {
      return await fs.readJson('meme.json', 'utf-8');
    } catch {
      return {};
    }
  };

  saveMemeData = async () => {
    await fs.writeJson('meme.json', this.memeData, { spaces: 2 });
  };

  sendMeme = async (params: CommandHandlerParams): Promise<string> => {
    const { params: args, silent } = params;
    const name = args?.trim();

    if (!name) {
      const text = '请提供表情包名称喵';
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const memeItem = this.memeData[name];

    if (!memeItem) {
      const text = `表情包 "${name}" 不存在喵`;
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const containerPath = `/app/napcat/data/meme/${memeItem.path}`;
    const result = `[CQ:image,file=${containerPath}]`;
    await this.qbot.sendGroupMessage(result);

    return silent ? result : '表情包发送成功喵';
  };

  saveMeme = async (params: CommandHandlerParams): Promise<string> => {
    const { params: args, silent } = params;
    const parts = args?.trim().split(/\s+/);

    if (!parts || parts.length < 2) {
      const text = '请提供表情包名称和图片地址喵';
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    let name = parts[0];
    const imageUrl = parts[1];

    // 删除 name 两侧可能存在的引号
    name = name.trim().replace(/^["']|["']$/g, '');

    if (this.memeData[name]) {
      const text = `已存在名称为 "${name}" 的表情包喵`;
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    try {
      const res = await fetch(imageUrl);

      if (!res.ok) {
        const text = `下载图片失败喵: ${res.statusText}`;
        !silent && (await this.qbot.sendGroupMessage(text));
        return text;
      }

      const contentType = res.headers.get('content-type') || '';
      let ext = 'png';

      if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        ext = 'jpg';
      } else if (contentType.includes('gif')) {
        ext = 'gif';
      } else if (contentType.includes('webp')) {
        ext = 'webp';
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const hash = await blake3(buffer);

      for (const [existingName, item] of Object.entries(this.memeData)) {
        if (item.hash === hash) {
          const text = `已存在相同的表情包 "${existingName}" 喵`;
          !silent && (await this.qbot.sendGroupMessage(text));
          return text;
        }
      }

      const fileName = `${name}.${ext}`;
      const filePath = path.join('meme', fileName);

      await fs.writeFile(filePath, buffer);

      this.memeData[name] = { path: fileName, hash };
      await this.saveMemeData();
      const text = `表情包 "${name}" 保存成功喵`;
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    } catch (e) {
      const text = `保存表情包失败喵: ${e}`;
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }
  };

  listMeme = async (params: CommandHandlerParams): Promise<string> => {
    const { silent } = params;
    const names = Object.keys(this.memeData);

    if (names.length === 0) {
      const text = '当前没有表情包喵';
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const text = `当前表情包列表：\n${names.join(' ')}`;
    !silent && (await this.qbot.sendGroupMessage(text));

    return text;
  };

  deleteMeme = async (params: CommandHandlerParams): Promise<string> => {
    const { params: args, silent } = params;
    const name = args?.trim();

    if (!name) {
      const text = '请提供表情包名称喵';
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const memeItem = this.memeData[name];

    if (!memeItem) {
      const text = `表情包 "${name}" 不存在喵`;
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    try {
      const filePath = path.join('meme', memeItem.path);
      await fs.unlink(filePath);
      delete this.memeData[name];
      await this.saveMemeData();

      const text = `表情包 "${name}" 删除成功喵`;
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    } catch (e) {
      const text = `删除表情包失败喵: ${e}`;
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }
  };
}
