import { ACGDetect } from './plugin-acg-detect/index.ts';
import { AITTS } from './plugin-ai-tts/index.ts';
import { BaiduWebSearch } from './plugin-baidu-web-search/index.ts';
import { CornTask } from './plugin-corn-task/index.ts';
import { EpicFree } from './plugin-epic-free/index.ts';
import { HajimiMusic } from './plugin-hajimi-music/index.ts';
import { Hotboard } from './plugin-hotboard/index.ts';
import { ImageRecognize } from './plugin-image-recognize/index.ts';
import { JMComic } from './plugin-jmcomic/index.ts';
import { KuroCheckIn } from './plugin-kuro-checkin/index.ts';
import { ManboTTS } from './plugin-manbo-tts/index.ts';
import { Menu } from './plugin-menu/index.ts';
import { Meme } from './plugin-meme/index.ts';
import { MihoyoCheckIn } from './plugin-mihoyo-checkin/index.ts';
import { Momotou } from './plugin-momotou/index.ts';
import { NekoAssist } from './plugin-neko-assist/index.ts';
import { SpeechlessMeme } from './plugin-speechless-meme/index.ts';
import { WeatherForcast } from './plugin-weather/index.ts';
import { QBot } from './qbot/index.ts';
import { ModelZhipu } from './ai-client/model-zhipu.ts';

const qbot = new QBot({
  account: '机器人登录的账号',
  group: '机器人服务的群号',
  plugins: [
    new NekoAssist({ llm: new ModelZhipu('智谱apiKey') }),
    new AITTS(),
    new ACGDetect('saucenao的apiKey'),
    new BaiduWebSearch('百度apiKey'),
    new CornTask(),
    new EpicFree(),
    new HajimiMusic(),
    new Hotboard(),
    new ImageRecognize('魔搭的apiKey'),
    new JMComic(),
    new KuroCheckIn(),
    new ManboTTS(),
    new Menu(),
    new Meme(),
    new MihoyoCheckIn(),
    new Momotou(),
    new SpeechlessMeme(),
    new WeatherForcast(),
  ],
});

await qbot.setup();
