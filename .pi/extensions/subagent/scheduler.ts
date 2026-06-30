/**
 * Scheduler
 * 支持 cron 表达式和间隔调度的任务调度器
 */

import type { ScheduledJob, AgentOptions } from "./types.js";

interface SchedulerJob extends ScheduledJob {
  timer?: ReturnType<typeof setTimeout>;
  intervalTimer?: ReturnType<typeof setInterval>;
  cronTimer?: ReturnType<typeof setTimeout>;
  isRunning: boolean;
  isDue: () => boolean;
}

export class SubagentScheduler {
  private jobs = new Map<string, SchedulerJob>();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private parentSessionId: string;
  private executeFn: (task: string, options?: AgentOptions) => Promise<string>;

  constructor(
    parentSessionId: string,
    executeFn: (task: string, options?: AgentOptions) => Promise<string>
  ) {
    this.parentSessionId = parentSessionId;
    this.executeFn = executeFn;
  }

  /**
   * Add a scheduled job
   */
  addJob(job: Omit<ScheduledJob, "id" | "createdAt">): string {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();

    const schedulerJob: SchedulerJob = {
      ...job,
      id,
      createdAt: now,
      isRunning: false,
      isDue: () => {
        if (job.cron) {
          return this.isCronDue(job.cron);
        }
        if (job.intervalMs) {
          const elapsed = now - (job.nextRunAt?.getTime() ?? now);
          return elapsed >= job.intervalMs;
        }
        return false;
      },
    };

    this.jobs.set(id, schedulerJob);

    // Calculate next run time
    if (!schedulerJob.nextRunAt) {
      schedulerJob.nextRunAt = this.calculateNextRun(schedulerJob);
    }

    // Start interval timer if specified
    if (job.intervalMs) {
      schedulerJob.intervalTimer = setInterval(() => {
        if (schedulerJob.isDue()) {
          this.executeJob(schedulerJob);
        }
      }, Math.min(job.intervalMs, 60000)); // Check at least every minute
    }

    return id;
  }

