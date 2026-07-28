/*
 * CodeSit — database layer
 * ------------------------
 * Uses SQLite through better-sqlite3. The database is a single file on disk
 * (database/codesit.db) that is created automatically the first time the app
 * runs, so there is no separate database server to install.
 *
 * This module (1) opens the connection, (2) creates the tables if they do not
 * exist, and (3) runs a small migration so that databases created by an older
 * version gain any new columns without losing their data.
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { DB_PATH } = require("./config");

// Make sure the /database folder exists before opening the file.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function createSchema() {
  db.exec(`
    -- Every account (both students and lecturers) lives in one table,
    -- distinguished by the "role" column.
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password      TEXT NOT NULL,               -- stored hashed, never plain
      role          TEXT NOT NULL CHECK (role IN ('student','lecturer')),
      full_name     TEXT NOT NULL DEFAULT '',
      matric_number TEXT DEFAULT '',             -- students
      staff_id      TEXT DEFAULT '',             -- lecturers
      department    TEXT NOT NULL DEFAULT '',
      level         TEXT DEFAULT '',             -- students only (ND1/ND2/HND1/HND2)
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- A lecturer can teach several levels, so the teaching assignment is its
    -- own table (a many-to-many link between a lecturer and levels).
    CREATE TABLE IF NOT EXISTS lecturer_levels (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      lecturer_id INTEGER NOT NULL,
      level       TEXT NOT NULL,
      UNIQUE (lecturer_id, level),
      FOREIGN KEY (lecturer_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Each time a student runs-and-saves or submits, a row is stored here.
    CREATE TABLE IF NOT EXISTS submissions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      title        TEXT DEFAULT '',              -- e.g. "Question 1"
      language     TEXT NOT NULL,
      code         TEXT NOT NULL,
      output       TEXT DEFAULT '',
      stderr       TEXT DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'submitted', -- 'submitted' | 'error'
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_dept_level ON users(department, level);
  `);
}

/*
 * Migration: if this database was made by an older build, add any columns it
 * is missing. ALTER TABLE ADD COLUMN is safe to attempt; we swallow the error
 * that occurs when the column already exists.
 */
function migrate() {
  const cols = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
  const add = (name, def) => {
    if (!cols.includes(name)) {
      try { db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`); } catch (_) {}
    }
  };
  add("full_name", "TEXT NOT NULL DEFAULT ''");
  add("matric_number", "TEXT DEFAULT ''");
  add("staff_id", "TEXT DEFAULT ''");
  add("department", "TEXT NOT NULL DEFAULT ''");
  add("level", "TEXT DEFAULT ''");
}

createSchema();
migrate();

module.exports = db;
