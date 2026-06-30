/**
 * Goal Constraint System - SQLite Storage
 *
 * Persists goal summaries and threshold hit status across sessions.
 * Uses Bun's SQLite bindings for lightweight persistence.
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import type { GoalSummary, CoreGoal, KeyMetric } from "./types.js";

// Use in-memory database for goal constraint storage
// This could be extended to use a file-based database if persistence across restarts is needed
const db = new Database(":memory:");

// Enable WAL mode for better concurrency
db.exec("PRAGMA journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS goal_summaries (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    threshold INTEGER NOT NULL,
    core_goals TEXT NOT NULL,
    key_metrics TEXT NOT NULL,
    user_messages TEXT NOT NULL,
    assistant_messages TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS goal_threshold_hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    threshold INTEGER NOT NULL,
    hit_at INTEGER NOT NULL,
    UNIQUE(session_id, threshold)
  );

  CREATE INDEX IF NOT EXISTS idx_goal_summaries_session ON goal_summaries(session_id);
  CREATE INDEX IF NOT EXISTS idx_threshold_hits_session ON goal_threshold_hits(session_id);
`);

/**
 * GoalStorage - SQLite-backed persistence for goal summaries and threshold tracking
 */
export class GoalStorage {
  /**
   * Save a goal summary to the database
   */
  saveGoalSummary(summary: GoalSummary): void {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO goal_summaries
        (id, session_id, threshold, core_goals, key_metrics, user_messages, assistant_messages, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      summary.id,
      summary.sessionId,
      summary.threshold,
      JSON.stringify(summary.coreGoals),
      JSON.stringify(summary.keyMetrics),
      JSON.stringify(summary.userMessages),
      JSON.stringify(summary.assistantMessages),
      summary.createdAt
    );
  }

  /**
   * Get the latest goal summary for a session
   */
  getLatestGoalSummary(sessionId: string): GoalSummary | null {
    const stmt = db.prepare(`
      SELECT id, session_id, threshold, core_goals, key_metrics,
             user_messages, assistant_messages, created_at
      FROM goal_summaries
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const row = stmt.get(sessionId) as any;
    if (!row) return null;

    return this.rowToGoalSummary(row);
  }

  /**
   * Get goal summary for a specific threshold in a session
   */
  getGoalSummaryForThreshold(sessionId: string, threshold: number): GoalSummary | null {
    const stmt = db.prepare(`
      SELECT id, session_id, threshold, core_goals, key_metrics,
             user_messages, assistant_messages, created_at
      FROM goal_summaries
      WHERE session_id = ? AND threshold = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const row = stmt.get(sessionId, threshold) as any;
    if (!row) return null;

    return this.rowToGoalSummary(row);
  }

  /**
   * Get all goal summaries for a session
   */
  getAllGoalSummaries(sessionId: string): GoalSummary[] {
    const stmt = db.prepare(`
      SELECT id, session_id, threshold, core_goals, key_metrics,
             user_messages, assistant_messages, created_at
      FROM goal_summaries
      WHERE session_id = ?
      ORDER BY created_at ASC
    `);

    const rows = stmt.all(sessionId) as any[];
    return rows.map(row => this.rowToGoalSummary(row));
  }

  /**
   * Mark a threshold as hit for a session
   */
  markThresholdHit(sessionId: string, threshold: number): void {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO goal_threshold_hits (session_id, threshold, hit_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(sessionId, threshold, Date.now());
  }

  /**
   * Get threshold hit status for a session
   */
  getThresholdStatus(sessionId: string): { 25: boolean; 40: boolean; 55: boolean } {
    const stmt = db.prepare(`
      SELECT threshold FROM goal_threshold_hits WHERE session_id = ?
    `);

    const rows = stmt.all(sessionId) as { threshold: number }[];
    const hitThresholds = new Set(rows.map(r => r.threshold));

    return {
      25: hitThresholds.has(25),
      40: hitThresholds.has(40),
      55: hitThresholds.has(55),
    };
  }

  /**
   * Check if a specific threshold has been hit
   */
  hasThresholdBeenHit(sessionId: string, threshold: number): boolean {
    const stmt = db.prepare(`
      SELECT 1 FROM goal_threshold_hits WHERE session_id = ? AND threshold = ?
      LIMIT 1
    `);
    return stmt.get(sessionId, threshold) !== undefined;
  }

  /**
   * Clear all data for a session (for testing or cleanup)
   */
  clearSession(sessionId: string): void {
    db.prepare("DELETE FROM goal_summaries WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM goal_threshold_hits WHERE session_id = ?").run(sessionId);
  }

  private rowToGoalSummary(row: any): GoalSummary {
    return {
      id: row.id,
      sessionId: row.session_id,
      threshold: row.threshold,
      coreGoals: JSON.parse(row.core_goals) as CoreGoal[],
      keyMetrics: JSON.parse(row.key_metrics) as KeyMetric[],
      userMessages: JSON.parse(row.user_messages) as string[],
      assistantMessages: JSON.parse(row.assistant_messages) as string[],
      createdAt: row.created_at,
    };
  }
}

// Singleton instance for use across the extension
export const goalStorage = new GoalStorage();