  /**
   * Remove a job
   */
  removeJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.timer) clearTimeout(job.timer);
    if (job.intervalTimer) clearInterval(job.intervalTimer);
    if (job.cronTimer) clearTimeout(job.cronTimer);

    this.jobs.delete(id);
    return true;
  }

  /**
   * Get next run time for a job
   */
  getNextRun(id: string): Date | null {
    const job = this.jobs.get(id);
    return job?.nextRunAt ?? null;
  }

  /**
   * List all jobs
   */
  list(): ScheduledJob[] {
    return Array.from(this.jobs.values()).map((job) => ({
      id: job.id,
      agentId: job.agentId,
      cron: job.cron,
      intervalMs: job.intervalMs,
      task: job.task,
      options: job.options,
      createdAt: job.createdAt,
      nextRunAt: job.nextRunAt,
    }));
  }

  /**
   * Pause a job
   */
  pauseJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.intervalTimer) {
      clearInterval(job.intervalTimer);
      job.intervalTimer = undefined;
    }
    if (job.cronTimer) {
      clearTimeout(job.cronTimer);
      job.cronTimer = undefined;
    }

    return true;
  }

  /**
   * Resume a paused job
   */
  resumeJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.intervalMs && !job.intervalTimer) {
      job.intervalTimer = setInterval(() => {
        if (job.isDue()) {
          this.executeJob(job);
        }
      }, Math.min(job.intervalMs, 60000));
    }

    if (job.cron && !job.cronTimer) {
      this.scheduleNextCron(job);
    }

    return true;
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    for (const job of this.jobs.values()) {
      if (job.timer) clearTimeout(job.timer);
      if (job.intervalTimer) clearInterval(job.intervalTimer);
      if (job.cronTimer) clearTimeout(job.cronTimer);
    }

    this.jobs.clear();
  }

  /**
   * Execute a job
   */
  private async executeJob(job: SchedulerJob): Promise<void> {
    if (job.isRunning) return;

    job.isRunning = true;
    job.nextRunAt = this.calculateNextRun(job);

    try {
      const agentId = await this.executeFn(job.task, job.options);
      job.agentId = agentId;
    } catch (err) {
      console.error(`[Scheduler] Job ${job.id} failed:`, err);
    } finally {
      job.isRunning = false;

      // Schedule next run for cron
      if (job.cron) {
        this.scheduleNextCron(job);
      }
    }
  }

  /**
   * Schedule next cron run
   */
  private scheduleNextCron(job: SchedulerJob): void {
    if (!job.cron) return;

    const delay = this.getCronDelay(job.cron);
    if (delay <= 0) return;

    job.cronTimer = setTimeout(() => {
      this.executeJob(job);
    }, delay);
  }

  /**
   * Calculate next run time
   */
  private calculateNextRun(job: SchedulerJob): Date {
    const now = Date.now();

    if (job.cron) {
      const delay = this.getCronDelay(job.cron);
      return new Date(now + delay);
    }

    if (job.intervalMs) {
      const lastRun = job.nextRunAt?.getTime() ?? now;
      const nextRun = lastRun + job.intervalMs;
      return new Date(nextRun > now ? nextRun : now + job.intervalMs);
    }

    return new Date(now);
  }

  /**
   * Check if cron expression is due (simplified cron parser)
   * Supports: * * * * * (minute hour day month weekday)
   */
  private isCronDue(cron: string): boolean {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    const now = new Date();
    const min = parts[0]!;
    const hour = parts[1]!;
    const day = parts[2]!;
    const month = parts[3]!;
    const dow = parts[4]!;

    const nowMin = now.getMinutes();
    const nowHour = now.getHours();
    const nowDay = now.getDate();
    const nowMonth = now.getMonth() + 1;
    const nowDow = now.getDay();

    if (!this.matchesCronPart(min, nowMin)) return false;
    if (!this.matchesCronPart(hour, nowHour)) return false;
    if (!this.matchesCronPart(day, nowDay)) return false;
    if (!this.matchesCronPart(month, nowMonth)) return false;
    if (!this.matchesCronPart(dow, nowDow)) return false;

    return true;
  }

  /**
   * Match a single cron part
   */
  private matchesCronPart(part: string, value: number): boolean {
    if (part === "*") return true;

    // Handle step values like */5
    if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2), 10);
      return value % step === 0;
    }

    // Handle ranges like 1-5
    if (part.includes("-")) {
      const rangeParts = part.split("-").map(Number);
      const start = rangeParts[0]!;
      const end = rangeParts[1]!;
      return value >= start && value <= end;
    }

    // Handle lists like 1,3,5
    if (part.includes(",")) {
      const values = part.split(",").map(Number);
      return values.includes(value);
    }

    // Exact match
    return parseInt(part, 10) === value;
  }

  /**
   * Get delay until next cron match in milliseconds
   */
  private getCronDelay(cron: string): number {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return Infinity;

    const now = new Date();
    const minPart: string | null | undefined = parts[0] === "*" ? null : parts[0];
    const hourPart: string | null | undefined = parts[1] === "*" ? null : parts[1];
    const dayPart: string | null | undefined = parts[2] === "*" ? null : parts[2];
    const monthPart: string | null | undefined = parts[3] === "*" ? null : parts[3];
    const dowPart: string | null | undefined = parts[4] === "*" ? null : parts[4];

    // Find next matching time (simplified - only looks ahead up to 1 hour for minutes)
    for (let offset = 0; offset < 3600; offset++) {
      const check = new Date(now.getTime() + offset * 1000);
      const m = minPart === null ? true : minPart !== undefined && this.matchesCronPart(minPart, check.getMinutes());
      const h = hourPart === null ? true : hourPart !== undefined && this.matchesCronPart(hourPart, check.getHours());
      const d = dayPart === null ? true : dayPart !== undefined && this.matchesCronPart(dayPart, check.getDate());
      const mon = monthPart === null ? true : monthPart !== undefined && this.matchesCronPart(monthPart, check.getMonth() + 1);
      const w = dowPart === null ? true : dowPart !== undefined && this.matchesCronPart(dowPart, check.getDay());

      if (m && h && d && mon && w) {
        return offset * 1000;
      }
    }

    return Infinity;
  }
}

/**
 * Parse cron expression
 */
export function parseCron(expression: string): {
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
} | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  return {
    minute: parts[0]!,
    hour: parts[1]!,
    day: parts[2]!,
    month: parts[3]!,
    weekday: parts[4]!,
  };
}

/**
 * Validate cron expression
 */
export function isValidCron(expression: string): boolean {
  return parseCron(expression) !== null;
}
