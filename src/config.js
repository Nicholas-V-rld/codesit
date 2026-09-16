/*
 * CodeSit — central configuration
 * -------------------------------
 * Everything that might change lives here so the rest of the code can stay
 * clean. Values can be overridden with environment variables at launch, e.g.
 *   PORT=4000 EXECUTOR=piston npm start
 */

const path = require("path");

module.exports = {
  // --- Server ---
  PORT: process.env.PORT || 3000,
  SESSION_SECRET: process.env.SESSION_SECRET || "codesit-dev-secret-change-me",
  // Vercel serves every deployment (previews included) over HTTPS behind its
  // proxy, so it counts as production for cookies even without NODE_ENV.
  IS_PRODUCTION: process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL),
  ON_VERCEL: Boolean(process.env.VERCEL),

  // --- Database ---
  // With DATABASE_URL set (a hosted deployment), PostgreSQL is used; without
  // it, a local SQLite file at DB_PATH. See src/db.js.
  DATABASE_URL: process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
  PG_SCHEMA: process.env.PG_SCHEMA || "",
  DB_PATH: process.env.DB_PATH || path.join(__dirname, "..", "database", "codesit.db"),

  // --- Roles and accounts ---
  ROLES: { STUDENT: "student", LECTURER: "lecturer", ADMIN: "admin" },
  STATUSES: { ACTIVE: "active", PENDING: "pending", SUSPENDED: "suspended" },
  /*
   * A lecturer can see every student in their department and levels, so by
   * default a self-registered lecturer account waits for an administrator to
   * approve it. Set LECTURER_APPROVAL=off to let lecturers in straight away.
   */
  LECTURER_APPROVAL: !/^(off|false|0|no)$/i.test(process.env.LECTURER_APPROVAL || ""),
  /*
   * The first administrator. When both are set and no account has that
   * username yet, it is created as an administrator on startup. Changing the
   * password later (on the admin page) is not undone by this.
   */
  ADMIN_USERNAME: (process.env.ADMIN_USERNAME || "").trim().toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",

  /*
   * Academic structure.
   * CodeSit is built for a polytechnic, so levels are ND/HND, not 100–400.
   * `value` is stored in the database; `label` is what people see.
   */
  DEPARTMENTS: [
    "Computer Science",
    "Computer Engineering",
    "Electrical/Electronic Engineering",
    "Information Technology",
    "Science Laboratory Technology",
    "Mechanical Engineering",
  ],
  LEVELS: [
    { value: "ND1", label: "ND I" },
    { value: "ND2", label: "ND II" },
    { value: "HND1", label: "HND I" },
    { value: "HND2", label: "HND II" },
  ],

  /*
   * Languages students can write in.
   * `piston` / `wandbox` map our id to what each execution engine expects.
   * `html` is special: it is previewed in a sandboxed iframe in the browser
   * and never sent to a server engine.
   */
  LANGUAGES: [
    { id: "python", label: "Python", monaco: "python", piston: "python", wandboxLang: "Python", wandboxPrefix: "cpython-3" },
    { id: "javascript", label: "JavaScript (Node)", monaco: "javascript", piston: "javascript", wandboxLang: "JavaScript", wandboxPrefix: "nodejs" },
    { id: "java", label: "Java", monaco: "java", piston: "java", wandboxLang: "Java", wandboxPrefix: "openjdk" },
    { id: "cpp", label: "C++", monaco: "cpp", piston: "c++", wandboxLang: "C++", wandboxPrefix: "gcc" },
    { id: "c", label: "C", monaco: "c", piston: "c", wandboxLang: "C", wandboxPrefix: "gcc" },
    { id: "html", label: "HTML (preview)", monaco: "html", piston: null, wandboxLang: null, wandboxPrefix: null },
  ],

  /*
   * Code execution engine.
   * ----------------------
   * Student code never runs inside the CodeSit process itself; it always goes
   * to a separate runner. There are four, and the trade-off between them is
   * worth knowing:
   *
   *   local (default) — runs on this machine as a separate, short-lived
   *     process in a temp directory, killed on a timeout and with its output
   *     capped. Nothing to install, no account, no internet, so "Run" and
   *     automatic marking work immediately. It is NOT a security sandbox: use
   *     it for development and for a lecturer's own lab machine.
   *
   *   piston — a real sandbox for a self-hosted deployment. The public
   *     endpoint (emkc.org) stopped being freely available on 15 Feb 2026,
   *     so self-host it:
   *       docker run -d -p 2000:2000 ghcr.io/engineer-man/piston
   *       EXECUTOR=piston PISTON_URL=http://localhost:2000/api/v2/piston npm start
   *
   *   wandbox — a free public sandbox needing no key. Convenient, but it is a
   *     shared community service and has outages.
   *
   *   sandbox — Vercel Sandbox: a Firecracker microVM with no network access,
   *     separate from the web server, its database and its secrets. The
   *     default when deployed on Vercel. See src/services/vercel-sandbox.js.
   */
  /*
   * Which engine runs student code. "local" is the default so that a fresh
   * clone works with nothing to install and no internet: see the note above.
   * For a deployment where students' code cannot be trusted, run a sandbox
   * (self-hosted Piston) and set EXECUTOR=piston.
   */
  EXECUTOR: process.env.EXECUTOR || (process.env.VERCEL ? "sandbox" : "local"), // "local" | "sandbox" | "piston" | "wandbox"
  SANDBOX_NAME: process.env.SANDBOX_NAME || "codesit-runner",
  PISTON_URL: process.env.PISTON_URL || "https://emkc.org/api/v2/piston",
  PISTON_TOKEN: process.env.PISTON_TOKEN || "",
  WANDBOX_URL: process.env.WANDBOX_URL || "https://wandbox.org/api",

  // Safety limits for execution
  RUN_TIMEOUT_MS: Number(process.env.RUN_TIMEOUT_MS) || 8000,
  // How much of a program's output we keep before truncating (per stream).
  OUTPUT_CAP_BYTES: Number(process.env.OUTPUT_CAP_BYTES) || 64 * 1024,
};
