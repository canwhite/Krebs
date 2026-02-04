/**
 * 配置管理
 */

import { config as dotenvConfig } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 .env 文件
dotenvConfig({ path: path.join(__dirname, "../../.env") });

export type { AppConfig } from "@/types/index.js";

/**
 * 加载配置
 */
export function loadConfig(): {
  server: {
    port: number;
    host: string;
  };
  agent: {
    name: string;
    maxConcurrent: number;
    defaultModel?: string;
    defaultProvider?: string;
  };
  storage: {
    dataDir: string;
    memoryDir: string;
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
  providers: {
    deepseek?: {
      apiKey?: string;
      baseUrl?: string;
    };
    anthropic?: {
      apiKey?: string;
      baseUrl?: string;
    };
    openai?: {
      apiKey?: string;
      baseUrl?: string;
    };
  };
} {
  return {
    server: {
      port: parseInt(process.env.PORT ?? "3000", 10),
      host: process.env.HOST ?? "0.0.0.0",
    },
    agent: {
      name: process.env.AGENT_NAME ?? "krebs",
      maxConcurrent: parseInt(process.env.AGENT_MAX_CONCURRENT ?? "3", 10),
      defaultModel: process.env.AGENT_DEFAULT_MODEL ?? "deepseek-chat",
      defaultProvider: process.env.AGENT_DEFAULT_PROVIDER ?? "deepseek",
    },
    storage: {
      dataDir: process.env.STORAGE_DIR ?? "./data",
      memoryDir: process.env.MEMORY_DIR ?? "./data/memory",
    },
    logging: {
      level: (process.env.LOG_LEVEL as any) ?? "info",
    },
    providers: {
      deepseek: {
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
      },
    },
  };
}
