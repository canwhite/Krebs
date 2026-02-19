/**
 * Token 估算工具
 *
 * 参考 OpenClaw 的实现，提供更准确的 Token 估算
 * 区分中英文，使用不同的估算比例
 */

export interface TokenEstimateOptions {
  /**
   * 英文 token 比例（字符数 / token 数）
   * 默认 4，即 4 个字符 ≈ 1 个 token
   */
  englishCharsPerToken?: number;

  /**
   * 中文 token 比例（字符数 / token 数）
   * 默认 2，即 2 个汉字 ≈ 1 个 token
   */
  chineseCharsPerToken?: number;

  /**
   * 代码 token 比例
   * 代码通常更紧凑，默认 5
   */
  codeCharsPerToken?: number;

  /**
   * 安全边际（1.2 = 20% buffer）
   */
  safetyMargin?: number;
}

const DEFAULT_OPTIONS: Required<TokenEstimateOptions> = {
  englishCharsPerToken: 4,
  chineseCharsPerToken: 2,
  codeCharsPerToken: 5,
  safetyMargin: 1.2,
};

/**
 * 检测字符是否为中日韩（CJK）字符
 */
function isChineseChar(char: string): boolean {
  const code = char.codePointAt(0) || 0;
  // CJK Unified Ideographs
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x20000 && code <= 0x2a6df) ||
    (code >= 0x2a700 && code <= 0x2b73f) ||
    (code >= 0x2b740 && code <= 0x2b81f) ||
    (code >= 0x2b820 && code <= 0x2ceaf) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x2f800 && code <= 0x2fa1f)
  );
}

/**
 * 检测是否为代码字符（包含常见编程符号）
 */
function isCodeChar(char: string): boolean {
  const code = char.codePointAt(0) || 0;
  // 常见代码符号：{}[]()<>.,;:!?=+-*/&|%^~\
  return (
    code === 0x007b || // {
    code === 0x007d || // }
    code === 0x005b || // [
    code === 0x005d || // ]
    code === 0x0028 || // (
    code === 0x0029 || // )
    code === 0x003c || // <
    code === 0x003e || // >
    code === 0x002c || // ,
    code === 0x002e || // .
    code === 0x003b || // ;
    code === 0x003a || // :
    code === 0x0021 || // !
    code === 0x003f || // ?
    code === 0x003d || // =
    code === 0x002b || // +
    code === 0x002d || // -
    code === 0x002a || // *
    code === 0x002f || // /
    code === 0x0026 || // &
    code === 0x007c || // |
    code === 0x0025 || // %
    code === 0x005e || // ^
    code === 0x007e || // ~
    code === 0x005c || // \
    code === 0x0060 || // `
    code === 0x0022 || // "
    code === 0x0027 || // '
    code === 0x0024 || // $
    code === 0x0040 || // @
    code === 0x0023 || // #
    code === 0x005f    // _
  );
}

/**
 * 估算文本的 token 数量
 *
 * @param text - 要估算的文本
 * @param options - 估算选项
 * @returns 估算的 token 数量
 */
export function estimateTokens(
  text: string,
  options: TokenEstimateOptions = {}
): number {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let chineseChars = 0;
  let englishChars = 0;
  let codeChars = 0;

  for (const char of text) {
    if (isChineseChar(char)) {
      chineseChars++;
    } else if (isCodeChar(char)) {
      codeChars++;
    } else {
      englishChars++;
    }
  }

  // 计算各类字符的 token 数
  const chineseTokens = chineseChars / opts.chineseCharsPerToken;
  const englishTokens = englishChars / opts.englishCharsPerToken;
  const codeTokens = codeChars / opts.codeCharsPerToken;

  // 总 token 数
  const totalTokens = chineseTokens + englishTokens + codeTokens;

  // 应用安全边际
  return Math.ceil(totalTokens * opts.safetyMargin);
}

/**
 * 估算消息的 token 数量
 *
 * @param message - 消息对象
 * @param options - 估算选项
 * @returns 估算的 token 数量
 */
export function estimateMessageTokens(
  message: { content?: string; toolCalls?: any[] },
  options: TokenEstimateOptions = {}
): number {
  let totalTokens = 0;

  // 估算内容 token
  if (message.content) {
    totalTokens += estimateTokens(message.content, options);
  }

  // 估算工具调用 token
  if (message.toolCalls && Array.isArray(message.toolCalls)) {
    for (const toolCall of message.toolCalls) {
      // 工具名称和参数
      const toolName = toolCall.name || "";
      const toolArgs = toolCall.arguments || {};

      totalTokens += estimateTokens(toolName, options);
      totalTokens += estimateTokens(JSON.stringify(toolArgs), options);

      // 每个工具调用有固定开销
      totalTokens += 10;
    }
  }

  // 消息元数据（role, timestamp 等）
  totalTokens += 10;

  return totalTokens;
}

/**
 * 估算多个消息的总 token 数量
 *
 * @param messages - 消息数组
 * @param options - 估算选项
 * @returns 估算的 token 数量
 */
export function estimateMessagesTokens(
  messages: Array<{ content?: string; toolCalls?: any[] }>,
  options: TokenEstimateOptions = {}
): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg, options), 0);
}
