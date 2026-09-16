/*
 * CodeSit — database layer
 * ------------------------
 * One small async interface over two databases:
 *
 *   • SQLite (better-sqlite3) — the default. The database is a single file on
 *     disk (database/codesit.db) created the first time the app runs, so a
 *     fresh clone needs no database server at all.
 *
 *   • PostgreSQL (pg) — used whenever DATABASE_URL is set. This is what a
 *     hosted deployment needs: serverless functions have no durable disk and
 *     run as many short-lived copies at once, so they must share one database
 *     server (Neon, on Vercel).
 *
 * Every route talks to the same five calls, written with `?` placeholders:
 *
 *   await db.get(sql, params)      first row, or undefined
 *   await db.all(sql, params)      every row
 *   await db.run(sql, params)      { changes }
 *   await db.insert(sql, params)   the new row's id
 *   await db.transaction(async (tx) => { ... tx.get / tx.run ... })
 *
 * The SQL itself is kept to the part the two dialects share (both support
 * ON CONFLICT and RETURNING), so there is exactly one copy of every query.
 * The schema is created on first use, before the first query runs.
 */

const fs = require("fs");
const path = require("path");
const { DB_PATH, DATABASE_URL, PG_SCHEMA } = require("./config");

const DIALECT = DATABASE_URL ? "postgres" : "sqlite";

// A serverless deployment has no disk that survives between requests, so a
// SQLite file there would silently lose every account and exam. Refuse
// clearly instead.
if (DIALECT === "sqlite" && process.env.VERCEL) {
  throw new Error("DATABASE_URL is not set. On Vercel, CodeSit needs a PostgreSQL database (e.g. Neon from the Vercel Marketplace).");
}

// Column types that differ between the two dialects.
const T = DIALECT === "postgres"
  ? {
      id: "SERIAL PRIMARY KEY",
      real: "DOUBLE PRECISION",
      datetime: "TEXT",
      // Same text format SQLite's CURRENT_TIMESTAMP produces (UTC, no zone).
      now: "TEXT DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')",
    }
  : {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      real: "REAL",
      datetime: "DATETIME",
      now: "DATETIME DEFAULT CURRENT_TIMESTAMP",
    };

