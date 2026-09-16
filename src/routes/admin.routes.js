/*
 * CodeSit — administration
 * ------------------------
 * Everything an administrator can do. Administrators are a third role,
 * alongside students and lecturers, and every route here requires it.
 *
 *   GET    /api/admin/overview               counts across the whole system
 *   GET    /api/admin/users?role=&status=&q=  every account, filterable
 *   POST   /api/admin/users                  create an account (any role)
 *   PUT    /api/admin/users/:id              edit name, department, levels…
 *   POST   /api/admin/users/:id/status       approve, suspend or reactivate
 *   POST   /api/admin/users/:id/password     set a new password
 *   DELETE /api/admin/users/:id              delete an account with no exam records
 *   GET    /api/admin/exams                  every exam, from every lecturer
 *   POST   /api/admin/exams/:id/unpublish    take an exam offline
 *
 * WHY THIS EXISTS
 * ---------------
 * A lecturer can read the work of every student in their department and
 * levels, and both are chosen at registration. Without someone to check
 * those claims, anyone could register as a lecturer for any department. So
 * new lecturer accounts start as "pending" and an administrator approves
 * them here (see LECTURER_APPROVAL in config.js).
 *
 * Two guard rails:
 *   • An administrator cannot suspend, delete or demote themselves, so the
 *     system always keeps at least the administrator making the change.
 *   • An account with exam records (a lecturer's exams, a student's marked
 *     papers) cannot be deleted — that would silently destroy results.
 *     Suspend it instead.
 */

const bcrypt = require("bcryptjs");
const db = require("../db");
const { asyncRouter } = require("../lib/router");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ROLES, STATUSES, DEPARTMENTS, LEVELS } = require("../config");

const router = asyncRouter();
const adminOnly = [requireAuth, requireRole(ROLES.ADMIN)];
const validLevels = LEVELS.map((l) => l.value);
const MIN_PASSWORD = 8;

// Every row a user list needs, including what decides whether it can be deleted.
const USER_COLUMNS = `
  u.id, u.username, u.role, u.full_name, u.matric_number, u.staff_id,
  u.department, u.level, u.status, u.created_at,
  (SELECT COUNT(*) FROM exams e WHERE e.lecturer_id = u.id) AS exam_count,
  (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id) AS attempt_count
`;

