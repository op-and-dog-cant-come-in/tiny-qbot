import { HttpClient } from '../utils/http-client.ts';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

const SPEAKERS = [
  '暖心学姐',
  '春日部姐姐',
  '青岛小哥',
  '悬疑解说',
  '皇上',
  '歌唱达人',
  '傲娇大小姐',
  '电台广播',
  '猴哥说唱',
  '纪录片解说',
  '科技博主',
  '清爽男大',
  '赛事解说',
  '解说小帅',
  '康定情歌',
  '雅痞大叔',
  '动漫海绵',
  '病娇少女',
  '容嬷嬷',
  '理智姐',
  '魅力女友',
  '电视广告',
  '恐怖电影',
  '女儿国王',
  '熊二',
  '春日甜妹',
  '西安掌柜',
  '女少侠',
  '渊博小叔',
  '生活小妙招',
  '动漫解说',
  '乒乓解说',
  '锤子哥',
  '粤语男声',
  '温和宝爸',
  '严厉大叔',
  '贺岁女娃',
  '萌娃百科',
  '清冷女声',
  '咆哮哥',
  '心灵鸡汤',
  '文艺男声',
  '靓女',
  '懒小羊',
  '少儿故事',
  '台湾女生',
  '萌娃',
  '阳光男生',
  '温柔男声',
  '天线波波',
  '生活导师',
  '柜哥',
  '播音旁白',
  '龅牙珍珍',
  '强势妹',
  '文艺女声',
  '港普男声',
  '舌尖解说',
  '和蔼奶奶',
  '情感语录',
  '扒小编',
  '快板',
  '情歌王',
  '甜美女孩',
  '直率英子',
  '八戒',
  '活泼女孩',
  '云龙哥',
  '樱花小哥',
  '康康舞曲',
  '温柔播报',
  '质感男声',
  '娱乐播报2',
  '译制片男II',
  '紫薇',
  '商务殷语',
  '京腔',
  '激扬男声',
  '宝宝冯',
  '娱乐播报',
  '电竞解说',
  '网文解说',
  '霸总',
  '东北能哥',
  '温迪迪',
  '川妹子',
  '娱乐扒妹II',
  '顾姐',
  '译制片男',
  '促销男声',
  '小姐姐',
  '米老哥',
  '电子馒头',
  '沉稳解说',
  '甜美悦悦',
  'TVB女声',
  '亲切女声',
  '温柔淑女',
  '新闻女声',
  '做作夹子音',
  '调皮公主',
  '傲娇男声',
  '九小月',
  '章鱼哥哥',
  '歌唱女王',
  '广西表哥',
  '新闻男声',
  '说唱小哥',
  '动漫小新',
  '单口相声',
  '亲切阿姨',
  '大耳小图',
  '游戏解说男',
  '心机御姐',
  '小品艺术家',
  '高冷男声',
  '翩翩公子',
  '硬妹',
  '天津小哥',
  '严厉老太',
  '官方客服',
  '旅游资讯',
  '古风男主',
  '河南大叔',
  '感性女生',
  '温柔女友',
  '病弱少女',
  '和大人',
  '如来佛祖',
  '生活主播',
  '幺妹',
  '佛系馒头',
  '小魔童',
  '武则天',
  '台湾男生',
  '小女孩',
  '可爱女生',
  '广告男声2',
  '军事解说',
  '上海阿姨',
  '童话解说',
  '猴哥',
  '水果舞曲',
  '狐狸姐姐',
  '养生丽姐',
  '阳光少年',
  '樱桃爷爷',
  '大丫',
  '直播一姐',
  '娱乐扒妹',
  '清甜女声',
  '拽拽馒头',
  '沉稳男声',
  '太乙',
  '广普',
  '湘普甜甜',
  '美小羊',
  '港普男声2',
  '侠客',
  '东厂公公',
  '春节甜妹',
  '东北老铁',
  '语音助手',
  '松弛男声',
  '唐小鸭',
  '王小也',
  '小青',
  '稚气少女',
  '广告男声',
  '老婆婆',
  '撒娇学妹',
  '潮汕大叔',
  '太白',
  '英语女王',
  '佩奇猪',
  '樱桃丸子',
  '黛玉',
  '甜美解说',
  '派星星',
  '摇滚男生',
  '清新歌手',
  '知识讲解',
  '知性女声',
  '重庆小伙',
];

const DEFAULT_SPEAKER = '病娇少女';

const client = new HttpClient();

export class AITTS implements QBotPlugin {
  name = 'ai-tts';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: 'tts',
      alias: ['语音'],
      description: '/tts <音源> <文本内容> 将文本转换为AI语音发送，音源参数可省略，猫猫默认不传递音源参数',
      handler: this.sendAIVoice,
    });

    qbot.command.register({
      name: 'tts-speaker',
      alias: ['tts-speakers'],
      description: '/tts-speaker 获取可用的音源列表',
      handler: this.sendSpeakerList,
    });
  };

  sendSpeakerList = async (params: CommandHandlerParams): Promise<string> => {
    const listText = `可用的语音角色列表(${SPEAKERS.length}个)：\n${SPEAKERS.join('、')}`;

    if (params.silent) {
      await this.qbot.sendGroupMessage(listText);
    }

    console.log('✅ AITTS 发送角色列表成功');

    return listText;
  };

  sendAIVoice = async (params: CommandHandlerParams): Promise<string> => {
    let args = params.params.trim();
    const { silent = false } = params;

    if (!args) {
      console.log('❌ AITTS 文本内容为空');
      return '文本内容为空，无法生成语音';
    }

    const parts = args.split(/\s+/);
    let speaker = DEFAULT_SPEAKER;
    let text = args;

    if (parts.length >= 2 && SPEAKERS.includes(parts[0])) {
      speaker = parts[0];
      text = parts.slice(1).join('');
    }

    const [data, error] = await client.get(
      `https://api.milorapart.top/apis/AIvoice/?text=${encodeURIComponent(text)}&speaker=${encodeURIComponent(speaker)}`
    );

    if (error) {
      !silent && (await this.qbot.sendGroupMessage(`语音生成失败了喵\n${error?.message || '未知错误'}`));
      console.log('❌ AITTS 生成语音失败');
      console.log(error);
      return `语音生成失败: ${error?.message || '未知错误'}`;
    }

    const result = `[CQ:record,file=${data.url}]`;
    !silent && (await this.qbot.sendGroupMessage(result));
    console.log(`✅ AITTS 发送AI语音成功 (speaker: ${speaker})`);
    console.log(data);

    return result;
  };
}
