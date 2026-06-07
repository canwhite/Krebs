import { Database } from "bun:sqlite";
import { join } from "path";

export interface SessionMeta {
  id: string;
  session_id: string;
  first_question: string;
  file_path: string;
  created_at: number;
}

const dbPath = join(import.meta.dir, "sessions.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions_meta (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    first_question TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

export function saveSessionMeta(sessionId: string, firstQuestion: string, filePath: string) {
  const id = `${Date.now()}_${sessionId}`;
  const stmt = db.prepare(`
    INSERT INTO sessions_meta (id, session_id, first_question, file_path, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, sessionId, firstQuestion, filePath, Date.now());
}

export function getAllSessions(): SessionMeta[] {
  const stmt = db.prepare(`
    SELECT id, session_id, first_question, file_path, created_at
    FROM sessions_meta
    ORDER BY created_at DESC
  `);
  return stmt.all() as SessionMeta[];
}

export function getSessionById(id: string): SessionMeta | undefined {
  const stmt = db.prepare(`
    SELECT id, session_id, first_question, file_path, created_at
    FROM sessions_meta
    WHERE id = ? OR session_id = ?
    LIMIT 1
  `);
  return stmt.get(id, id) as SessionMeta | undefined;
}

export function deleteSessionFromDb(sessionId: string): boolean {
  try {
    const stmt = db.prepare('DELETE FROM sessions_meta WHERE session_id = ?');
    const result = stmt.run(sessionId);
    return result.changes > 0;
  } catch (error) {
    console.error('Failed to delete session from database:', error);
    return false;
  }
}
