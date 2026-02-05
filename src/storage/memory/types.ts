/**
 * Memory Storage 类型定义
 *
 * 参考：openclaw-cn-ds/src/memory/internal.ts
 */

/**
 * 记忆来源类型
 */
export type MemorySource = "memory" | "sessions";

/**
 * 文件元信息
 */
export interface MemoryFileEntry {
  /** 相对于 workspace 的路径 */
  path: string;
  /** 绝对路径 */
  absPath: string;
  /** 修改时间（毫秒） */
  mtimeMs: number;
  /** 文件大小（字节） */
  size: number;
  /** 内容哈希（SHA256） */
  hash: string;
}

/**
 * Markdown 分块
 */
export interface MemoryChunk {
  /** 起始行号 */
  startLine: number;
  /** 结束行号 */
  endLine: number;
  /** 文本内容 */
  text: string;
  /** 内容哈希 */
  hash: string;
}

/**
 * 记忆搜索结果
 */
export interface MemorySearchResult {
  /** 文件路径 */
  path: string;
  /** 起始行号 */
  startLine: number;
  /** 结束行号 */
  endLine: number;
  /** 相关性分数（0-1） */
  score: number;
  /** 文本片段 */
  snippet: string;
  /** 来源 */
  source: MemorySource;
}

/**
 * 索引元信息
 */
export interface MemoryIndexMeta {
  /** Embedding 模型名称 */
  model: string;
  /** Provider 名称（如 "ollama", "openai"） */
  provider: string;
  /** Provider Key（可选） */
  providerKey?: string;
  /** 分块大小（token 数） */
  chunkTokens: number;
  /** 分块重叠（token 数） */
  chunkOverlap: number;
  /** 向量维度（可选） */
  vectorDims?: number;
}

/**
 * Embedding 结果
 */
export interface EmbeddingResult {
  /** 向量数组 */
  embedding: number[];
  /** 向量维度 */
  dims: number;
  /** 使用的模型 */
  model: string;
}

/**
 * Embedding Provider 接口
 */
export interface IEmbeddingProvider {
  /** Provider 名称 */
  readonly name: string;
  /** 生成单个文本的向量 */
  embed(text: string): Promise<EmbeddingResult>;
  /** 批量生成向量 */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}

/**
 * 分块配置
 */
export interface ChunkConfig {
  /** 每个 chunk 的 token 数（近似） */
  tokens: number;
  /** chunk 之间的 overlap（token 数） */
  overlap: number;
}

/**
 * 索引进度回调
 */
export interface IndexProgressCallback {
  (update: {
    completed: number;
    total: number;
    label?: string;
  }): void;
}

/**
 * Memory Storage 配置选项
 *
 * 参考：openclaw-cn-ds/src/config/types.tools.ts
 */
export interface MemoryStorageConfig {
  /**
   * 是否启用记忆搜索
   * @default true
   */
  enabled?: boolean;

  /**
   * 数据源配置
   * @default ["memory"]
   */
  sources?: Array<"memory" | "sessions">;

  /**
   * 实验性功能
   */
  experimental?: {
    /**
     * 会话记忆（实验性）
     * @default false
     */
    sessionMemory?: boolean;
  };

  /**
   * 同步配置
   */
  sync?: {
    /**
     * 会话启动时同步
     * @default true
     */
    onSessionStart?: boolean;

    /**
     * 搜索前自动同步
     * @default true
     */
    onSearch?: boolean;

    /**
     * 监控文件变化
     * @default true
     */
    watch?: boolean;

    /**
     * 文件变化防抖时间（毫秒）
     * @default 5000
     */
    watchDebounceMs?: number;

    /**
     * 定期同步间隔（分钟）
     * @default undefined（不启用）
     */
    intervalMinutes?: number;

    /**
     * 同步原因（用于调试）
     */
    reason?: "startup" | "search" | "session-start" | "watch" | "interval";
  };

  /**
   * 查询配置
   */
  query?: {
    /**
     * 最大结果数
     * @default 5
     */
    maxResults?: number;

    /**
     * 最低分数阈值（0-1）
     * @default 0.0
     */
    minScore?: number;

    /**
     * 混合搜索配置
     */
    hybrid?: {
      /**
       * 是否启用混合搜索
       * @default false
       */
      enabled?: boolean;

      /**
       * 向量搜索权重（0-1）
       * @default 0.7
       */
      vectorWeight?: number;

      /**
       * 关键词搜索权重（0-1）
       * @default 0.3
       */
      textWeight?: number;
    };
  };
}
