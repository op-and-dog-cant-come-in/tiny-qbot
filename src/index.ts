import { NekoAssist } from './plugin-neko-assist/index.ts';
import { QBot } from './qbot.ts';

const qbot = new QBot({
  account: '填写机器人登录的QQ号',
  group: '填写机器人服务的群号',
  plugins: [new NekoAssist({ apiKey: '填写ai使用的apiKey' })],
});

await qbot.setup();
