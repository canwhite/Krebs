/**
 * Web Search 工具
 *
 * 参考 openclaw-cn-ds 实现
 * 支持 Brave Search API 和 Perplexity API
 */

import { createLogger } from "@/shared/logger.js";

import type { Tool } from "./types.js";

const logger = createLogger("WebSearchTool");

const SEARCH_CACHE = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟缓存

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
// const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions"; // 未来支持

type SearchResult = {
  title: string;
  url: string;
  description: string;
  age?: string;
};

/**
 * Web Search 工具
 */
export const webSearchTool: Tool = {
  name: "web_search",
  description: "Search the web using Brave Search API. Returns titles, URLs, and snippets for fast research. Supports up to 10 results per query.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query string.",
      },
      count: {
        type: "number",
        description: "Number of results to return (1-10). Default: 5.",
      },
      country: {
        type: "string",
        description: "2-letter country code (e.g., 'US', 'CN', 'ALL'). Default: 'US'.",
      },
      search_lang: {
        type: "string",
        description: "ISO language code (e.g., 'en', 'zh'). Default: 'en'.",
      },
      freshness: {
        type: "string",
        description: "Filter by time: 'pd' (past day), 'pw' (past week), 'pm' (past month), 'py' (past year).",
      },
    },
    required: ["query"],
  },

  async execute(params): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const query = params.query as string;
    const count = (params.count as number) || 5;
    const country = (params.country as string) || "US";
    const search_lang = (params.search_lang as string) || "en";
    const freshness = params.freshness as string | undefined;

    if (!query || typeof query !== "string") {
      return {
        success: false,
        error: "Query is required and must be a string",
      };
    }

    // 限制结果数量
    const actualCount = Math.min(Math.max(count, 1), 10);

    // 检查缓存
    const cacheKey = `web_search:${query}:${actualCount}:${country}:${search_lang}:${freshness || "default"}`;
    const cached = SEARCH_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      logger.debug(`Web search cache hit: ${query}`);
      return {
        success: true,
        data: cached.data,
      };
    }

    // 获取 API Key
    const apiKey = process.env.BRAVE_API_KEY || process.env.SEARCH_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "BRAVE_API_KEY or SEARCH_API_KEY environment variable is required",
      };
    }

    try {
      logger.info(`Executing web search: ${query}`);

      // 调用 Brave Search API
      const searchParams = new URLSearchParams({
        q: query,
        count: actualCount.toString(),
        country: country.toUpperCase(),
        search_lang: search_lang.toLowerCase(),
        text_decorations: "false",
        spellcheck: "0",
      });

      // 添加新鲜度过滤（仅 Brave 支持）
      if (freshness && ["pd", "pw", "pm", "py"].includes(freshness)) {
        searchParams.set("freshness", freshness);
      }

      const response = await fetch(`${BRAVE_SEARCH_ENDPOINT}?${searchParams}`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        signal: AbortSignal.timeout(10000), // 10秒超时
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Brave Search API error: ${response.status} ${errorText}`);
        return {
          success: false,
          error: `Search API error (${response.status}): ${errorText || response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        web?: {
          results?: SearchResult[];
        };
      };

      const results = data.web?.results || [];

      // 格式化结果
      const formattedResults = {
        query,
        provider: "brave",
        count: results.length,
        results: results.map((r) => ({
          title: r.title || "",
          url: r.url || "",
          description: r.description || "",
          age: r.age,
        })),
      };

      // 缓存结果
      SEARCH_CACHE.set(cacheKey, {
        data: formattedResults,
        timestamp: Date.now(),
      });

      logger.info(`Web search succeeded: ${query}, ${results.length} results`);

      return {
        success: true,
        data: formattedResults,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Web search failed: ${query}`, { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

/**
 * Web Fetch 工具
 *
 * 抓取网页内容并转换为 markdown/text
 */
export const webFetchTool: Tool = {
  name: "web_fetch",
  description: "Fetch and extract readable content from a URL. Converts HTML to markdown for easy reading. Supports timeout and content length limits.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to fetch.",
      },
      extractMode: {
        type: "string",
        description: "Extraction mode: 'markdown' (default) or 'text'.",
        enum: ["markdown", "text"],
      },
      maxChars: {
        type: "number",
        description: "Maximum characters to extract. Default: 10000.",
      },
    },
    required: ["url"],
  },

  async execute(params): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const url = params.url as string;
    const extractMode = (params.extractMode as string) || "markdown";
    const maxChars = (params.maxChars as number) || 10000;

    if (!url || typeof url !== "string") {
      return {
        success: false,
        error: "URL is required and must be a string",
      };
    }

    // 验证 URL
    let validUrl: URL;
    try {
      validUrl = new URL(url);
      if (!["http:", "https:"].includes(validUrl.protocol)) {
        throw new Error("Only HTTP and HTTPS protocols are allowed");
      }
    } catch (error) {
      return {
        success: false,
        error: `Invalid URL: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // 检查缓存
    const cacheKey = `web_fetch:${url}:${extractMode}:${maxChars}`;
    const cached = SEARCH_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      logger.debug(`Web fetch cache hit: ${url}`);
      return {
        success: true,
        data: cached.data,
      };
    }

    try {
      logger.info(`Fetching web content: ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15000), // 15秒超时
        redirect: "follow",
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP error ${response.status}: ${response.statusText}`,
        };
      }

      let html = await response.text();

      // 限制内容长度
      if (html.length > maxChars * 2) {
        html = html.substring(0, maxChars * 2);
      }

      // 简单的 HTML 到 Markdown 转换
      let content: string;
      if (extractMode === "text") {
        content = htmlToText(html);
      } else {
        content = htmlToMarkdown(html);
      }

      // 再次限制长度
      if (content.length > maxChars) {
        content = content.substring(0, maxChars) + "\n\n... (content truncated)";
      }

      const result = {
        url,
        status: response.status,
        contentType: response.headers.get("content-type"),
        contentLength: content.length,
        content,
      };

      // 缓存结果
      SEARCH_CACHE.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });

      logger.info(`Web fetch succeeded: ${url}, ${content.length} chars`);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Web fetch failed: ${url}`, { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

/**
 * 简单的 HTML 到 Text 转换
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>.*?<\/script>/gis, "")
    .replace(/<style[^>]*>.*?<\/style>/gis, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 简单的 HTML 到 Markdown 转换
 */
function htmlToMarkdown(html: string): string {
  let text = html;

  // 移除 script 和 style
  text = text.replace(/<script[^>]*>.*?<\/script>/gis, "");
  text = text.replace(/<style[^>]*>.*?<\/style>/gis, "");

  // 转换标题
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n");

  // 转换段落和换行
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gis, "$1\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n\n");

  // 转换链接
  text = text.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // 转换加粗和斜体
  text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");

  // 转换代码
  text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
  text = text.replace(/<pre[^>]*>(.*?)<\/pre>/gis, "```\n$1\n```\n");

  // 转换列表
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");

  // 移除剩余标签
  text = text.replace(/<[^>]+>/g, "");

  // 清理多余空白
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

/**
 * 获取所有 Web 工具
 */
export function getWebTools(): Tool[] {
  return [webSearchTool, webFetchTool];
}
