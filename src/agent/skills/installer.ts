/**
 * Skills 依赖安装器
 *
 * 参考 openclaw-cn-ds 实现
 * 支持：brew, node, go, uv, download
 */

import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { createLogger } from "@/shared/logger.js";

import type {
  SkillEntry,
  SkillInstallSpec,
  SkillInstallResult,
  SkillInstallStatus,
} from "./types.js";

const execAsync = promisify(exec);
const logger = createLogger("SkillInstaller");

/**
 * 默认超时时间（毫秒）
 */
const DEFAULT_TIMEOUT = 120000; // 2分钟

/**
 * 默认Node包管理器
 */
type NodeManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * 检测可用的Node包管理器
 */
function detectNodeManager(): NodeManager {
  // 默认返回npm（可以后续扩展为动态检测）
  return "npm";
}

/**
 * 检查二进制文件是否存在
 */
async function hasBinary(bin: string): Promise<boolean> {
  try {
    await execAsync(`which ${bin}`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 构建Node安装命令
 */
function buildNodeInstallCommand(
  packageName: string,
  manager: NodeManager
): string[] {
  switch (manager) {
    case "pnpm":
      return ["pnpm", "add", "-g", packageName];
    case "yarn":
      return ["yarn", "global", "add", packageName];
    case "bun":
      return ["bun", "add", "-g", packageName];
    default:
      return ["npm", "install", "-g", packageName];
  }
}

/**
 * 构建安装命令
 */
function buildInstallCommand(
  spec: SkillInstallSpec,
  nodeManager: NodeManager
): { argv: string[] | null; error?: string } {
  switch (spec.kind) {
    case "brew":
      if (!spec.formula) return { argv: null, error: "missing brew formula" };
      return { argv: ["brew", "install", spec.formula] };

    case "node":
      if (!spec.npmPackage) return { argv: null, error: "missing node package" };
      return { argv: buildNodeInstallCommand(spec.npmPackage, nodeManager) };

    case "go":
      if (!spec.goModule) return { argv: null, error: "missing go module" };
      return { argv: ["go", "install", spec.goModule] };

    case "uv":
      if (!spec.uvPackage && !spec.pythonPackage) return { argv: null, error: "missing uv package" };
      return { argv: ["uv", "tool", "install", spec.uvPackage || spec.pythonPackage!] };

    case "download":
      return { argv: null, error: "download install handled separately" };

    default:
      return { argv: null, error: "unsupported installer" };
  }
}

/**
 * 执行安装命令（带超时）
 */
async function runCommandWithTimeout(
  argv: string[],
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const command = argv.join(" ");
  logger.debug(`Executing: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: timeoutMs });
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (error: any) {
    const code = error.code ?? null;
    const stdout = error.stdout?.trim() ?? "";
    const stderr = error.stderr?.trim() ?? String(error.message);

    logger.error(`Command failed: ${command}`, { code, stderr });

    return { stdout, stderr, code };
  }
}

/**
 * 下载文件
 */
async function downloadFile(
  url: string,
  destPath: string,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<{ bytes: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok || !response.body) {
      throw new Error(`Download failed (${response.status} ${response.statusText})`);
    }

    // 确保目录存在
    await fs.mkdir(path.dirname(destPath), { recursive: true });

    // 写入文件
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(destPath, buffer);

    return { bytes: buffer.length };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 解压归档文件
 */
async function extractArchive(params: {
  archivePath: string;
  archiveType: string;
  targetDir: string;
  stripComponents?: number;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const { archivePath, archiveType, targetDir, stripComponents, timeoutMs } = params;

  // 确保目标目录存在
  await fs.mkdir(targetDir, { recursive: true });

  if (archiveType === "zip") {
    const hasUnzip = await hasBinary("unzip");
    if (!hasUnzip) {
      return { stdout: "", stderr: "unzip not found on PATH", code: null };
    }
    const argv = ["unzip", "-q", archivePath, "-d", targetDir];
    return await runCommandWithTimeout(argv, timeoutMs);
  }

  // tar.gz, tar.bz2等
  const hasTar = await hasBinary("tar");
  if (!hasTar) {
    return { stdout: "", stderr: "tar not found on PATH", code: null };
  }

  const argv = ["tar", "xf", archivePath, "-C", targetDir];
  if (typeof stripComponents === "number" && Number.isFinite(stripComponents)) {
    argv.push("--strip-components", String(Math.max(0, Math.floor(stripComponents))));
  }

  return await runCommandWithTimeout(argv, timeoutMs);
}

/**
 * 解析归档类型
 */
function resolveArchiveType(spec: SkillInstallSpec, filename: string): string | undefined {
  const explicit = spec.archive?.trim().toLowerCase();
  if (explicit) return explicit;

  const lower = filename.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".tar.bz2") || lower.endsWith(".tbz2")) return "tar.bz2";
  if (lower.endsWith(".tar.xz") || lower.endsWith(".txz")) return "tar.xz";
  if (lower.endsWith(".zip")) return "zip";

  return undefined;
}

/**
 * 安装下载类型的spec
 */
async function installDownloadSpec(
  spec: SkillInstallSpec,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<SkillInstallResult> {
  const url = spec.url?.trim();
  if (!url) {
    return {
      ok: false,
      message: "missing download url",
      stdout: "",
      stderr: "",
      code: null,
    };
  }

  // 解析文件名
  let filename = "";
  try {
    const parsed = new URL(url);
    filename = path.basename(parsed.pathname);
  } catch {
    filename = path.basename(url);
  }
  if (!filename) filename = "download";

  // 目标目录
  const targetDir = spec.targetDir?.trim()
    ? path.resolve(spec.targetDir)
    : path.resolve(process.env.HOME || "", ".krebs", "tools");

  await fs.mkdir(targetDir, { recursive: true });

  const archivePath = path.join(targetDir, filename);
  let downloaded = 0;

  try {
    const result = await downloadFile(url, archivePath, timeoutMs);
    downloaded = result.bytes;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Download failed: ${message}`,
      stdout: "",
      stderr: message,
      code: null,
    };
  }

  // 判断是否需要解压
  const archiveType = resolveArchiveType(spec, filename);
  const shouldExtract = spec.extract ?? Boolean(archiveType);

  if (!shouldExtract) {
    return {
      ok: true,
      message: `Downloaded to ${archivePath}`,
      stdout: `downloaded=${downloaded}`,
      stderr: "",
      code: 0,
    };
  }

  if (!archiveType) {
    return {
      ok: true,
      message: `Downloaded to ${archivePath} (unknown archive type, not extracted)`,
      stdout: `downloaded=${downloaded}`,
      stderr: "",
      code: 0,
    };
  }

  // 解压
  const extractResult = await extractArchive({
    archivePath,
    archiveType,
    targetDir,
    stripComponents: spec.stripComponents,
    timeoutMs,
  });

  if (extractResult.code !== 0) {
    return {
      ok: false,
      message: `Extract failed: ${extractResult.stderr}`,
      stdout: extractResult.stdout,
      stderr: extractResult.stderr,
      code: extractResult.code,
    };
  }

  return {
    ok: true,
    message: `Downloaded and extracted to ${targetDir}`,
    stdout: extractResult.stdout,
    stderr: extractResult.stderr,
    code: 0,
  };
}

/**
 * Skills安装器类
 */
export class SkillInstaller {
  private nodeManager: NodeManager;
  private installCache = new Map<string, boolean>(); // installId -> installed

  constructor() {
    this.nodeManager = detectNodeManager();
    logger.info(`Detected Node package manager: ${this.nodeManager}`);
  }

  /**
   * 检查是否已安装
   */
  async checkInstalled(spec: SkillInstallSpec): Promise<boolean> {
    if (spec.bins && spec.bins.length > 0) {
      // 检查指定的二进制文件
      for (const bin of spec.bins) {
        const installed = await hasBinary(bin);
        if (!installed) return false;
      }
      return true;
    }

    // 检查缓存
    const installId = this.resolveInstallId(spec);
    return this.installCache.get(installId) ?? false;
  }

  /**
   * 安装单个spec
   */
  async installSpec(
    spec: SkillInstallSpec,
    timeoutMs?: number
  ): Promise<SkillInstallResult> {
    const installId = this.resolveInstallId(spec);
    const timeout = timeoutMs ?? DEFAULT_TIMEOUT;

    logger.debug(`Installing ${installId} (kind=${spec.kind})`);

    // download类型单独处理
    if (spec.kind === "download") {
      const result = await installDownloadSpec(spec, timeout);
      if (result.ok) {
        this.installCache.set(installId, true);
      }
      return {
        ...result,
        installId,
        kind: spec.kind,
      };
    }

    // 构建命令
    const { argv, error } = buildInstallCommand(spec, this.nodeManager);
    if (!argv || error) {
      return {
        ok: false,
        message: error ?? "unknown error",
        stdout: "",
        stderr: error ?? "",
        code: null,
        installId,
        kind: spec.kind,
      };
    }

    // 执行安装
    const result = await runCommandWithTimeout(argv, timeout);

    if (result.code === 0) {
      this.installCache.set(installId, true);
      return {
        ok: true,
        message: `Successfully installed ${installId}`,
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        installId,
        kind: spec.kind,
      };
    }

    return {
      ok: false,
      message: `Installation failed: ${result.stderr || "unknown error"}`,
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code,
      installId,
      kind: spec.kind,
    };
  }

  /**
   * 安装Skill的所有依赖
   */
  async installSkill(
    entry: SkillEntry,
    options?: { dryRun?: boolean; timeoutMs?: number }
  ): Promise<SkillInstallResult[]> {
    const specs = entry.frontmatter.install ?? [];
    const results: SkillInstallResult[] = [];

    if (specs.length === 0) {
      logger.info(`No install specs for skill: ${entry.skill.name}`);
      return results;
    }

    logger.info(`Installing ${specs.length} dependencies for skill: ${entry.skill.name}`);

    for (const [index, spec] of specs.entries()) {
      const installId = this.resolveInstallId(spec, index);

      if (options?.dryRun) {
        logger.info(`[DRY RUN] Would install: ${installId}`);
        results.push({
          ok: true,
          message: `[DRY RUN] Would install ${installId}`,
          stdout: "",
          stderr: "",
          code: null,
          installId,
          kind: spec.kind,
        });
        continue;
      }

      // 检查是否已安装
      const installed = await this.checkInstalled(spec);
      if (installed) {
        logger.info(`Already installed: ${installId}`);
        results.push({
          ok: true,
          message: `Already installed: ${installId}`,
          stdout: "",
          stderr: "",
          code: 0,
          installId,
          kind: spec.kind,
        });
        continue;
      }

      // 安装
      const result = await this.installSpec(spec, options?.timeoutMs);
      results.push(result);
    }

    return results;
  }

  /**
   * 获取Skill安装状态
   */
  async getInstallStatus(entry: SkillEntry): Promise<SkillInstallStatus> {
    const specs = entry.frontmatter.install ?? [];
    const items = await Promise.all(
      specs.map(async (spec, index) => {
        const installId = this.resolveInstallId(spec, index);
        const installed = await this.checkInstalled(spec);
        return {
          installId,
          kind: spec.kind,
          installed,
          message: installed ? "Installed" : "Not installed",
        };
      })
    );

    const allInstalled = items.every((item) => item.installed);

    return {
      skillName: entry.skill.name,
      items,
      allInstalled,
      lastCheck: Date.now(),
    };
  }

  /**
   * 解析安装ID
   */
  private resolveInstallId(spec: SkillInstallSpec, index?: number): string {
    return (spec.id ?? `${spec.kind}-${index ?? 0}`).trim();
  }
}

/**
 * 单例实例
 */
let installerInstance: SkillInstaller | null = null;

export function getSkillInstaller(): SkillInstaller {
  if (!installerInstance) {
    installerInstance = new SkillInstaller();
  }
  return installerInstance;
}
