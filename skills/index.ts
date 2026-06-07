/**
 * Skills 配置文件
 *
 * 集中管理所有可用的 skills，便于维护和扩展
 */

import { dirname } from "path";
import { fileURLToPath } from "url";

// 动态计算 skills 目录的绝对路径
const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_BASE_DIR = __dirname;

export interface SkillConfig {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: "inline";
  disableModelInvocation: boolean;
}

/**
 * 所有可用的 skills 列表
 *
 * 添加新 skill 时：
 * 1. 在 skills/ 目录下创建新的 skill 文件夹
 * 2. 在此数组中添加对应的配置
 */
export const SKILLS: SkillConfig[] = [
  {
    name: "web-search-tool",
    description:
      "提供网页搜索功能示例，演示如何使用 curl 进行 HTTP 请求",
    filePath: `${SKILLS_BASE_DIR}/web-search-tool/SKILL.md`,
    baseDir: `${SKILLS_BASE_DIR}/web-search-tool`,
    source: "inline",
    disableModelInvocation: false,
  },
  {
    name: "diffusion-narrative-denouncing",
    description:
      "基于扩散模型叙事去噪流的小说写作 SOP。通过锁定全局信号、预测叙事噪声、精准去噪、随机修正四个步骤，解决 AI 翻译腔、逻辑断层和故事平淡的问题。",
    filePath: `${SKILLS_BASE_DIR}/diffusion-narrative-denouncing/SKILL.md`,
    baseDir: `${SKILLS_BASE_DIR}/diffusion-narrative-denouncing`,
    source: "inline",
    disableModelInvocation: false,
  },
  {
    name: "wechat-article",
    description:
      "微信公众号文章写作助手，帮助用户创作高质量的公众号文章",
    filePath: `${SKILLS_BASE_DIR}/wechat-article/SKILL.md`,
    baseDir: `${SKILLS_BASE_DIR}/wechat-article`,
    source: "inline",
    disableModelInvocation: false,
  },
  {
    name: "no-useeffect",
    description:
      "React 无 useEffect 编码规范 - 禁止直接使用 useEffect，使用派生状态、数据获取库、事件处理器、useMountEffect、key 重置等替代模式",
    filePath: `${SKILLS_BASE_DIR}/no-useeffect/SKILL.md`,
    baseDir: `${SKILLS_BASE_DIR}/no-useeffect`,
    source: "inline",
    disableModelInvocation: false,
  },
  {
    name: "json-output-optimizer",
    description:
      "JSON输出优化器 - 当用户要求返回JSON格式时，检查并修复输出结果，确保输出是合法且结构完整的JSON",
    filePath: `${SKILLS_BASE_DIR}/json-output-optimizer/SKILL.md`,
    baseDir: `${SKILLS_BASE_DIR}/json-output-optimizer`,
    source: "inline",
    disableModelInvocation: false,
  },
  {
    name: "resume-optimizer",
    description:
      "ATS简历优化器 - 根据职位描述(JD)和个人能力，生成符合ATS解析要求的高匹配简历。采用格式标准化、自然语义关键词匹配、量化成就等2026年最佳实践",
    filePath: `${SKILLS_BASE_DIR}/resume-optimizer/SKILL.md`,
    baseDir: `${SKILLS_BASE_DIR}/resume-optimizer`,
    source: "inline",
    disableModelInvocation: false,
  },
  {
    name: "simpleman",
    description:
      "Token节省模式 - 压缩输出，减少约75% token使用，保持技术准确性。支持 lite/full/ultra/wenyan 等多种强度级别",
    filePath: `${SKILLS_BASE_DIR}/simpleman/SKILL.md`,
    baseDir: `${SKILLS_BASE_DIR}/simpleman`,
    source: "inline",
    disableModelInvocation: false,
  },
];

/**
 * 根据 name 获取 skill 配置
 */
export function getSkillByName(name: string): SkillConfig | undefined {
  return SKILLS.find((skill) => skill.name === name);
}

/**
 * 获取所有 skill 名称
 */
export function getSkillNames(): string[] {
  return SKILLS.map((skill) => skill.name);
}