async function withLevels(users) {
  const ids = users.filter((u) => u.role === ROLES.LECTURER).map((u) => u.id);
  if (!ids.length) return users.map((u) => ({ ...u, levels: [] }));
  const rows = await db.all(
    `SELECT lecturer_id, level FROM lecturer_levels WHERE lecturer_id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  const byId = new Map();
  for (const r of rows) byId.set(r.lecturer_id, [...(byId.get(r.lecturer_id) || []), r.level]);
  const order = (l) => validLevels.indexOf(l);
  return users.map((u) => ({ ...u, levels: (byId.get(u.id) || []).sort((a, b) => order(a) - order(b)) }));
}

function findUser(id) {
  return db.get(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [id]);
}

/*
 * End every session a user has open, so a reset password or a suspension
 * applies to devices already signed in. Sessions are stored as JSON with the
 * user's id in them (see session-store.js).
 */
function signOutEverywhere(userId) {
  return db.run(
    "DELETE FROM app_sessions WHERE sess LIKE ? OR sess LIKE ?",
    [`%"userId":${Number(userId)},%`, `%"userId":${Number(userId)}}%`]
  );
}

/*
 * Check the profile fields an administrator may set, for the given role.
 * Returns { error } or the cleaned values.
 */
function validateProfile(b, role) {
  const full_name = String(b.full_name || "").trim();
  if (!full_name) return { error: "Enter a full name." };
  if (role === ROLES.ADMIN) return { full_name, department: "", level: "", levels: [], matric_number: "", staff_id: "" };

  if (!DEPARTMENTS.includes(b.department)) return { error: "Select a valid department." };
  if (role === ROLES.STUDENT) {
    if (!validLevels.includes(b.level)) return { error: "Select the student's level." };
    return {
      full_name, department: b.department, level: b.level, levels: [],
      matric_number: String(b.matric_number || "").trim(), staff_id: "",
    };
  }
  const levels = [...new Set((Array.isArray(b.teaching_levels) ? b.teaching_levels : []).filter((l) => validLevels.includes(l)))];
  if (!levels.length) return { error: "Select at least one level the lecturer teaches." };
  return {
    full_name, department: b.department, level: "", levels,
    matric_number: "", staff_id: String(b.staff_id || "").trim(),
  };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
router.get("/admin/overview", adminOnly, async (req, res) => {
  const [byRole, exams, attempts, submissions, byDept] = await Promise.all([
    db.all("SELECT role, status, COUNT(*) AS n FROM users GROUP BY role, status"),
    db.get("SELECT COUNT(*) AS total, COALESCE(SUM(published), 0) AS live FROM exams"),
    db.all("SELECT status, COUNT(*) AS n FROM attempts GROUP BY status"),
    db.get("SELECT COUNT(*) AS n FROM submissions"),
    db.all(`
      SELECT department,
             SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
             SUM(CASE WHEN role = 'lecturer' AND status = 'active' THEN 1 ELSE 0 END) AS lecturers
      FROM users WHERE role <> 'admin' AND department <> ''
      GROUP BY department ORDER BY department
    `),
  ]);

  const count = (role, status) => byRole
    .filter((r) => r.role === role && (!status || r.status === status))
    .reduce((sum, r) => sum + r.n, 0);
  const examsByDept = await db.all("SELECT department, COUNT(*) AS n FROM exams GROUP BY department");
  const examCount = Object.fromEntries(examsByDept.map((r) => [r.department, r.n]));

  res.json({
    students: count(ROLES.STUDENT),
    lecturers: count(ROLES.LECTURER, STATUSES.ACTIVE),
    pendingLecturers: count(ROLES.LECTURER, STATUSES.PENDING),
    suspended: byRole.filter((r) => r.status === STATUSES.SUSPENDED).reduce((s, r) => s + r.n, 0),
    admins: count(ROLES.ADMIN),
    exams: exams.total,
    liveExams: exams.live,
    papersHandedIn: (attempts.find((a) => a.status === "submitted") || { n: 0 }).n,
    sittingNow: (attempts.find((a) => a.status === "in_progress") || { n: 0 }).n,
    practiceSubmissions: submissions.n,
    departments: byDept.map((d) => ({ ...d, exams: examCount[d.department] || 0 })),
  });
});

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
router.get("/admin/users", adminOnly, async (req, res) => {
  const where = [];
  const params = [];
  if (Object.values(ROLES).includes(req.query.role)) {
    where.push("u.role = ?");
    params.push(req.query.role);
  }
  if (Object.values(STATUSES).includes(req.query.status)) {
    where.push("u.status = ?");
    params.push(req.query.status);
  }
  const q = String(req.query.q || "").trim().toLowerCase().slice(0, 80);
  if (q) {
    // Match the text literally: % and _ are escaped so "mr_aluko" is not a pattern.
    const col = (c) => `LOWER(${c}) LIKE ? ESCAPE '!'`;
    where.push(`(${["u.username", "u.full_name", "u.matric_number", "u.staff_id"].map(col).join(" OR ")})`);
    const like = `%${q.replace(/[!%_]/g, (ch) => "!" + ch)}%`;
    params.push(like, like, like, like);
  }
  const rows = await db.all(`
    SELECT ${USER_COLUMNS} FROM users u
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END,
             CASE u.role WHEN 'admin' THEN 0 WHEN 'lecturer' THEN 1 ELSE 2 END,
             u.department, u.full_name, u.username
    LIMIT 500
  `, params);
  res.json(await withLevels(rows));
});

router.post("/admin/users", adminOnly, async (req, res) => {
  const b = req.body || {};
  if (!Object.values(ROLES).includes(b.role))
    return res.status(400).json({ error: "Choose a role." });
  const username = String(b.username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username))
    return res.status(400).json({ error: "Username must be 3–40 characters: letters, numbers, dots, dashes or underscores." });
  const password = String(b.password || "");
  if (password.length < MIN_PASSWORD)
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
  const v = validateProfile(b, b.role);
  if (v.error) return res.status(400).json({ error: v.error });

  const hash = await bcrypt.hash(password, 10);
  try {
    const id = await db.transaction(async (tx) => {
      const userId = await tx.insert(`
        INSERT INTO users (username, password, role, full_name, matric_number, staff_id, department, level, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `, [username, hash, b.role, v.full_name, v.matric_number, v.staff_id, v.department, v.level]);
      for (const lvl of v.levels) {
        await tx.run("INSERT INTO lecturer_levels (lecturer_id, level) VALUES (?, ?) ON CONFLICT DO NOTHING", [userId, lvl]);
      }
      return userId;
    });
    res.json({ ok: true, id });
  } catch (e) {
    if (db.isUniqueViolation(e)) return res.status(409).json({ error: "That username is already taken." });
    throw e;
  }
});

router.put("/admin/users/:id", adminOnly, async (req, res) => {
  const user = await findUser(req.params.id);
  if (!user) return res.status(404).json({ error: "Account not found." });
  const v = validateProfile(req.body || {}, user.role);
  if (v.error) return res.status(400).json({ error: v.error });

  await db.transaction(async (tx) => {
    await tx.run(`
      UPDATE users SET full_name = ?, department = ?, level = ?, matric_number = ?, staff_id = ?
      WHERE id = ?
    `, [v.full_name, v.department, v.level, v.matric_number, v.staff_id, user.id]);
    if (user.role === ROLES.LECTURER) {
      await tx.run("DELETE FROM lecturer_levels WHERE lecturer_id = ?", [user.id]);
      for (const lvl of v.levels) {
        await tx.run("INSERT INTO lecturer_levels (lecturer_id, level) VALUES (?, ?)", [user.id, lvl]);
      }
    }
  });
  res.json({ ok: true });
});

router.post("/admin/users/:id/status", adminOnly, async (req, res) => {
  const status = req.body && req.body.status;
  if (![STATUSES.ACTIVE, STATUSES.SUSPENDED].includes(status))
    return res.status(400).json({ error: "Status must be active or suspended." });
  const user = await findUser(req.params.id);
  if (!user) return res.status(404).json({ error: "Account not found." });
  if (user.id === req.session.userId)
    return res.status(400).json({ error: "You cannot change your own account's status." });

  await db.run("UPDATE users SET status = ? WHERE id = ?", [status, user.id]);
  if (status === STATUSES.SUSPENDED) await signOutEverywhere(user.id);
  res.json({ ok: true, status });
});

router.post("/admin/users/:id/password", adminOnly, async (req, res) => {
  const password = String((req.body && req.body.password) || "");
  if (password.length < MIN_PASSWORD)
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
  const user = await findUser(req.params.id);
  if (!user) return res.status(404).json({ error: "Account not found." });

  await db.run("UPDATE users SET password = ? WHERE id = ?", [await bcrypt.hash(password, 10), user.id]);
  // Anyone signed in with the old password is signed out — except the
  // administrator making the change, if it is their own account.
  if (user.id !== req.session.userId) await signOutEverywhere(user.id);
  res.json({ ok: true });
});

router.delete("/admin/users/:id", adminOnly, async (req, res) => {
  const user = await findUser(req.params.id);
  if (!user) return res.status(404).json({ error: "Account not found." });
  if (user.id === req.session.userId)
    return res.status(400).json({ error: "You cannot delete your own account." });
  if (user.exam_count > 0 || user.attempt_count > 0) {
    return res.status(409).json({
      error: "This account has exam records, and deleting it would delete them too. Suspend it instead.",
    });
  }
  await signOutEverywhere(user.id);
  await db.run("DELETE FROM users WHERE id = ?", [user.id]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------
router.get("/admin/exams", adminOnly, async (req, res) => {
  const rows = await db.all(`
    SELECT e.id, e.title, e.department, e.level, e.duration_mins, e.published, e.created_at,
           u.full_name AS lecturer_name, u.username AS lecturer_username, u.status AS lecturer_status,
           (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
           (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id AND a.status = 'submitted') AS submitted_count,
           (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id AND a.status = 'in_progress') AS sitting_count,
           (SELECT COALESCE(AVG(CASE WHEN a.max_score > 0 THEN a.total_score * 100.0 / a.max_score END), 0)
              FROM attempts a WHERE a.exam_id = e.id AND a.status = 'submitted') AS average_percent
    FROM exams e JOIN users u ON e.lecturer_id = u.id
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 500
  `);
  res.json(rows.map((r) => ({ ...r, average_percent: Math.round(Number(r.average_percent) * 10) / 10 })));
});

router.post("/admin/exams/:id/unpublish", adminOnly, async (req, res) => {
  const result = await db.run("UPDATE exams SET published = 0 WHERE id = ?", [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: "Exam not found." });
  res.json({ ok: true });
});

module.exports = router;
