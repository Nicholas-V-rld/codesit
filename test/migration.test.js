/*
 * Upgrading a SQLite database made before administrators existed.
 *
 * The users table's CHECK rule has to change, and SQLite can only do that by
 * rebuilding the table. Every other table points at users with ON DELETE
 * CASCADE, so a careless rebuild would wipe every exam and marked paper.
 * This builds a database the way the old version did, fills it, upgrades it,
 * and checks nothing was lost.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { dbFile } = require("./support/helpers");

if (process.env.TEST_DATABASE_URL) {
  test("SQLite-only migration test skipped under PostgreSQL", () => {});
} else {
  test("an old database keeps every row when it gains the admin role", async () => {
    const Database = require("better-sqlite3");
    const old = new Database(dbFile);
    old.pragma("foreign_keys = ON");
    old.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('student','lecturer')),
        full_name TEXT NOT NULL DEFAULT '',
        matric_number TEXT DEFAULT '',
        staff_id TEXT DEFAULT '',
        department TEXT NOT NULL DEFAULT '',
        level TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT, lecturer_id INTEGER NOT NULL, title TEXT NOT NULL,
        instructions TEXT DEFAULT '', department TEXT NOT NULL, level TEXT NOT NULL,
        duration_mins INTEGER NOT NULL DEFAULT 60, published INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lecturer_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP, submitted_at DATETIME,
        status TEXT NOT NULL DEFAULT 'in_progress', total_score REAL NOT NULL DEFAULT 0,
        max_score REAL NOT NULL DEFAULT 0, auto_closed INTEGER NOT NULL DEFAULT 0,
        UNIQUE (exam_id, user_id),
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO users (username, password, role, department, level) VALUES ('lec', 'x', 'lecturer', 'Computer Science', '');
      INSERT INTO users (username, password, role, department, level) VALUES ('stu', 'x', 'student', 'Computer Science', 'ND1');
      INSERT INTO exams (lecturer_id, title, department, level, published) VALUES (1, 'Old exam', 'Computer Science', 'ND1', 1);
      INSERT INTO attempts (exam_id, user_id, status, total_score, max_score) VALUES (1, 2, 'submitted', 7, 10);
    `);
    old.close();

    const db = require("../src/db");
    await db.ready();

    assert.equal((await db.get("SELECT COUNT(*) AS n FROM users")).n, 2);
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM exams")).n, 1);
    const attempt = await db.get("SELECT * FROM attempts");
    assert.equal(attempt.total_score, 7);
    assert.equal((await db.get("SELECT status FROM users WHERE username = 'stu'")).status, "active");

    await db.run("INSERT INTO users (username, password, role) VALUES ('boss', 'x', 'admin')");
    await assert.rejects(db.run("INSERT INTO users (username, password, role) VALUES ('bad', 'x', 'superuser')"));

    // Foreign keys still enforced and still cascading after the rebuild.
    await assert.rejects(db.run("INSERT INTO exams (lecturer_id, title, department, level) VALUES (999, 't', 'd', 'l')"));
    await db.run("DELETE FROM users WHERE username = 'stu'");
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM attempts")).n, 0);
    await db.close();
  });
}
