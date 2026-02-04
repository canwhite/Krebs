/**
 * Skills Manager
 *
 * Skills 系统的 Facade 层
 * 提供统一的 Skills 管理 API，隐藏内部实现细节
 */

import path from "node:path";

import { createLogger } from "@/shared/logger.js";

import { SkillsLoader, createSkillsLoader } from "./loader.js";
import { SkillsFormatter, createSkillsFormatter } from "./formatter.js";
import { SkillsHotReload, createSkillsHotReload } from "./hot-reload.js";
import { getSkillInstaller } from "./installer.js";
import type {
  BuildPromptOptions,
  SkillEntry,
  SkillsChangeEvent,
  SkillsConfig,
  SkillsStats,
  SkillSnapshot,
  SkillInstallResult,
  SkillInstallStatus,
} from "./types.js";

const logger = createLogger("SkillsManager");

/**
 * Skills Manager 类
 *
 * Facade 模式：统一接口，隐藏实现细节
 */
export class SkillsManager {
  private loader: SkillsLoader;
  private formatter: SkillsFormatter;
  private hotReload: SkillsHotReload;
  private config: SkillsConfig;
  private snapshot: SkillSnapshot | null = null;
  private version: number = 0;

  constructor(config: SkillsConfig) {
    this.config = config;
    this.loader = createSkillsLoader();
    this.formatter = createSkillsFormatter();
    this.hotReload = createSkillsHotReload();

    // 设置热加载回调
    this.hotReload.onChange(() => this.handleReload());
    this.hotReload.onSkillChange((event) => this.handleSkillChange(event));
  }

  /**
   * 加载所有技能
   */
  async loadSkills(): Promise<void> {
    try {
      logger.info("Loading skills...");

      // 从 Bundled Skills 目录加载
      const entries = this.loader.loadFromDir(
        this.config.bundledSkillsDir,
        "bundled"
      );

      // 构建快照
      this.version++;
      this.snapshot = this.loader.buildSnapshot(entries, this.version);

      logger.info(
        `Loaded ${this.snapshot.count} skills (version ${this.snapshot.version})`
      );
    } catch (error) {
      logger.error("Failed to load skills:", error);
      throw error;
    }
  }

  /**
   * 重新加载技能
   */
  async reloadSkills(): Promise<void> {
    logger.info("Reloading skills...");
    await this.loadSkills();
  }

  /**
   * 构建技能 Prompt
   */
  buildSkillsPrompt(options?: BuildPromptOptions): string {
    if (!this.snapshot) {
      logger.warn("No skills loaded, returning empty prompt");
      return "";
    }

    return this.formatter.formatForPrompt(this.snapshot.skills, options);
  }

  /**
   * 获取技能快照
   */
  getSnapshot(): SkillSnapshot {
    if (!this.snapshot) {
      throw new Error("Skills not loaded. Call loadSkills() first.");
    }
    return this.snapshot;
  }

  /**
   * 获取所有技能
   */
  getAllSkills(): SkillEntry[] {
    return this.snapshot?.skills || [];
  }

  /**
   * 根据名称获取技能
   */
  getSkillByName(name: string): SkillEntry | undefined {
    return this.snapshot?.skills.find((s) => s.skill.name === name);
  }

  /**
   * 获取技能统计信息
   */
  getStats(): SkillsStats | null {
    if (!this.snapshot) {
      return null;
    }

    return this.formatter.buildStats(this.snapshot.skills, this.snapshot.version);
  }

  /**
   * 搜索技能
   */
  searchSkills(query: string): SkillEntry[] {
    if (!this.snapshot) {
      return [];
    }

    return this.formatter.findMatchingSkills(this.snapshot.skills, query);
  }

  /**
   * 启用技能
   */
  enableSkill(name: string): boolean {
    const skill = this.getSkillByName(name);

    if (!skill) {
      logger.warn(`Skill not found: ${name}`);
      return false;
    }

    skill.enabled = true;
    this.updateSnapshot();

    logger.info(`Enabled skill: ${name}`);
    return true;
  }

  /**
   * 禁用技能
   */
  disableSkill(name: string): boolean {
    const skill = this.getSkillByName(name);

    if (!skill) {
      logger.warn(`Skill not found: ${name}`);
      return false;
    }

    skill.enabled = false;
    this.updateSnapshot();

    logger.info(`Disabled skill: ${name}`);
    return true;
  }

  /**
   * 启动热加载
   */
  async enableHotReload(): Promise<void> {
    if (!this.config.hotReload) {
      logger.info("Hot reload is disabled in config");
      return;
    }

    try {
      await this.hotReload.watch(this.config.bundledSkillsDir);
      logger.info("Hot reload enabled");
    } catch (error) {
      logger.error("Failed to enable hot reload:", error);
      throw error;
    }
  }

  /**
   * 停止热加载
   */
  async disableHotReload(): Promise<void> {
    try {
      await this.hotReload.unwatch();
      logger.info("Hot reload disabled");
    } catch (error) {
      logger.error("Failed to disable hot reload:", error);
      throw error;
    }
  }

  /**
   * 获取热加载状态
   */
  getHotReloadStatus(): { isWatching: boolean; watchPath: string | null } {
    return this.hotReload.getStatus();
  }

  /**
   * 订阅技能变更事件
   */
  onSkillChange(callback: (event: SkillsChangeEvent) => void): () => void {
    return this.hotReload.onSkillChange(callback);
  }

