/** 封装一个基于 fetch 的请求库 */
export class HttpClient {
  /** 基础 url */
  baseUrl: string;

  /** 公共的 header */
  headers: any = {};

  /** 是否打印调试信息 */
  debug: boolean = true;

  constructor(options: Partial<RequestInitOptions> = {}) {
    this.baseUrl = options.baseUrl || '';
  }

  async post<T, U = any>(path: string, data: T, options: Partial<RequestOptions> = {}): Promise<RequestResult<U>> {
    try {
      const { retryCount = 1 } = options;

      for (let i = 0; i < retryCount; ++i) {
        try {
          this.debugInfo(`🌐 发送请求 POST ${this.baseUrl + path}`, data);

          const res = await fetch(this.baseUrl + path, {
            method: 'POST',
            headers: { ...this.headers, ...options.headers },
            body: JSON.stringify(data),
          });

          // 判断状态码是否为 200~299
          if (!res.ok) {
            this.debugInfo(`🌐❌ 错误的状态码 POST ${this.baseUrl + path}`, res.status, res.statusText);
            return [null, new Error(res.statusText), res];
          }

          let content;

          // JSON 响应体需额外检查 json 解析错误的场景
          if (!options.contentType || options.contentType === 'json') {
            try {
              content = await res.json();
            } catch (e) {
              this.debugInfo(`🌐❌ 解析 json 失败 POST ${this.baseUrl + path}`, e);
              return [null, new Error('解析 json 失败'), res];
            }
          } else {
            content = await res.text();
          }

          this.debugInfo(`🌐✅ 收到响应 POST ${this.baseUrl + path}`, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
            content,
          });

          return [content as U, null, res];
        } catch (e) {
          // fetch 过程中抛出异常一般为网络错误，重试即可
          this.debugInfo(`🌐❌ 网络异常 POST ${this.baseUrl + path}`, e);
          continue;
        }
      }

      // 达到最大重试次数
      this.debugInfo(`🌐❌ 达到最大重试次数 POST ${this.baseUrl + path} 请求失败`);
      return [null, new Error('达到最大重试次数'), null];
    } catch (e) {
      this.debugInfo(`🌐❌ 请求错误 POST ${this.baseUrl + path}`, e);
      return [null, e, null];
    }
  }

  async get<U = any>(path: string, options: Partial<RequestOptions> = {}): Promise<RequestResult<U>> {
    try {
      const { retryCount = 1 } = options;

      for (let i = 0; i < retryCount; ++i) {
        try {
          this.debugInfo(`🌐 发送请求 GET ${this.baseUrl + path}`);

          const res = await fetch(this.baseUrl + path, {
            method: 'GET',
            headers: { ...this.headers, ...options.headers },
          });

          this.debugInfo(`🌐✅ 收到响应头 GET ${this.baseUrl + path}`);
          this.debugInfo({
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });

          // 判断状态码是否为 200~299
          if (!res.ok) {
            this.debugInfo(`🌐❌ 错误的状态码 GET ${this.baseUrl + path}`, res);
            return [null, new Error(res.statusText), res];
          }

          let content;

          // JSON 响应体需额外检查 json 解析错误的场景
          if (!options.contentType || options.contentType === 'json') {
            try {
              content = await res.json();
            } catch (e) {
              this.debugInfo(`🌐❌ 解析 json 失败 GET ${this.baseUrl + path}`, e);
              return [null, new Error('解析 json 失败'), res];
            }
          } else {
            content = await res.text();
          }

          this.debugInfo(`🌐✅ 收到响应体 GET ${this.baseUrl + path}`, content);

          return [content as U, null, res];
        } catch (e) {
          // fetch 过程中抛出异常一般为网络错误，重试即可
          this.debugInfo(`🌐❌ 网络异常 GET ${this.baseUrl + path}`, e);
          continue;
        }
      }

      // 达到最大重试次数
      this.debugInfo(`🌐❌ 达到最大重试次数 GET ${this.baseUrl + path} 请求失败`);
      return [null, new Error('达到最大重试次数'), null];
    } catch (e) {
      this.debugInfo(`🌐❌ 请求错误 GET ${this.baseUrl + path}`, e);
      return [null, e, null];
    }
  }

  debugInfo(...args: any[]) {
    if (this.debug) {
      for (const item of args) {
        if (typeof item === 'string') {
          console.log(item);
        } else {
          console.dir(item, { depth: null });
        }
      }
    }
  }
}

export interface RequestInitOptions {
  baseUrl: string;
}

export interface RequestOptions {
  /** 发生网络错误时的重试次数，默认为 1 */
  retryCount?: number;

  /** 自定义 header */
  headers?: any;

  /** 响应体格式，默认为 json */
  contentType: 'json' | 'text';
}

export type RequestResult<T> = [T, Error | null, Response];
