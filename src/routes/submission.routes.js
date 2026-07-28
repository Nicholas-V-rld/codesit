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

const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ROLES } = require("../config");

const router = express.Router();

// ---- Student: submit ----
router.post("/submit", requireAuth, (req, res) => {
  const user = db.prepare("SELECT role FROM users WHERE id = ?").get(req.session.userId);
  if (!user || user.role !== ROLES.STUDENT)
    return res.status(403).json({ error: "Only students can submit." });

  const { code, language } = req.body || {};
  if (!code || !code.trim()) return res.status(400).json({ error: "There is no code to submit." });
  if (!language) return res.status(400).json({ error: "Choose a language." });

  const info = db.prepare(`
    INSERT INTO submissions (user_id, title, language, code, output, stderr, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.session.userId,
    (req.body.title || "").trim(),
    language,
    code,
    req.body.output || "",
    req.body.stderr || "",
    req.body.status === "error" ? "error" : "submitted"
  );
  res.json({ ok: true, id: info.lastInsertRowid });
});

// ---- Student: my submissions ----
router.get("/submissions", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, title, language, output, stderr, status, submitted_at
    FROM submissions WHERE user_id = ? ORDER BY submitted_at DESC
  `).all(req.session.userId);
  res.json(rows);
});

/*
 * ---- Lecturer: scoped submissions ----
 * Returns submissions authored by students who are (a) in the lecturer's
 * department AND (b) at one of the levels the lecturer teaches. An optional
 * ?level= filter narrows further, but never widens beyond the allowed set.
 */
router.get("/lecturer/submissions", requireAuth, requireRole(ROLES.LECTURER), (req, res) => {
  const lecturer = db.prepare("SELECT department FROM users WHERE id = ?").get(req.session.userId);
  const levels = db.prepare("SELECT level FROM lecturer_levels WHERE lecturer_id = ?")
    .all(req.session.userId).map((r) => r.level);

  if (levels.length === 0) return res.json([]); // teaches nothing yet

  // Optional narrowing filter, only honoured if it is within the allowed set.
  let allowed = levels;
  if (req.query.level && levels.includes(req.query.level)) allowed = [req.query.level];

  const placeholders = allowed.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT s.id, s.title, s.language, s.output, s.stderr, s.status, s.submitted_at,
           s.code, u.full_name, u.username, u.matric_number, u.department, u.level
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    WHERE u.role = 'student'
      AND u.department = ?
      AND u.level IN (${placeholders})
    ORDER BY s.submitted_at DESC
  `).all(lecturer.department, ...allowed);

  res.json(rows);
});

// ---- Lecturer: statistics by level ----
router.get("/lecturer/stats", requireAuth, requireRole(ROLES.LECTURER), (req, res) => {
  const lecturer = db.prepare("SELECT department FROM users WHERE id = ?").get(req.session.userId);
  const levels = db.prepare("SELECT level FROM lecturer_levels WHERE lecturer_id = ?")
    .all(req.session.userId).map((r) => r.level);

  const perLevel = levels.map((level) => {
    const students = db.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE role='student' AND department=? AND level=?"
    ).get(lecturer.department, level).n;
    const submissions = db.prepare(`
      SELECT COUNT(*) AS n FROM submissions s JOIN users u ON s.user_id = u.id
      WHERE u.role='student' AND u.department=? AND u.level=?
    `).get(lecturer.department, level).n;
    return { level, students, submissions };
  });

  res.json({
    department: lecturer.department,
    levels,
    perLevel,
    totalStudents: perLevel.reduce((a, b) => a + b.students, 0),
    totalSubmissions: perLevel.reduce((a, b) => a + b.submissions, 0),
  });
});

module.exports = router;