const SCHEMA = `
  -- Every account (both students and lecturers) lives in one table,
  -- distinguished by the "role" column.
  CREATE TABLE IF NOT EXISTS users (
    id            ${T.id},
    username      TEXT UNIQUE NOT NULL,
    password      TEXT NOT NULL,               -- stored hashed, never plain
    role          TEXT NOT NULL CHECK (role IN ('student','lecturer')),
    full_name     TEXT NOT NULL DEFAULT '',
    matric_number TEXT DEFAULT '',             -- students
    staff_id      TEXT DEFAULT '',             -- lecturers
    department    TEXT NOT NULL DEFAULT '',
    level         TEXT DEFAULT '',             -- students only (ND1/ND2/HND1/HND2)
    created_at    ${T.now}
  );

  -- A lecturer can teach several levels, so the teaching assignment is its
  -- own table (a many-to-many link between a lecturer and levels).
  CREATE TABLE IF NOT EXISTS lecturer_levels (
    id          ${T.id},
    lecturer_id INTEGER NOT NULL,
    level       TEXT NOT NULL,
    UNIQUE (lecturer_id, level),
    FOREIGN KEY (lecturer_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Each time a student runs-and-saves or submits, a row is stored here.
  CREATE TABLE IF NOT EXISTS submissions (
    id           ${T.id},
    user_id      INTEGER NOT NULL,
    title        TEXT DEFAULT '',              -- e.g. "Question 1"
    language     TEXT NOT NULL,
    code         TEXT NOT NULL,
    output       TEXT DEFAULT '',
    stderr       TEXT DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'submitted', -- 'submitted' | 'error'
    submitted_at ${T.now},
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_dept_level ON users(department, level);

  -- ======================================================================
  -- The exam engine
  -- ======================================================================
  -- An exam is authored by one lecturer and targeted at exactly one
  -- department + level pair. That pairing is what ties the exam engine to
  -- the access-control rule the rest of the app already enforces: a
  -- lecturer may only ever author an exam for a level they actually teach,
  -- and a student may only ever see exams matching their own dept + level.
  CREATE TABLE IF NOT EXISTS exams (
    id            ${T.id},
    lecturer_id   INTEGER NOT NULL,
    title         TEXT NOT NULL,
    instructions  TEXT DEFAULT '',
    department    TEXT NOT NULL,
    level         TEXT NOT NULL,
    duration_mins INTEGER NOT NULL DEFAULT 60,
    published     INTEGER NOT NULL DEFAULT 0,   -- 0 = draft, 1 = open to students
    created_at    ${T.now},
    FOREIGN KEY (lecturer_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- One question inside an exam. Each question fixes the language, so a
  -- student cannot answer a Python question in HTML to dodge the grader.
  CREATE TABLE IF NOT EXISTS questions (
    id           ${T.id},
    exam_id      INTEGER NOT NULL,
    prompt       TEXT NOT NULL,
    language     TEXT NOT NULL,
    starter_code TEXT DEFAULT '',
    position     INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
  );

  -- The marking scheme. Each case feeds stdin to the program and compares
  -- what comes back with expected_output. Hidden cases are never sent to
  -- the student's browser, so they cannot hard-code the answers.
  CREATE TABLE IF NOT EXISTS test_cases (
    id              ${T.id},
    question_id     INTEGER NOT NULL,
    stdin           TEXT DEFAULT '',
    expected_output TEXT NOT NULL,
    hidden          INTEGER NOT NULL DEFAULT 0,
    points          INTEGER NOT NULL DEFAULT 1,
    position        INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );

  -- One student's sitting of one exam. started_at is written by the
  -- server and is what the countdown is measured from -- the clock is
  -- server-authoritative, so closing the laptop does not buy extra time.
  CREATE TABLE IF NOT EXISTS attempts (
    id           ${T.id},
    exam_id      INTEGER NOT NULL,
    user_id      INTEGER NOT NULL,
    started_at   ${T.now},
    submitted_at ${T.datetime},
    status       TEXT NOT NULL DEFAULT 'in_progress',  -- 'in_progress' | 'submitted'
    total_score  ${T.real} NOT NULL DEFAULT 0,
    max_score    ${T.real} NOT NULL DEFAULT 0,
    auto_closed  INTEGER NOT NULL DEFAULT 0,  -- 1 = time ran out, submitted for them
    UNIQUE (exam_id, user_id),
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- A student's code for one question. output and stderr here are
  -- always produced by the server running the code itself at grading time,
  -- never copied from anything the browser sent.
  CREATE TABLE IF NOT EXISTS answers (
    id           ${T.id},
    attempt_id   INTEGER NOT NULL,
    question_id  INTEGER NOT NULL,
    code         TEXT NOT NULL DEFAULT '',
    score        ${T.real} NOT NULL DEFAULT 0,
    max_score    ${T.real} NOT NULL DEFAULT 0,
    passed_count INTEGER NOT NULL DEFAULT 0,
    total_count  INTEGER NOT NULL DEFAULT 0,
    report       TEXT DEFAULT '',   -- JSON: per-test-case result, for the review screen
    grade_note   TEXT DEFAULT '',   -- set when auto-grading could not run
    graded_at    ${T.datetime},
    updated_at   ${T.now},
    UNIQUE (attempt_id, question_id),
    FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_exams_scope ON exams(department, level, published);
  CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id, position);
  CREATE INDEX IF NOT EXISTS idx_testcases_q ON test_cases(question_id, position);
  CREATE INDEX IF NOT EXISTS idx_attempts_exam ON attempts(exam_id);
  CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers(attempt_id);

  -- Login sessions. Kept in the database rather than in memory, so neither a
  -- server restart nor a different serverless instance answering the next
  -- request logs a student out mid-exam. expires is milliseconds since 1970.
  CREATE TABLE IF NOT EXISTS app_sessions (
    sid     TEXT PRIMARY KEY,
    sess    TEXT NOT NULL,
    expires BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_app_sessions_expires ON app_sessions(expires);
`;

