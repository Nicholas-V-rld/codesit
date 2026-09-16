/*
 * CodeSit — submissions & access control
 * --------------------------------------
 *  POST /api/submit                 student saves/submits a solution
 *  GET  /api/submissions            student's own submissions
 *  GET  /api/lecturer/submissions   ONLY this lecturer's dept + taught levels
 *  GET  /api/lecturer/stats         per-level counts for the dashboard
 *
 * The lecturer routes are where department + level scoping is enforced. The
 * filtering is done inside the SQL query on the server, so a lecturer can only
 * ever receive submissions they are allowed to see — it cannot be bypassed
 * from the browser.
 */

const db = require("../db");
const { asyncRouter } = require("../lib/router");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ROLES } = require("../config");
const { runCode } = require("../services/executor");

const router = asyncRouter();

/*
 * ---- Student: submit ----
 * The output stored against a submission is produced by running the code here,
 * on the server. The browser's idea of what the program printed is ignored
 * completely: a student who edits the page, or the request on its way out,
 * still cannot record an output their program did not actually produce.
 */
router.post("/submit", requireAuth, async (req, res) => {
  const user = await db.get("SELECT role FROM users WHERE id = ?", [req.session.userId]);
  if (!user || user.role !== ROLES.STUDENT)
    return res.status(403).json({ error: "Only students can submit." });

  const { code, language } = req.body || {};
  if (!code || !code.trim()) return res.status(400).json({ error: "There is no code to submit." });
  if (!language) return res.status(400).json({ error: "Choose a language." });

  // HTML is rendered in the browser rather than executed, so there is no
  // output to verify and nothing to gain by faking one.
  let output = "";
  let stderr = "";
  let status = "submitted";

  if (language !== "html") {
    const result = await runCode(code, language);
    output = result.output || result.stdout || "";
    stderr = result.stderr || "";
    // A run we could not perform is recorded as such rather than as a pass.
    if (result.note && !output && !stderr) {
      output = "";
      stderr = result.note;
      status = "error";
    } else if (!result.ok) {
      status = "error";
    }
  }

  const id = await db.insert(`
    INSERT INTO submissions (user_id, title, language, code, output, stderr, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    req.session.userId,
    (req.body.title || "").trim(),
    language,
    code,
    output,
    stderr,
    status,
  ]);
  res.json({ ok: true, id, status, output, stderr });
});

// ---- Student: my submissions ----
router.get("/submissions", requireAuth, async (req, res) => {
  const rows = await db.all(`
    SELECT id, title, language, output, stderr, status, submitted_at
    FROM submissions WHERE user_id = ? ORDER BY submitted_at DESC, id DESC
  `, [req.session.userId]);
  res.json(rows);
});

/*
 * ---- Lecturer: scoped submissions ----
 * Returns submissions authored by students who are (a) in the lecturer's
 * department AND (b) at one of the levels the lecturer teaches. An optional
 * ?level= filter narrows further, but never widens beyond the allowed set.
 */
router.get("/lecturer/submissions", requireAuth, requireRole(ROLES.LECTURER), async (req, res) => {
  const lecturer = await db.get("SELECT department FROM users WHERE id = ?", [req.session.userId]);
  const levels = (await db.all("SELECT level FROM lecturer_levels WHERE lecturer_id = ?", [req.session.userId]))
    .map((r) => r.level);

  if (levels.length === 0) return res.json([]); // teaches nothing yet

  // Optional narrowing filter, only honoured if it is within the allowed set.
  let allowed = levels;
  if (req.query.level && levels.includes(req.query.level)) allowed = [req.query.level];

  const placeholders = allowed.map(() => "?").join(",");
  const rows = await db.all(`
    SELECT s.id, s.title, s.language, s.output, s.stderr, s.status, s.submitted_at,
           s.code, u.full_name, u.username, u.matric_number, u.department, u.level
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    WHERE u.role = 'student'
      AND u.department = ?
      AND u.level IN (${placeholders})
    ORDER BY s.submitted_at DESC, s.id DESC
  `, [lecturer.department, ...allowed]);

  res.json(rows);
});

// ---- Lecturer: statistics by level ----
router.get("/lecturer/stats", requireAuth, requireRole(ROLES.LECTURER), async (req, res) => {
  const lecturer = await db.get("SELECT department FROM users WHERE id = ?", [req.session.userId]);
  const levels = (await db.all("SELECT level FROM lecturer_levels WHERE lecturer_id = ?", [req.session.userId]))
    .map((r) => r.level);

  const perLevel = await Promise.all(levels.map(async (level) => {
    const students = (await db.get(
      "SELECT COUNT(*) AS n FROM users WHERE role='student' AND department=? AND level=?",
      [lecturer.department, level]
    )).n;
    const submissions = (await db.get(`
      SELECT COUNT(*) AS n FROM submissions s JOIN users u ON s.user_id = u.id
      WHERE u.role='student' AND u.department=? AND u.level=?
    `, [lecturer.department, level])).n;
    return { level, students, submissions };
  }));

  res.json({
    department: lecturer.department,
    levels,
    perLevel,
    totalStudents: perLevel.reduce((a, b) => a + b.students, 0),
    totalSubmissions: perLevel.reduce((a, b) => a + b.submissions, 0),
  });
});

module.exports = router;
