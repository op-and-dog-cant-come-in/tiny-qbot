import { AITTS } from './plugin-ai-tts/index.ts';
import { BaiduWebSearch } from './plugin-baidu-web-search/index.ts';
import { CornTask } from './plugin-corn-task/index.ts';
import { EpicFree } from './plugin-epic-free/index.ts';
import { HajimiMusic } from './plugin-hajimi-music/index.ts';
import { ImageRecognize } from './plugin-image-recognize/index.ts';
import { JMComic } from './plugin-jmcomic/index.ts';
import { KuroCheckIn } from './plugin-kuro-checkin/index.ts';
import { ManboTTS } from './plugin-manbo-tts/index.ts';
import { Menu } from './plugin-menu/index.ts';
import { MihoyoCheckIn } from './plugin-mihoyo-checkin/index.ts';
import { NekoAssist } from './plugin-neko-assist/index.ts';
import { QBot } from './qbot/index.ts';

const qbot = new QBot({
  account: '机器人登录的 qq 号',
  group: '机器人服务的群号，机器人只能同时服务一个群',
  plugins: [
    new NekoAssist({ apiKey: '魔搭的 api key' }),
    new AITTS(),
    new BaiduWebSearch('百度 webSearch 的 api key'),
    new CornTask(),
    new EpicFree(),
    new HajimiMusic(),
    new ImageRecognize(),
    new JMComic(),
    new KuroCheckIn(),
    new ManboTTS(),
    new Menu(),
    new MihoyoCheckIn(),
  ],
});

await qbot.setup();