// ===========================================================================
// SQLite
// ===========================================================================
function sqliteDriver() {
  const Database = require("better-sqlite3");
  // Make sure the /database folder exists before opening the file.
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");

  // Preparing a statement is the expensive part; reuse them by SQL text.
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = conn.prepare(sql); cache.set(sql, s); }
    return s;
  };

  /*
   * better-sqlite3 is synchronous, so each call below has finished before its
   * promise even resolves. That is what makes BEGIN/COMMIT safe here: a
   * transaction body that only awaits these calls runs to completion without
   * any other request's queries slipping in between.
   */
  const q = {
    get: async (sql, params) => stmt(sql).get(...params),
    all: async (sql, params) => stmt(sql).all(...params),
    run: async (sql, params) => ({ changes: stmt(sql).run(...params).changes }),
  };

  return {
    ...q,
    exec: async (sql) => conn.exec(sql),
    async transaction(fn) {
      conn.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn(q);
        conn.exec("COMMIT");
        return result;
      } catch (err) {
        if (conn.inTransaction) conn.exec("ROLLBACK");
        throw err;
      }
    },
    async migrate() {
      // Databases made by an older build: add any users columns they lack.
      const cols = conn.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
      const add = (name, def) => {
        if (!cols.includes(name)) {
          try { conn.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`); } catch (_) {}
        }
      };
      add("full_name", "TEXT NOT NULL DEFAULT ''");
      add("matric_number", "TEXT DEFAULT ''");
      add("staff_id", "TEXT DEFAULT ''");
      add("department", "TEXT NOT NULL DEFAULT ''");
      add("level", "TEXT DEFAULT ''");
    },
    close: async () => conn.close(),
  };
}

// ===========================================================================
// PostgreSQL
// ===========================================================================
function postgresDriver() {
  const pg = require("pg");
  // COUNT(*) and SUM(integer) come back as 64-bit integers, which pg returns
  // as strings to avoid losing precision. Every count here is small, so read
  // them as ordinary numbers — the same thing SQLite gives back.
  pg.types.setTypeParser(20, (v) => Number(v));   // int8
  pg.types.setTypeParser(1700, (v) => Number(v)); // numeric

  const pool = new pg.Pool({
    // sslmode=require already means full certificate verification in pg 8;
    // saying so explicitly keeps that behaviour when pg 9 changes the meaning.
    connectionString: DATABASE_URL.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/, "$1verify-full"),
    max: Number(process.env.PG_POOL_MAX) || 5,
    idleTimeoutMillis: 5000,
  });
  // An idle connection the server drops must not crash the process.
  pool.on("error", (err) => console.error("[db] idle connection error:", err.message));
  if (PG_SCHEMA) {
    // Tests isolate themselves in their own schema on a shared database.
    pool.on("connect", (client) => client.query(`SET search_path TO "${PG_SCHEMA}"`));
  }
  try {
    // On Vercel, let the platform close idle connections before a function
    // instance is suspended, so they are not leaked.
    require("@vercel/functions").attachDatabasePool(pool);
  } catch (_) {}

  // `?` → `$1, $2, …`, skipping anything inside a quoted string literal.
  const cache = new Map();
  const toPg = (sql) => {
    let out = cache.get(sql);
    if (out) return out;
    let n = 0;
    let inQuote = false;
    out = "";
    for (const ch of sql) {
      if (ch === "'") inQuote = !inQuote;
      out += ch === "?" && !inQuote ? `$${++n}` : ch;
    }
    cache.set(sql, out);
    return out;
  };

  const on = (client) => ({
    get: async (sql, params) => (await client.query(toPg(sql), params)).rows[0],
    all: async (sql, params) => (await client.query(toPg(sql), params)).rows,
    run: async (sql, params) => ({ changes: (await client.query(toPg(sql), params)).rowCount }),
  });

  return {
    ...on(pool),
    exec: async (sql) => { await pool.query(sql); },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(on(client));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        throw err;
      } finally {
        client.release();
      }
    },
    async migrate() {},
    // Several serverless instances can cold-start at the same moment; an
    // advisory lock stops them racing each other to create the same tables.
    async createSchema(sql) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(724100)");
        if (PG_SCHEMA) await client.query(`CREATE SCHEMA IF NOT EXISTS "${PG_SCHEMA}"; SET LOCAL search_path TO "${PG_SCHEMA}"`);
        await client.query(sql);
        await client.query("COMMIT");
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

// ===========================================================================
// The shared interface
// ===========================================================================
const driver = DIALECT === "postgres" ? postgresDriver() : sqliteDriver();

let readyPromise = null;
function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (driver.createSchema) await driver.createSchema(SCHEMA);
      else await driver.exec(SCHEMA);
      await driver.migrate();
    })().catch((err) => {
      readyPromise = null; // let the next request try again
      throw err;
    });
  }
  return readyPromise;
}

const withReady = (fn) => async (sql, params = []) => {
  await ready();
  return fn(sql, params);
};

const db = {
  dialect: DIALECT,
  ready,
  get: withReady(driver.get),
  all: withReady(driver.all),
  run: withReady(driver.run),
  // INSERT … RETURNING id works in both dialects and gives back the new id.
  insert: withReady(async (sql, params) => (await driver.get(`${sql} RETURNING id`, params)).id),
  async transaction(fn) {
    await ready();
    return driver.transaction((q) => fn({
      ...q,
      insert: async (sql, params = []) => (await q.get(`${sql} RETURNING id`, params)).id,
    }));
  },
  close: () => driver.close(),
};

/*
 * Did this write fail because a UNIQUE rule already holds that value (a
 * username taken, an attempt already started)? Both drivers say so
 * differently.
 */
db.isUniqueViolation = (err) =>
  Boolean(err) && (err.code === "23505" || err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "SQLITE_CONSTRAINT_PRIMARYKEY");

module.exports = db;
