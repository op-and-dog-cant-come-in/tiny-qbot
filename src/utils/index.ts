import fs from 'fs-extra';

export const debounce = <F extends (...args: any[]) => any>(func: F, wait: number) => {
  let timeoutId: any;

  return (...args: Parameters<F>) => {
    timeoutId && clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), wait);
  };
};

export const tryReadJson = async (path: string, defaultValue: any) => {
  try {
    return await fs.readJson(path, 'utf-8');
  } catch (e) {
    console.error(e);
    return defaultValue;
  }
};

export const replaceAllAsync = async (
  s: string,
  pattern: string | RegExp,
  replacer: (matched: string) => Promise<string>
) => {
  // 将 pattern 统一转化为正则表达式
  let regex;

  if (typeof pattern === 'string') {
    // 转义字符串中的正则特殊字符
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escaped, 'g');
  } else if (pattern instanceof RegExp) {
    // 确保正则带有 global 标志
    if (!pattern.global) {
      // 添加 global 标志（自动去重）
      regex = new RegExp(pattern.source, pattern.flags + 'g');
    } else {
      regex = pattern;
    }
  } else {
    return Promise.reject(new TypeError('pattern 必须是字符串或正则表达式'));
  }

  // 2. 收集所有匹配信息（匹配文本、起始索引、长度）
  const matches = [];
  let match;

  while ((match = regex.exec(s)) !== null) {
    matches.push({
      match: match[0],
      index: match.index,
      length: match[0].length,
    });

    // 处理空匹配（如 /x*/g），防止死循环
    if (match[0].length === 0) {
      regex.lastIndex++;
    }
  }

  // 无匹配时直接返回原字符串
  if (matches.length === 0) {
    return Promise.resolve(s);
  }

  // 3. 并行执行所有异步回调
  const replacementPromises = matches.map(m => replacer(m.match));

  // 4. 等待所有替换结果，然后拼接最终字符串
  return Promise.all(replacementPromises).then(replacements => {
    let result = '';
    let lastIndex = 0;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      // 添加匹配前的文本
      result += s.slice(lastIndex, m.index);
      // 添加替换后的文本
      result += replacements[i];
      // 移动指针到匹配结束位置
      lastIndex = m.index + m.length;
    }

    // 添加剩余文本
    result += s.slice(lastIndex);

    return result;
  });
};

export const ensureArray = <T>(arr: T | T[]) => (Array.isArray(arr) ? arr : [arr]);

/** 将用户 id，群组 id，消息 id 等 id 统一转换为字符串形式，并去掉可能存在的小数部分 */
export const ensureStringId = (id: number | string) => String(id).split('.')[0];

/** 生成一个随机的整数 */
export const randomInt = () => {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
};

export * from './worker.ts';
export * from './http-client.ts';
