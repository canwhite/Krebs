/**
 * Skills Hot Reload
 *
 * 负责监听技能文件变化并触发重新加载
 * 使用 chokidar 进行文件监听
 */

import path from "node:path";

import { createLogger } from "@/shared/logger.js";

import type { SkillsChangeEvent } from "./types.js";

const logger = createLogger("SkillsHotReload");

/**
 * Skills Hot Reload 类
 */
export class SkillsHotReload {
  private watcher: any | null = null;
  private callbacks: Set<() => void> = new Set();
  private changeCallbacks: Set<(event: SkillsChangeEvent) => void> = new Set();
  private watchPath: string | null = null;
  private isWatching: boolean = false;

  /**
   * 启动监听
   */
  async watch(dir: string): Promise<void> {
    if (this.isWatching) {
      logger.warn("Hot reload already active");
      return;
    }

    this.watchPath = dir;

    try {
      // 动态导入 chokidar
      const chokidarModule = await import("chokidar");
      const chokidar = chokidarModule.default;

      // 创建 chokidar watcher
      this.watcher = chokidar.watch(dir, {
        ignored: /(^|[\/\\])\../, // 忽略隐藏文件
        persistent: true,
        ignoreInitial: true, // 忽略初始添加事件
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100,
        },
      });

      // 监听事件
      this.watcher
        .on("add", (filePath: string) => this.handleFileAdd(filePath))
        .on("change", (filePath: string) => this.handleFileChange(filePath))
        .on("unlink", (filePath: string) => this.handleFileRemove(filePath))
        .on("error", (error: Error) => this.handleError(error));

      // 等待 watcher 准备就绪
      await new Promise<void>((resolve, reject) => {
        if (!this.watcher) {
          reject(new Error("Watcher not initialized"));
          return;
        }

        this.watcher.on("ready", () => {
          logger.info(`Hot reload watcher ready for: ${dir}`);
          this.isWatching = true;
          resolve();
        });

        this.watcher.on("error", reject);
      });

      logger.info(`Hot reload started for: ${dir}`);
    } catch (error) {
      logger.error(`Failed to start hot reload for ${dir}:`, error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * 停止监听
   */
  async unwatch(): Promise<void> {
    if (!this.isWatching || !this.watcher) {
      return;
    }

    try {
      await this.watcher.close();
      this.cleanup();
      logger.info("Hot reload stopped");
    } catch (error) {
      logger.error("Error stopping hot reload:", error);
      this.cleanup();
    }
  }

  /**
   * 订阅变更事件（通用回调）
   */
  onChange(callback: () => void): () => void {
    this.callbacks.add(callback);

    // 返回取消订阅函数
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * 订阅详细的变更事件
   */
  onSkillChange(callback: (event: SkillsChangeEvent) => void): () => void {
    this.changeCallbacks.add(callback);

    // 返回取消订阅函数
    return () => {
      this.changeCallbacks.delete(callback);
    };
  }

  /**
   * 处理文件添加
   */
  private handleFileAdd(filePath: string): void {
    // 只处理 SKILL.md 文件
    if (!this.isSkillFile(filePath)) {
      return;
    }

    const skillName = this.extractSkillName(filePath);

    logger.info(`Skill added: ${skillName} (${filePath})`);

    this.notifyChange({
      type: "add",
      skillName,
      filePath,
      timestamp: Date.now(),
    });

    this.notifyCallbacks();
  }

  /**
   * 处理文件变更
   */
  private handleFileChange(filePath: string): void {
    // 只处理 SKILL.md 文件
    if (!this.isSkillFile(filePath)) {
      return;
    }

    const skillName = this.extractSkillName(filePath);

    logger.info(`Skill changed: ${skillName} (${filePath})`);

    this.notifyChange({
      type: "change",
      skillName,
      filePath,
      timestamp: Date.now(),
    });

    this.notifyCallbacks();
  }

  /**
   * 处理文件删除
   */
  private handleFileRemove(filePath: string): void {
    // 只处理 SKILL.md 文件
    if (!this.isSkillFile(filePath)) {
      return;
    }

    const skillName = this.extractSkillName(filePath);

    logger.info(`Skill removed: ${skillName} (${filePath})`);

    this.notifyChange({
      type: "remove",
      skillName,
      filePath,
      timestamp: Date.now(),
    });

    this.notifyCallbacks();
  }

  /**
   * 处理错误
   */
  private handleError(error: Error): void {
    logger.error("Hot reload watcher error:", error);
  }

  /**
   * 判断是否是技能文件
   */
  private isSkillFile(filePath: string): boolean {
    const basename = path.basename(filePath);

    // 直接的 SKILL.md 文件
    if (basename === "SKILL.md") {
      return true;
    }

    // .md 文件（在根目录）
    if (basename.endsWith(".md") && !basename.includes(".")) {
      return true;
    }

    return false;
  }

  /**
   * 从文件路径提取技能名称
   */
  private extractSkillName(filePath: string): string {
    const basename = path.basename(filePath, ".md");

    // 如果是 SKILL.md，使用父目录名
    if (basename === "SKILL") {
      return path.basename(path.dirname(filePath));
    }

    return basename;
  }

  /**
   * 通知所有回调
   */
  private notifyCallbacks(): void {
    // 使用防抖，避免频繁触发
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      logger.debug("Triggering reload callbacks");

      for (const callback of this.callbacks) {
        try {
          callback();
        } catch (error) {
          logger.error("Error in reload callback:", error);
        }
      }
    }, 300); // 300ms 防抖
  }

  private debounceTimer: NodeJS.Timeout | null = null;

  /**
   * 通知详细变更事件
   */
  private notifyChange(event: SkillsChangeEvent): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback(event);
      } catch (error) {
        logger.error("Error in skill change callback:", error);
      }
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.watcher = null;
    this.watchPath = null;
    this.isWatching = false;
  }

  /**
   * 获取监听状态
   */
  getStatus(): { isWatching: boolean; watchPath: string | null } {
    return {
      isWatching: this.isWatching,
      watchPath: this.watchPath,
    };
  }
}

/**
 * 创建 SkillsHotReload 实例
 */
export function createSkillsHotReload(): SkillsHotReload {
  return new SkillsHotReload();
}