  /**
   * 订阅重载事件
   */
  onReload(callback: () => void): () => void {
    return this.hotReload.onChange(callback);
  }

  /**
   * 处理热加载触发
   */
  private async handleReload(): Promise<void> {
    logger.info("Hot reload triggered, reloading skills...");
    try {
      await this.reloadSkills();
    } catch (error) {
      logger.error("Failed to reload skills:", error);
    }
  }

  /**
   * 处理技能变更
   */
  private handleSkillChange(event: SkillsChangeEvent): void {
    logger.debug(`Skill change event: ${event.type} - ${event.skillName}`);

    // 可以在这里添加更多逻辑，如发送通知等
  }

  /**
   * 更新快照（内部状态变更后）
   */
  private updateSnapshot(): void {
    if (!this.snapshot) {
      return;
    }

    this.version++;
    this.snapshot = this.loader.buildSnapshot(this.snapshot.skills, this.version);
  }

  /**
   * 获取技能名称列表
   */
  getSkillNames(): string[] {
    return this.formatter.buildSkillNames(this.snapshot?.skills || []);
  }

  /**
   * 格式化技能详情
   */
  formatSkillDetail(name: string): string | null {
    const skill = this.getSkillByName(name);

    if (!skill) {
      return null;
    }

    try {
      return this.formatter.formatSkillDetail(skill);
    } catch (error) {
      logger.error(`Failed to format skill detail for ${name}:`, error);
      return null;
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.disableHotReload();
    logger.info("SkillsManager cleaned up");
  }

  // ============ 技能依赖安装相关方法 ============

  /**
   * 安装技能依赖
   *
   * @param skillName - 技能名称
   * @param options - 安装选项
   * @returns 安装结果列表
   */
  async installSkillDeps(
    skillName: string,
    options?: { dryRun?: boolean; timeoutMs?: number }
  ): Promise<SkillInstallResult[]> {
    const skill = this.getSkillByName(skillName);

    if (!skill) {
      logger.warn(`Skill not found: ${skillName}`);
      throw new Error(`Skill not found: ${skillName}`);
    }

    const installer = getSkillInstaller();
    logger.info(`Installing dependencies for skill: ${skillName}`);

    return await installer.installSkill(skill, options);
  }

  /**
   * 安装所有技能的依赖
   *
   * @param options - 安装选项
   * @returns Map<skillName, results>
   */
  async installAllSkillDeps(options?: {
    dryRun?: boolean;
    timeoutMs?: number;
  }): Promise<Map<string, SkillInstallResult[]>> {
    const skills = this.getAllSkills().filter(
      (s) => s.frontmatter.install && s.frontmatter.install.length > 0
    );

    if (skills.length === 0) {
      logger.info("No skills with install specs found");
      return new Map();
    }

    logger.info(`Installing dependencies for ${skills.length} skills`);

    const results = new Map<string, SkillInstallResult[]>();
    const installer = getSkillInstaller();

    for (const skill of skills) {
      logger.info(`Checking ${skill.skill.name}...`);
      const skillResults = await installer.installSkill(skill, options);
      results.set(skill.skill.name, skillResults);
    }

    return results;
  }

  /**
   * 获取技能安装状态
   *
   * @param skillName - 技能名称
   * @returns 安装状态
   */
  async getInstallStatus(skillName: string): Promise<SkillInstallStatus | null> {
    const skill = this.getSkillByName(skillName);

    if (!skill) {
      logger.warn(`Skill not found: ${skillName}`);
      return null;
    }

    const installer = getSkillInstaller();
    return await installer.getInstallStatus(skill);
  }

  /**
   * 获取所有技能的安装状态
   *
   * @returns Map<skillName, status>
   */
  async getAllInstallStatus(): Promise<Map<string, SkillInstallStatus>> {
    const skills = this.getAllSkills();
    const installer = getSkillInstaller();
    const statusMap = new Map<string, SkillInstallStatus>();

    for (const skill of skills) {
      const status = await installer.getInstallStatus(skill);
      statusMap.set(skill.skill.name, status);
    }

    return statusMap;
  }

  /**
   * 检查技能是否有安装规范
   *
   * @param skillName - 技能名称
   * @returns 是否有安装规范
   */
  hasInstallSpecs(skillName: string): boolean {
    const skill = this.getSkillByName(skillName);
    if (!skill) return false;

    const specs = skill.frontmatter.install ?? [];
    return specs.length > 0;
  }

  /**
   * 列出所有有安装规范的技能
   *
   * @returns 技能名称列表
   */
  listSkillsWithInstallSpecs(): string[] {
    return this.getAllSkills()
      .filter((s) => {
        const specs = s.frontmatter.install ?? [];
        return specs.length > 0;
      })
      .map((s) => s.skill.name);
  }
}

/**
 * 创建 SkillsManager 实例
 *
 * @param config - Skills 配置
 * @returns SkillsManager 实例
 */
export function createSkillsManager(config: SkillsConfig): SkillsManager {
  return new SkillsManager(config);
}

/**
 * 创建默认的 SkillsManager
 *
 * 使用默认配置创建 SkillsManager
 */
export function createDefaultSkillsManager(): SkillsManager {
  // 默认技能目录
  const defaultSkillsDir = path.join(process.cwd(), "skills", "bundled");

  return createSkillsManager({
    bundledSkillsDir: defaultSkillsDir,
    hotReload: true,
  });
}
