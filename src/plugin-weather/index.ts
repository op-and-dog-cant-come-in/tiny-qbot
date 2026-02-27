import { client } from '../utils/http-client.ts';
import { type QBotPlugin, type QBot, type CommandHandlerParams } from '../qbot/index.ts';

interface WeatherForecastItem {
  date: string;
  week: string;
  temp_max: number;
  temp_min: number;
  weather_day: string;
  weather_night: string;
  wind_dir_day?: string;
  wind_scale_day?: string;
}

interface WeatherResponse {
  province: string;
  city: string;
  adcode: string;
  weather: string;
  weather_icon: string;
  temperature: number;
  wind_direction: string;
  wind_power: string;
  humidity: number;
  report_time: string;
  temp_max: number;
  temp_min: number;
  forecast: WeatherForecastItem[];
}

export class WeatherForcast implements QBotPlugin {
  name = 'weather-forcast';
  qbot: QBot;

  install = async (qbot: QBot) => {
    this.qbot = qbot;

    qbot.command.register({
      name: '天气',
      alias: ['weather'],
      description: '/天气 <城市> 查询指定城市今天开始未来七天的天气，需填写完整的省市，例如 /天气 陕西省西安市',
      handler: this.sendWeatherForecast,
    });
  };

  sendWeatherForecast = async (params: CommandHandlerParams): Promise<string> => {
    const { silent = false } = params;
    const city = params.params.trim();

    if (!city) {
      const text = '请提供城市名称，例如：/天气 北京';
      !silent && (await this.qbot.sendGroupMessage(text));
      return text;
    }

    const [data, error] = await client.get<WeatherResponse>(
      `https://uapis.cn/api/v1/misc/weather?city=${encodeURIComponent(city)}&forecast=true`
    );

    if (error) {
      const text = '天气接口请求失败了喵\n' + error?.message || '未知错误';
      !silent && (await this.qbot.sendGroupMessage(text));
      console.log('❌ WeatherForcast 获取天气失败');
      console.log(error);
      return text;
    }

    let message = `🌤️ ${data.city} 未来七天天气预报\n`;
    message += `发布时间: ${data.report_time}\n`;
    message += `当前温度: ${data.temperature}°C\n`;
    message += `当前天气: ${data.weather}\n`;

    for (const item of data.forecast) {
      message += `${item.date} ${item.week}\n`;
      message += `温度: ${item.temp_min}°C ~ ${item.temp_max}°C\n`;
      message += `天气: ${item.weather_day}\n`;
      message += '\n';
    }

    message = message.trim();
    !silent && (await this.qbot.sendGroupMessage(message));
    console.log('✅ WeatherForcast 发送天气预报成功');
    console.log(data);

    return message;
  };
}
