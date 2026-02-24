import crypto from 'node:crypto';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

const BASE_URL = 'https://api-takumi.mihoyo.com';

/** 崩铁的签到 act_id */
const HKSR_ACT_ID = 'e202304121516551'; // https://github.com/Womsxd/MihoyoBBSTools/blob/405d4cc3c90c975b8d71a63d0413e79cf59b016e/setting.py#L120C21-L120C37

interface AccountInfo {
  nickname: string;
  uid: string;
  region: string;
}

interface MihoyoResponse<T = any> {
  retcode: number;
  message: string;
  data?: T;
}

interface AccountListData {
  list: Array<{
    nickname: string;
    game_uid: string;
    region: string;
  }>;
}

interface SignInfoData {
  is_sign: boolean;
  total_sign_day: number;
  first_bind: boolean;
}

interface SignResultData {
  success: number;
  gt?: string;
  challenge?: string;
}

interface AwardData {
  awards: Array<{ name: string; cnt: number }>;
}

export class MihoyoCheckIn implements QBotPlugin {
  name = 'mihoyo-checkin';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '崩铁签到',
      description: '/崩铁签到 <cookie> 执行米游社崩坏：星穹铁道每日签到',
      handler: this.performCheckIn,
    });
  };

  generateRandomString(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  generateDS(): string {
    const t = Math.floor(Date.now() / 1000);
    const r = this.generateRandomString(6);

    // salt 取值参考：https://github.com/Womsxd/MihoyoBBSTools/blob/master/setting.py#L4C1-L4C19
    const str = `salt=DlOUwIupfU6YespEUWDJmXtutuXV6owG&t=${t}&r=${r}`;
    const hash = crypto.createHash('md5').update(str).digest('hex');
    return `${t},${r},${hash}`;
  }

  generateDeviceId(): string {
    return crypto.randomUUID();
  }

  getHeaders(cookie: string, deviceId: string): Record<string, string> {
    return {
      DS: this.generateDS(),
      Referer: 'https://act.mihoyo.com/',
      Cookie: cookie,
      'x-rpc-device_id': deviceId,
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 12; Unspecified Device) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/103.0.5060.129 Mobile Safari/537.36',
      'x-rpc-client_type': '5',
      'Accept-Encoding': 'gzip, deflate',
      'Accept-Language': 'zh-CN,en-US;q=0.8',
      'X-Requested-With': 'com.mihoyo.hyperion',
    };
  }

  /** 获取游戏账号列表 */
  getAccountList = async (cookie: string, deviceId: string): Promise<AccountInfo[]> => {
    const url = `${BASE_URL}/binding/api/getUserGameRolesByCookie?game_biz=hkrpg_cn`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(cookie, deviceId),
    });
    const data = (await res.json()) as MihoyoResponse<AccountListData>;

    if (data.retcode === -100) {
      throw new Error('Cookie 已失效，需要重新登录');
    }

    if (data.retcode !== 0) {
      throw new Error(`获取账号列表失败: ${data.message}`);
    }

    console.log('✅ 成功获取账号列表');
    console.dir(res, { depth: null });
    console.dir(data, { depth: null });

    return (data.data?.list || []).map(item => ({
      nickname: item.nickname,
      uid: item.game_uid,
      region: item.region,
    }));
  };

  /** 获取签到奖励列表（由每天签到结果组成的数组） */
  async getCheckinRewards(cookie: string, deviceId: string): Promise<Array<{ name: string; cnt: number }>> {
    const url = `${BASE_URL}/event/luna/home?lang=zh-cn&act_id=${HKSR_ACT_ID}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(cookie, deviceId),
    });

    const data = (await res.json()) as MihoyoResponse<AwardData>;

    console.log('✅ 成功获取签到奖励列表');
    console.dir(res, { depth: null });
    console.dir(data, { depth: null });

    if (data.retcode !== 0) {
      console.log(`获取签到奖励列表失败: ${data.message}`);
      return [];
    }

    return data.data?.awards || [];
  }

  /** 获取签到状态 */
  async checkSignStatus(cookie: string, deviceId: string, region: string, uid: string): Promise<SignInfoData> {
    const url = `${BASE_URL}/event/luna/info?lang=zh-cn&act_id=${HKSR_ACT_ID}&region=${region}&uid=${uid}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(cookie, deviceId),
    });

    const data = (await res.json()) as MihoyoResponse<SignInfoData>;

    console.log('✅ 成功获取签到状态');
    console.dir(res, { depth: null });
    console.dir(data, { depth: null });

    if (data.retcode !== 0) {
      throw new Error(`获取签到状态失败: ${data.message}`);
    }

    return data.data!;
  }

  /** 执行签到 */
  async performSign(
    cookie: string,
    deviceId: string,
    region: string,
    uid: string
  ): Promise<MihoyoResponse<SignResultData>> {
    const url = `${BASE_URL}/event/luna/sign`;
    const headers = {
      ...this.getHeaders(cookie, deviceId),
      'Content-Type': 'application/json',
      Origin: 'https://act.mihoyo.com',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        act_id: HKSR_ACT_ID,
        region,
        uid,
      }),
    });

    console.log('✅ 成功执行签到');
    console.dir(res, { depth: null });

    const result = await res.json();

    console.log('✅ 签到结果');
    console.dir(result, { depth: null });

    return result as MihoyoResponse<SignResultData>;
  }

  async signAccount(
    account: AccountInfo,
    cookie: string,
    deviceId: string,
    awards: Array<{ name: string; cnt: number }>
  ): Promise<{ success: boolean; message: string }> {
    const { nickname, uid, region } = account;

    const signStatus = await this.checkSignStatus(cookie, deviceId, region, uid);

    if (signStatus.first_bind) {
      return {
        success: false,
        message: `开拓者「${nickname}」是第一次绑定米游社，请先手动签到一次`,
      };
    }

    let signDays = signStatus.total_sign_day;

    if (signStatus.is_sign) {
      const reward = awards[signDays - 1];
      return {
        success: true,
        message: `开拓者「${nickname}」今天已经签到过了\n本月签到天数: ${signDays}\n今日奖励: ${reward?.cnt || 0}x「${reward?.name || '未知'}」`,
      };
    }

    const result = await this.performSign(cookie, deviceId, region, uid);

    console.log('✅ 签到结果');
    console.dir(result, { depth: null });

    if (result.retcode === 0 && result.data?.success === 0) {
      const reward = awards[signDays];
      return {
        success: true,
        message: `开拓者「${nickname}」签到成功~\n本月签到天数: ${signDays + 1}\n今日奖励: ${reward?.cnt || 0}x「${reward?.name || '未知'}」`,
      };
    } else if (result.retcode === -5003) {
      const reward = awards[signDays - 1];
      return {
        success: true,
        message: `开拓者「${nickname}」今天已经签到过了\n本月签到天数: ${signDays}\n今日奖励: ${reward?.cnt || 0}x「${reward?.name || '未知'}」`,
      };
    } else {
      return {
        success: false,
        message: `开拓者「${nickname}」签到失败: ${result.message}`,
      };
    }
  }

  /** 签到操作的入口函数 */
  performCheckIn = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;
    let cookie = params.params;

    if (!cookie || cookie.trim() === '') {
      const text = '请提供米游社 Cookie 喵';
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const deviceId = this.generateDeviceId();
    cookie = cookie.trim();

    try {
      // 获取账号列表
      const accounts = await this.getAccountList(cookie, deviceId);

      console.log('✅ 成功获取米游社账号信息');
      console.dir(accounts, { depth: null });

      if (accounts.length === 0) {
        const text = '未找到绑定的崩坏：星穹铁道账号';
        !silent && (await this.qbot.sendGroupMessage(text));
        return text;
      }

      // 获取奖励列表
      const awards = await this.getCheckinRewards(cookie, deviceId);

      // console.log('✅ 成功获取签到奖励列表');
      // console.dir(awards, { depth: null });

      if (awards.length === 0) {
        const text = '未找到签到奖励列表';
        !silent && (await this.qbot.sendGroupMessage(text));
        return text;
      }

      let message = `🎮 崩坏：星穹铁道 签到结果\n\n`;
      const results: string[] = [];

      for (const account of accounts) {
        const result = await this.signAccount(account, cookie, deviceId, awards);
        results.push(result.message);
      }

      message += results.join('\n\n');
      !silent && (await this.qbot.sendGroupMessage(message));
      return message;
    } catch (e: any) {
      console.log('❌ 签到过程出错:');
      console.log(e);
      const text = `签到过程出错: ${e.message}`;
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }
  };
}
