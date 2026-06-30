/**
 * Worktree
 * Git worktree 隔离支持
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import type { WorktreeOptions } from "./types.js";

/**
 * Worktree manager for creating/managing git worktrees
 */
export class WorktreeManager {
  private parentCwd: string;

  constructor(parentCwd: string) {
    this.parentCwd = parentCwd;
  }

  /**
   * Create a new worktree for an agent
   */
  create(options: WorktreeOptions): WorktreeResult {
    const { agentId, cwd, branch } = options;

    // Validate we're in a git repo
    if (!this.isGitRepo()) {
      return {
        success: false,
        error: "Not in a git repository",
      };
    }

    // Generate worktree path
    const worktreePath = this.getWorktreePath(cwd, agentId);

    // Create branch name
    const branchName = branch ?? `agents/${agentId}`;

    try {
      // Create worktree
      execSync(
        `git worktree add "${worktreePath}" -b "${branchName}"`,
        {
          cwd: this.parentCwd,
          encoding: "utf-8",
          stdio: "pipe",
        }
      );

      return {
        success: true,
        worktreePath,
        branchName,
      };
    } catch (err) {
      return {
        success: false,
        error: String(err),
      };
    }
  }

  /**
   * Remove a worktree
   */
  remove(worktreePath: string): WorktreeResult {
    if (!existsSync(worktreePath)) {
      return {
        success: false,
        error: "Worktree does not exist",
      };
    }

    try {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: this.parentCwd,
        encoding: "utf-8",
        stdio: "pipe",
      });

      return {
        success: true,
      };
    } catch (err) {
      return {
        success: false,
        error: String(err),
      };
    }
  }

  /**
   * List all worktrees
   */
  list(): WorktreeInfo[] {
    if (!this.isGitRepo()) {
      return [];
    }

    try {
      const output = execSync("git worktree list --porcelain", {
        cwd: this.parentCwd,
        encoding: "utf-8",
        stdio: "pipe",
      });

      return this.parseWorktreeList(output);
    } catch {
      return [];
    }
  }

  /**
   * Prune stale worktrees
   */
  prune(): WorktreeResult {
    try {
      execSync("git worktree prune", {
        cwd: this.parentCwd,
        encoding: "utf-8",
        stdio: "pipe",
      });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: String(err),
      };
    }
  }

  /**
   * Check if we're in a git repo
   */
  private isGitRepo(): boolean {
    try {
      execSync("git rev-parse --git-dir", {
        cwd: this.parentCwd,
        encoding: "utf-8",
        stdio: "pipe",
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate worktree path
   */
  private getWorktreePath(cwd: string, agentId: string): string {
    return join(cwd, ".git", "worktrees", `agent_${agentId}`);
  }

  /**
   * Parse git worktree list output
   */
  private parseWorktreeList(output: string): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = [];
    const entries = output.split("\n\n").filter(Boolean);

    for (const entry of entries) {
      const lines = entry.split("\n");
      const info: WorktreeInfo = {
        path: "",
        branch: "",
        isBare: false,
      };

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          info.path = line.slice(9);
        } else if (line.startsWith("branch ")) {
          info.branch = line.slice(7);
        } else if (line === "bare") {
          info.isBare = true;
        }
      }

      if (info.path) {
        worktrees.push(info);
      }
    }

    return worktrees;
  }
}

export interface WorktreeResult {
  success: boolean;
  worktreePath?: string;
  branchName?: string;
  error?: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  isBare: boolean;
}

/**
 * Create worktree manager for a directory
 */
export function createWorktreeManager(cwd: string): WorktreeManager {
  return new WorktreeManager(cwd);
}

/**
 * Check if a directory is a git worktree
 */
export function isWorktree(cwd: string): boolean {
  try {
    const gitDir = execSync("git rev-parse --git-dir", {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();

    // Main repo git dir is .git, worktrees are in .git/worktrees
    return gitDir.includes("worktrees");
  } catch {
    return false;
  }
}

/**
 * Get the parent worktree/branch name
 */
export function getWorktreeBranch(cwd: string): string | null {
  try {
    const branch = execSync("git branch --show-current", {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();

    return branch || null;
  } catch {
    return null;
  }
}
