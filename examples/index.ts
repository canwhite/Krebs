import {
  createAgentSession,
  type ToolDefinition,
  createBashTool,
  createReadTool,
  createWriteTool,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  createExtensionRuntime,
  createSyntheticSourceInfo,
} from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";
import { getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { SKILLS } from "../skills/index";

const webSearchTool: ToolDefinition = {
  name: "web_search",
  label: "Web Search",
  description: "在互联网上搜索信息。用于查找最新资讯、文档、技术问题等。",
  parameters: Type.Object({
    query: Type.String({ description: "搜索查询词" }),
    numResults: Type.Optional(
      Type.Number({ description: "返回结果数量，默认 10" }),
    ),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    const { query, numResults = 10 } = params as {
      query: string;
      numResults?: number;
    };
    console.log(`[web_search] 搜索: ${query}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              query,
              results: [
                {
                  title: `关于 "${query}" 的搜索结果 1`,
                  url: "https://example.com/1",
                  snippet: "这是搜索结果的摘要...",
                },
                {
                  title: `关于 "${query}" 的搜索结果 2`,
                  url: "https://example.com/2",
                  snippet: "另一个搜索结果的摘要...",
                },
              ],
            },
            null,
            2,
          ),
        },
      ],
      details: {},
    };
  },
};

const getCurrentTimeTool: ToolDefinition = {
  name: "get_current_time",
  label: "Get Current Time",
  description: "获取当前时间和日期。当用户询问时间时使用。",
  parameters: Type.Object({
    timezone: Type.Optional(
      Type.String({ description: "时区，例如 'Asia/Shanghai'，默认本地时区" }),
    ),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    //这里是具体操作
    const { timezone } = params as { timezone?: string };
    const now = new Date();
    const result = {
      iso: now.toISOString(),
      locale: now.toLocaleString("zh-CN", {
        timeZone: timezone || undefined,
        dateStyle: "full",
        timeStyle: "long",
      }),
      timestamp: now.getTime(),
    };

    //这里是工具定义需要返回的内容
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ],
      details: {},
    };
  },
};

const apiKey =
  process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY || "";
const useDeepSeek = !!process.env.DEEPSEEK_API_KEY;

if (!apiKey) {
  console.error("错误：未设置 API Key 环境变量");
  console.error("请设置以下之一：");
  console.error("  export DEEPSEEK_API_KEY=your_key_here  # 使用 DeepSeek");
  console.error("  export ANTHROPIC_API_KEY=your_key_here  # 使用 Claude");
  process.exit(1);
}

function createDeepSeekModel(): Model<"openai-completions"> {
  return {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    api: "openai-completions",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    reasoning: false,
    input: ["text", "image"] as ("text" | "image")[],
    cost: { input: 0.27, output: 1.1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 64000,
    maxTokens: 8000,
    compat: {
      supportsReasoningEffort: false,
    },
  };
}

const systemPrompt = `你是一个专业的编程助手，可以帮助用户完成各种开发任务。

你的能力包括：
- 执行 shell 命令
- 读文件
- 网络搜索
- 获取当前时间

工作原则：
1. 理解用户需求，选择合适的工具
2. 按照工具的参数要求正确调用
3. 根据工具结果继续处理或给出最终答案
4. 如果任务复杂，可以分步骤完成
5. 遇到错误时，尝试分析原因并给出解决建议

请始终使用中文回复用户。`;

async function createSession() {
  const cwd = process.cwd();
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  if (useDeepSeek) {
    authStorage.setRuntimeApiKey("deepseek", apiKey);
  }

  const model = useDeepSeek
    ? createDeepSeekModel()
    : getModel("anthropic", "claude-sonnet-4-20250514");

  const result = await createAgentSession({
    cwd,
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    tools: [createReadTool(cwd), createBashTool(cwd), /* createWriteTool(cwd) */],
    customTools: [webSearchTool, getCurrentTimeTool],
    sessionManager: SessionManager.inMemory(),
    //这也是一个关键因素
    resourceLoader: {
      //extensions是个啥概念
      getExtensions: () => ({
        extensions: [],
        errors: [],
        runtime: createExtensionRuntime(),
      }),
      getSkills: () => ({
        skills: SKILLS.map((s) => ({
          ...s,
          sourceInfo: createSyntheticSourceInfo(s.filePath, {
            source: s.source,
            baseDir: s.baseDir,
          }),
        })),
        diagnostics: [],
      }),
      getPrompts: () => ({ prompts: [], diagnostics: [] }),
      getThemes: () => ({ themes: [], diagnostics: [] }),
      getAgentsFiles: () => ({ agentsFiles: [] }),
      getSystemPrompt: () => systemPrompt,
      getAppendSystemPrompt: () => [],
      extendResources: () => {},
      reload: async () => {},
    },
  });

  return result.session;
}

async function runInteractive() {
  const session = await createSession();

  console.log("=".repeat(60));
  console.log("🤖 Simple Agent 已启动！");
  console.log("输入 'exit' 或 'quit' 退出");
  console.log("=".repeat(60));

  session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      console.log(`\n   🔧 调用工具: ${event.toolName}`);
      console.log(`   📝 参数: ${JSON.stringify(event.args, null, 2)}\n`);
    } else if (event.type === "tool_execution_end") {
      if (!event.isError) {
        console.log(`   ✅ 工具执行成功`);
      } else {
        console.log(`   ❌ 工具执行失败`);
      }
    } else if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
    }
  });

  while (true) {
    const prompt = "\n👤 你: ";
    process.stdout.write(prompt);

    const input = await new Promise<string>((resolve) => {
      process.stdin.once("data", (data) => {
        resolve(data.toString().trim());
      });
    });

    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      console.log("👋 再见！");
      break;
    }

    if (!input) {
      continue;
    }

    try {
      console.log("\n🤖 Agent: ");
      await session.prompt(input);
      console.log();
    } catch (error: any) {
      console.error(`\n❌ 错误: ${error.message}\n`);
    }
  }

  session.dispose();
}

async function runExample() {
  const session = await createSession();

  console.log("📝 示例：创建一个简单的 TypeScript 函数\n");

  const task = `请帮我创建一个 TypeScript 文件 'math-utils.ts'，包含以下功能：
1. add(a, b) - 两数相加
2. multiply(a, b) - 两数相乘
3. factorial(n) - 计算阶乘

每个函数都需要类型注解和 JSDoc 注释。`;

  console.log(`👤 用户: ${task}\n`);

  session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      console.log(`   🔧 调用工具: ${event.toolName}`);
      console.log(`   📝 参数: ${JSON.stringify(event.args, null, 2)}`);
    } else if (event.type === "tool_execution_end") {
      if (!event.isError) {
        console.log(`   ✅ 成功`);
      } else {
        console.log(`   ❌ 失败`);
      }
    } else if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
    }
  });

  await session.prompt(task);
  console.log();

  session.dispose();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--example")) {
    await runExample();
  } else {
    await runInteractive();
  }
}

main().catch(console.error);
