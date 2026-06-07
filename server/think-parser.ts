// ==================== Think Tag Parser ====================
/**
 * 从 text_delta 中提取 think 标签内容和普通内容
 *
 * 返回：{ textDelta: string, thinkDelta?: string }
 * - textDelta: 过滤掉 think 标签后的普通内容
 * - thinkDelta: think 标签内的内容（如果有）
 */

interface ParsedDelta {
  textDelta: string;
  thinkDelta?: string;
}

interface ThinkParserState {
  isInThinkTag: boolean;
  pendingContent: string;
  currentThinkContent: string;
}

/**
 * ThinkParser 类 - 封装解析器状态
 * 每个 WebSocket 连接创建一个实例，状态随连接生命周期自动管理
 */
class ThinkParser {
  private state: ThinkParserState = {
    isInThinkTag: false,
    pendingContent: "",
    currentThinkContent: "",
  };

  /**
   * 解析增量文本，返回过滤后的普通文本和 think 标签内容
   */
  parse(delta: string): ParsedDelta {
    // 将新的增量添加到缓存
    this.state.pendingContent += delta;

    const result: ParsedDelta = { textDelta: "" };
    let remaining = this.state.pendingContent;

    // 处理所有可能的标签
    while (remaining.length > 0) {
      if (this.state.isInThinkTag) {
        // 在 think 标签内，查找结束标签 </think>
        const endTagIndex = remaining.indexOf("</think>");

        if (endTagIndex !== -1) {
          // 找到结束标签
          const thinkContent = remaining.substring(0, endTagIndex);
          result.thinkDelta = thinkContent;

          // 重置状态
          remaining = remaining.substring(endTagIndex + "</think>".length);
          this.state.isInThinkTag = false;
          this.state.currentThinkContent = "";
        } else {
          // 仍在标签内，流式发送增量内容
          result.thinkDelta = remaining;
          this.state.currentThinkContent += remaining;
          this.state.pendingContent = "";
          return result;
        }
      } else {
        // 在标签外，查找开始标签 <think
        const startTagIndex = remaining.indexOf("<think");

        if (startTagIndex !== -1) {
          // 添加开始标签之前的内容作为普通文本
          result.textDelta += remaining.substring(0, startTagIndex);

          // 查找开始标签的结束位置 ">"
          const tagEndIndex = remaining.indexOf(">", startTagIndex);
          if (tagEndIndex !== -1) {
            remaining = remaining.substring(tagEndIndex + 1);
            this.state.isInThinkTag = true;
          } else {
            // 不完整的开始标签，保留到下次处理
            this.state.pendingContent = remaining.substring(0, startTagIndex);
            return result;
          }
        } else {
          // 没有找到标签，所有内容都是普通文本
          result.textDelta += remaining;
          remaining = "";
        }
      }
    }

    // 更新缓存
    this.state.pendingContent = remaining;
    return result;
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.state = {
      isInThinkTag: false,
      pendingContent: "",
      currentThinkContent: "",
    };
  }
}

/**
 * 解析增量文本（兼容性函数，内部使用全局状态）
 * @deprecated 使用 ThinkParser 类以获得更好的封装
 */
const thinkParserStates = new Map<any, ThinkParser>();

function parseThinkTagsFromDelta(
  delta: string,
  ws: any,
): ParsedDelta {
  // 获取或初始化该连接的解析状态
  let parser = thinkParserStates.get(ws);
  if (!parser) {
    parser = new ThinkParser();
    thinkParserStates.set(ws, parser);
  }

  return parser.parse(delta);
}

/**
 * 清理指定连接的解析器状态
 */
function cleanupThinkParserState(ws: any): void {
  thinkParserStates.delete(ws);
}

export { ThinkParser, parseThinkTagsFromDelta, cleanupThinkParserState };
export type { ParsedDelta, ThinkParserState };
