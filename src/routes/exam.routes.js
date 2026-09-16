/*
 * CodeSit — the exam engine
 * =========================
 * Everything to do with setting, sitting and marking an exam.
 *
 * LECTURER
 *   POST   /api/exams                      create an exam (questions + marking scheme)
 *   GET    /api/exams                      my exams
 *   GET    /api/exams/:id                  full detail, including hidden test cases
 *   POST   /api/exams/:id/publish          open it to students
 *   POST   /api/exams/:id/unpublish        close it again
 *   DELETE /api/exams/:id                  delete a draft
 *   GET    /api/exams/:id/results          every student's score
 *   GET    /api/exams/:id/results.csv      the same, as a spreadsheet
 *   GET    /api/exam-attempts/:id          one student's paper, marked
 *   PUT    /api/exam-answers/:id/score     override a mark by hand
 *
 * STUDENT
 *   GET    /api/student/exams              exams set for my department + level
 *   POST   /api/student/exams/:id/start    begin (or resume) sitting
 *   GET    /api/student/attempts/:id       resume — questions, saved code, time left
 *   PUT    /api/student/attempts/:id/answers/:questionId   autosave
 *   POST   /api/student/attempts/:id/submit                hand in and get marked
 *   GET    /api/student/attempts/:id/result                my marked paper
 *   GET    /api/student/results            all my results
 *
 * THE ACCESS-CONTROL RULE, EXTENDED
 * ---------------------------------
 * An exam's department is taken from the lecturer's own record and its level
 * must be one the lecturer actually teaches — neither is accepted from the
 * request body. A student is shown an exam only when the exam's department and
 * level both match their own. So the same "your department, your levels" rule
 * that governs submissions governs the whole exam engine, enforced in SQL on
 * the server.
 */

const db = require("../db");
const { asyncRouter } = require("../lib/router");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ROLES, LANGUAGES, LEVELS } = require("../config");
const { gradeAnswer, studentSafeReport } = require("../services/grader");

const router = asyncRouter();

const validLevels = LEVELS.map((l) => l.value);
// HTML is previewed in the browser rather than executed, so it cannot be
// marked against test cases and is not offered as an exam language.
const examLanguages = LANGUAGES.filter((l) => l.id !== "html").map((l) => l.id);

// Limits, so one exam cannot be built large enough to hammer the runner.
const MAX_QUESTIONS = 10;
const MAX_TESTS_PER_QUESTION = 8;
// A few seconds of slack for clock skew and a submit that is already in flight.
const GRACE_MS = 20 * 1000;

// --------------------------------------------------------------------------
// Small helpers
// --------------------------------------------------------------------------

// Timestamps are written as ISO strings so they parse back unambiguously.
const now = () => new Date().toISOString();
function parseTs(value) {
  if (!value) return null;
  // ISO strings carry their own zone; SQLite's CURRENT_TIMESTAMP is UTC but
  // says so nowhere, hence the appended Z.
  const iso = /[TZ]/.test(value) ? value : value.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function deadlineOf(attempt, exam) {
  const started = parseTs(attempt.started_at);
  if (!started) return null;
  return new Date(started.getTime() + exam.duration_mins * 60 * 1000);
}

async function lecturerLevels(lecturerId) {
  const rows = await db.all("SELECT level FROM lecturer_levels WHERE lecturer_id = ?", [lecturerId]);
  return rows.map((r) => r.level);
}

// Fetch an exam only if this lecturer owns it. Used by every lecturer route,
// so ownership is never assumed from the URL alone.
function ownedExam(examId, lecturerId) {
  return db.get("SELECT * FROM exams WHERE id = ? AND lecturer_id = ?", [examId, lecturerId]);
}

function questionsOf(examId) {
  return db.all("SELECT * FROM questions WHERE exam_id = ? ORDER BY position, id", [examId]);
}

function testsOf(questionId) {
  return db.all("SELECT * FROM test_cases WHERE question_id = ? ORDER BY position, id", [questionId]);
}

async function totalMarksOf(examId) {
  const row = await db.get(`
    SELECT COALESCE(SUM(t.points), 0) AS total
    FROM test_cases t JOIN questions q ON t.question_id = q.id
    WHERE q.exam_id = ?
  `, [examId]);
  return row.total;
}

// ==========================================================================
// LECTURER — authoring
// ==========================================================================

const lecturerOnly = [requireAuth, requireRole(ROLES.LECTURER)];

/*
 * Validate an exam payload (used by both create and update). Returns
 * { error } for the first problem found, or { title, instructions, level,
 * duration, questions } once everything checks out. Nothing is written here —
 * that keeps "reject the whole thing before touching the database" true for
 * both routes without duplicating every rule.
 */
function validateExamPayload(b, myLevels) {
  const title = (b.title || "").trim();
  if (!title) return { error: "Give the exam a title." };

  // The level must be one this lecturer actually teaches. The department is
  // never read from the body — it is always the lecturer's own.
  if (!validLevels.includes(b.level))
    return { error: "Select a valid level." };
  if (!myLevels.includes(b.level))
    return { error: "You can only set exams for a level you teach.", status: 403 };

  const duration = Number(b.duration_mins);
  if (!Number.isFinite(duration) || duration < 5 || duration > 300)
    return { error: "Duration must be between 5 and 300 minutes." };

  const questions = Array.isArray(b.questions) ? b.questions : [];
  if (questions.length === 0)
    return { error: "Add at least one question." };
  if (questions.length > MAX_QUESTIONS)
    return { error: `An exam can have at most ${MAX_QUESTIONS} questions.` };

  for (const [i, q] of questions.entries()) {
    const n = i + 1;
    if (!(q.prompt || "").trim())
      return { error: `Question ${n} needs a prompt.` };
    if (!examLanguages.includes(q.language))
      return { error: `Question ${n} needs a valid language.` };
    const tests = Array.isArray(q.tests) ? q.tests : [];
    if (tests.length === 0)
      return { error: `Question ${n} needs at least one test case.` };
    if (tests.length > MAX_TESTS_PER_QUESTION)
      return { error: `Question ${n} can have at most ${MAX_TESTS_PER_QUESTION} test cases.` };
    for (const [j, t] of tests.entries()) {
      if (String(t.expected_output ?? "").trim() === "")
        return { error: `Question ${n}, test ${j + 1} needs an expected output.` };
      const pts = Number(t.points);
      if (!Number.isFinite(pts) || pts <= 0 || pts > 100)
        return { error: `Question ${n}, test ${j + 1} needs marks between 1 and 100.` };
    }
  }

  return { title, instructions: (b.instructions || "").trim(), level: b.level, duration, questions };
}

// Write an exam's questions + test cases inside the caller's transaction.
// Assumes the exam row already exists and (for an edit) that its old
// questions have just been cleared.
async function writeQuestions(tx, examId, questions) {
  for (const [i, q] of questions.entries()) {
    const questionId = await tx.insert(`
      INSERT INTO questions (exam_id, prompt, language, starter_code, position)
      VALUES (?, ?, ?, ?, ?)
    `, [examId, q.prompt.trim(), q.language, q.starter_code || "", i]);
    for (const [j, t] of (q.tests || []).entries()) {
      await tx.run(`
        INSERT INTO test_cases (question_id, stdin, expected_output, hidden, points, position)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [questionId, t.stdin || "", String(t.expected_output), t.hidden ? 1 : 0, Math.round(Number(t.points)), j]);
    }
  }
}

router.post("/exams", lecturerOnly, async (req, res) => {
  const me = await db.get("SELECT department FROM users WHERE id = ?", [req.session.userId]);
  const v = validateExamPayload(req.body || {}, await lecturerLevels(req.session.userId));
  if (v.error) return res.status(v.status || 400).json({ error: v.error });

  try {
    const id = await db.transaction(async (tx) => {
      const examId = await tx.insert(`
        INSERT INTO exams (lecturer_id, title, instructions, department, level, duration_mins, published, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `, [req.session.userId, v.title, v.instructions, me.department, v.level, Math.round(v.duration), now()]);
      await writeQuestions(tx, examId, v.questions);
      return examId;
    });
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: "Could not save the exam. Please try again." });
  }
});

/*
 * ---- Lecturer: edit a draft ----
 * Only while unpublished. Once students can see an exam, its questions and
 * marking scheme are frozen — editing a live paper out from under a sitting
 * student would be exam misconduct in the other direction.
 */
router.put("/exams/:id", lecturerOnly, async (req, res) => {
  const exam = await ownedExam(req.params.id, req.session.userId);
  if (!exam) return res.status(404).json({ error: "Exam not found." });
  if (exam.published)
    return res.status(409).json({ error: "This exam is live — unpublish it before editing." });

  const v = validateExamPayload(req.body || {}, await lecturerLevels(req.session.userId));
  if (v.error) return res.status(v.status || 400).json({ error: v.error });

  try {
    await db.transaction(async (tx) => {
      // Re-checked inside the transaction: it may have been published since.
      const changed = await tx.run(
        "UPDATE exams SET title = ?, instructions = ?, level = ?, duration_mins = ? WHERE id = ? AND published = 0",
        [v.title, v.instructions, v.level, Math.round(v.duration), exam.id]
      );
      if (changed.changes === 0) throw Object.assign(new Error("published"), { published: true });
      // Cascades to test_cases via the foreign key.
      await tx.run("DELETE FROM questions WHERE exam_id = ?", [exam.id]);
      await writeQuestions(tx, exam.id, v.questions);
    });
    res.json({ ok: true });
  } catch (e) {
    if (e.published) return res.status(409).json({ error: "This exam is live — unpublish it before editing." });
    res.status(500).json({ error: "Could not save the exam. Please try again." });
  }
});

// ---- Lecturer: my exams ----
router.get("/exams", lecturerOnly, async (req, res) => {
  const rows = await db.all(`
    SELECT e.*,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id AND a.status = 'submitted') AS submitted_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id AND a.status = 'in_progress') AS sitting_count,
      (SELECT COUNT(*) FROM users u WHERE u.role = 'student'
         AND u.department = e.department AND u.level = e.level) AS cohort_size
    FROM exams e
    WHERE e.lecturer_id = ?
    ORDER BY e.created_at DESC, e.id DESC
  `, [req.session.userId]);
  res.json(await Promise.all(rows.map(async (e) => ({ ...e, total_marks: await totalMarksOf(e.id) }))));
});

// ---- Lecturer: one exam in full (hidden test cases included — it's theirs) ----
router.get("/exams/:id", lecturerOnly, async (req, res) => {
  const exam = await ownedExam(req.params.id, req.session.userId);
  if (!exam) return res.status(404).json({ error: "Exam not found." });
  const questions = await Promise.all(
    (await questionsOf(exam.id)).map(async (q) => ({ ...q, tests: await testsOf(q.id) }))
  );
  res.json({ ...exam, questions, total_marks: await totalMarksOf(exam.id) });
});

// ---- Lecturer: publish / unpublish ----
router.post("/exams/:id/publish", lecturerOnly, async (req, res) => {
  const exam = await ownedExam(req.params.id, req.session.userId);
  if (!exam) return res.status(404).json({ error: "Exam not found." });
  if ((await questionsOf(exam.id)).length === 0)
    return res.status(400).json({ error: "Add a question before publishing." });
  await db.run("UPDATE exams SET published = 1 WHERE id = ?", [exam.id]);
  res.json({ ok: true, published: 1 });
});

router.post("/exams/:id/unpublish", lecturerOnly, async (req, res) => {
  const exam = await ownedExam(req.params.id, req.session.userId);
  if (!exam) return res.status(404).json({ error: "Exam not found." });
  await db.run("UPDATE exams SET published = 0 WHERE id = ?", [exam.id]);
  res.json({ ok: true, published: 0 });
});

// ---- Lecturer: delete ----
// Only while nobody has sat it — deleting an exam with attempts would destroy
// students' marked work.
router.delete("/exams/:id", lecturerOnly, async (req, res) => {
  const exam = await ownedExam(req.params.id, req.session.userId);
  if (!exam) return res.status(404).json({ error: "Exam not found." });
  // One statement, so a student starting the paper at this very moment
  // cannot slip in between the check and the delete.
  const deleted = await db.run(
    "DELETE FROM exams WHERE id = ? AND NOT EXISTS (SELECT 1 FROM attempts WHERE exam_id = ?)",
    [exam.id, exam.id]
  );
  if (deleted.changes === 0)
    return res.status(409).json({ error: "Students have already sat this exam, so it cannot be deleted. Unpublish it instead." });
  res.json({ ok: true });
});

// --------------------------------------------------------------------------
// LECTURER — results
// --------------------------------------------------------------------------

function resultRows(examId) {
  return db.all(`
    SELECT a.id AS attempt_id, a.status, a.started_at, a.submitted_at,
           a.total_score, a.max_score, a.auto_closed,
           u.id AS user_id, u.full_name, u.username, u.matric_number, u.level
    FROM attempts a JOIN users u ON a.user_id = u.id
    WHERE a.exam_id = ?
    ORDER BY a.total_score DESC, u.full_name ASC
  `, [examId]);
}

router.get("/exams/:id/results", lecturerOnly, async (req, res) => {
  const exam = await ownedExam(req.params.id, req.session.userId);
  if (!exam) return res.status(404).json({ error: "Exam not found." });

  const rows = await resultRows(exam.id);
  const marked = rows.filter((r) => r.status === "submitted" && r.max_score > 0);
  const percentages = marked.map((r) => (r.total_score / r.max_score) * 100);
  const average = percentages.length
    ? percentages.reduce((a, b) => a + b, 0) / percentages.length : 0;

  // Everyone in the cohort who has not started at all.
  const notStarted = await db.all(`
    SELECT id, full_name, username, matric_number FROM users
    WHERE role = 'student' AND department = ? AND level = ?
      AND id NOT IN (SELECT user_id FROM attempts WHERE exam_id = ?)
    ORDER BY full_name
  `, [exam.department, exam.level, exam.id]);

  res.json({
    exam: { ...exam, total_marks: await totalMarksOf(exam.id) },
    results: rows,
    notStarted,
    stats: {
      cohort: rows.length + notStarted.length,
      submitted: rows.filter((r) => r.status === "submitted").length,
      sitting: rows.filter((r) => r.status === "in_progress").length,
      notStarted: notStarted.length,
      averagePercent: Math.round(average * 10) / 10,
      pass50: percentages.filter((p) => p >= 50).length,
    },
  });
});

// ---- Lecturer: results as CSV, for the departmental record ----
router.get("/exams/:id/results.csv", lecturerOnly, async (req, res) => {
  const exam = await ownedExam(req.params.id, req.session.userId);
  if (!exam) return res.status(404).type("text").send("Exam not found.");

  // Guard against a leading =, +, - or @ being read as a formula by Excel.
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const rows = await resultRows(exam.id);
  const lines = [
    ["Student", "Matric number", "Username", "Level", "Status", "Score", "Out of", "Percent", "Submitted at"]
      .map(cell).join(","),
    ...rows.map((r) => [
      r.full_name || r.username, r.matric_number, r.username, r.level,
      r.status === "submitted" ? (r.auto_closed ? "submitted (time up)" : "submitted") : "in progress",
      r.total_score, r.max_score,
      r.max_score > 0 ? Math.round((r.total_score / r.max_score) * 1000) / 10 : "",
      r.submitted_at || "",
    ].map(cell).join(",")),
  ];

  const safeTitle = exam.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="codesit-${safeTitle || "exam"}-results.csv"`);
  res.send("﻿" + lines.join("\r\n"));
});

// ---- Lecturer: one student's marked paper ----
router.get("/exam-attempts/:id", lecturerOnly, async (req, res) => {
  const attempt = await db.get(`
    SELECT a.*, u.full_name, u.username, u.matric_number, u.level, u.department
    FROM attempts a JOIN users u ON a.user_id = u.id WHERE a.id = ?
  `, [req.params.id]);
  if (!attempt) return res.status(404).json({ error: "Attempt not found." });

  // Ownership of the exam is what grants access to the paper.
  const exam = await ownedExam(attempt.exam_id, req.session.userId);
  if (!exam) return res.status(403).json({ error: "You do not have access to this." });

  const answers = await Promise.all((await questionsOf(exam.id)).map(async (q) => {
    const a = await db.get("SELECT * FROM answers WHERE attempt_id = ? AND question_id = ?", [attempt.id, q.id]);
    return {
      question: { id: q.id, prompt: q.prompt, language: q.language, position: q.position },
      answer: a ? { ...a, report: JSON.parse(a.report || "[]") } : null,
    };
  }));

  res.json({ attempt, exam, answers });
});

// ---- Lecturer: override a mark ----
router.put("/exam-answers/:id/score", lecturerOnly, async (req, res) => {
  const answer = await db.get("SELECT * FROM answers WHERE id = ?", [req.params.id]);
  if (!answer) return res.status(404).json({ error: "Answer not found." });

  const attempt = await db.get("SELECT * FROM attempts WHERE id = ?", [answer.attempt_id]);
  const exam = attempt && await ownedExam(attempt.exam_id, req.session.userId);
  if (!exam) return res.status(403).json({ error: "You do not have access to this." });

  const score = Number(req.body.score);
  if (!Number.isFinite(score) || score < 0 || score > answer.max_score)
    return res.status(400).json({ error: `Mark must be between 0 and ${answer.max_score}.` });

  const total = await db.transaction(async (tx) => {
    await tx.run("UPDATE answers SET score = ?, grade_note = ? WHERE id = ?",
      [score, (req.body.note || "Adjusted by lecturer").trim(), answer.id]);
    const sum = (await tx.get("SELECT COALESCE(SUM(score), 0) AS t FROM answers WHERE attempt_id = ?", [attempt.id])).t;
    await tx.run("UPDATE attempts SET total_score = ? WHERE id = ?", [sum, attempt.id]);
    return sum;
  });
  res.json({ ok: true, total_score: total });
});

// ==========================================================================
// STUDENT — sitting an exam
// ==========================================================================

const studentOnly = [requireAuth, requireRole(ROLES.STUDENT)];

/*
 * Exams set for me.
 * The WHERE clause is the access-control rule: published, my department, my
 * level. A student cannot ask for anyone else's exam, because the department
 * and level come from their own row, not from the request.
 */
router.get("/student/exams", studentOnly, async (req, res) => {
  const me = await db.get("SELECT department, level FROM users WHERE id = ?", [req.session.userId]);
  const rows = await db.all(`
    SELECT e.id, e.title, e.instructions, e.duration_mins, e.created_at,
           u.full_name AS lecturer_name,
           a.id AS attempt_id, a.status, a.started_at, a.submitted_at,
           a.total_score, a.max_score,
           (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count
    FROM exams e
    JOIN users u ON e.lecturer_id = u.id
    LEFT JOIN attempts a ON a.exam_id = e.id AND a.user_id = ?
    WHERE e.published = 1 AND e.department = ? AND e.level = ?
    ORDER BY e.created_at DESC, e.id DESC
  `, [req.session.userId, me.department, me.level]);

  res.json(await Promise.all(rows.map(async (r) => ({ ...r, total_marks: await totalMarksOf(r.id) }))));
});

/*
 * Load an exam a student is entitled to sit.
 * Returns null unless it is published AND matches their department and level.
 */
async function examForStudent(examId, userId) {
  const me = await db.get("SELECT department, level FROM users WHERE id = ?", [userId]);
  if (!me) return null;
  return (await db.get(`
    SELECT * FROM exams
    WHERE id = ? AND published = 1 AND department = ? AND level = ?
  `, [examId, me.department, me.level])) || null;
}

/*
 * What the student is allowed to see of a question.
 * Hidden test cases are dropped entirely — the visible ones act as worked
 * examples, the hidden ones are what stop a student printing the answers.
 */
async function questionForStudent(q) {
  const tests = await testsOf(q.id);
  const visible = tests.filter((t) => !t.hidden);
  const hiddenCount = tests.length - visible.length;
  return {
    id: q.id,
    prompt: q.prompt,
    language: q.language,
    starter_code: q.starter_code,
    position: q.position,
    marks: tests.reduce((sum, t) => sum + t.points, 0),
    sample_tests: visible.map((t) => ({ stdin: t.stdin, expected_output: t.expected_output, points: t.points })),
    hidden_test_count: hiddenCount,
  };
}

/*
 * Auto-submit a paper whose time has run out.
 * Called whenever an in-progress attempt is touched, so an expired paper is
 * marked the moment anyone looks at it, rather than sitting open forever.
 */
async function closeIfExpired(attempt, exam) {
  if (attempt.status !== "in_progress") return attempt;
  const deadline = deadlineOf(attempt, exam);
  if (!deadline || Date.now() <= deadline.getTime() + GRACE_MS) return attempt;
  await finaliseAttempt(attempt, exam, { autoClosed: true });
  return db.get("SELECT * FROM attempts WHERE id = ?", [attempt.id]);
}

// ---- Student: start or resume ----
router.post("/student/exams/:id/start", studentOnly, async (req, res) => {
  const exam = await examForStudent(req.params.id, req.session.userId);
  if (!exam) return res.status(404).json({ error: "That exam is not available to you." });

  const findAttempt = () => db.get("SELECT * FROM attempts WHERE exam_id = ? AND user_id = ?", [exam.id, req.session.userId]);
  let attempt = await findAttempt();

  if (!attempt) {
    // ON CONFLICT: a double-click that starts the paper twice at once still
    // produces exactly one attempt, and the original start time stands.
    await db.run(`
      INSERT INTO attempts (exam_id, user_id, started_at, status, max_score)
      VALUES (?, ?, ?, 'in_progress', ?)
      ON CONFLICT (exam_id, user_id) DO NOTHING
    `, [exam.id, req.session.userId, now(), await totalMarksOf(exam.id)]);
    attempt = await findAttempt();
  } else {
    attempt = await closeIfExpired(attempt, exam);
    if (attempt.status === "submitted")
      return res.status(409).json({ error: "You have already sat this exam.", attempt_id: attempt.id });
  }

  res.json({ ok: true, attempt_id: attempt.id });
});

/*
 * Load a paper in progress.
 * The deadline is sent as an absolute timestamp computed on the server. The
 * browser counts down to it for display only — every write is re-checked
 * against the server's own clock, so a tampered countdown buys nothing.
 */
router.get("/student/attempts/:id", studentOnly, async (req, res) => {
  let attempt = await db.get("SELECT * FROM attempts WHERE id = ? AND user_id = ?", [req.params.id, req.session.userId]);
  if (!attempt) return res.status(404).json({ error: "Attempt not found." });

  const exam = await db.get("SELECT * FROM exams WHERE id = ?", [attempt.exam_id]);
  attempt = await closeIfExpired(attempt, exam);

  const questions = await Promise.all((await questionsOf(exam.id)).map(async (q) => {
    const saved = await db.get("SELECT code FROM answers WHERE attempt_id = ? AND question_id = ?", [attempt.id, q.id]);
    const view = await questionForStudent(q);
    return { ...view, code: saved ? saved.code : q.starter_code || "" };
  }));

  res.json({
    attempt: {
      id: attempt.id, status: attempt.status, started_at: attempt.started_at,
      submitted_at: attempt.submitted_at, auto_closed: attempt.auto_closed,
    },
    exam: {
      id: exam.id, title: exam.title, instructions: exam.instructions,
      duration_mins: exam.duration_mins, total_marks: await totalMarksOf(exam.id),
    },
    questions,
    deadline: deadlineOf(attempt, exam),
    server_time: now(),
  });
});

/*
 * ---- Student: autosave one answer ----
 * Registered for PUT and POST alike: the editor uses PUT, while the final
 * save fired as the tab closes goes through navigator.sendBeacon, which can
 * only issue a POST.
 */
const autosaveAnswer = async (req, res) => {
  let attempt = await db.get("SELECT * FROM attempts WHERE id = ? AND user_id = ?", [req.params.id, req.session.userId]);
  if (!attempt) return res.status(404).json({ error: "Attempt not found." });

  const exam = await db.get("SELECT * FROM exams WHERE id = ?", [attempt.exam_id]);
  attempt = await closeIfExpired(attempt, exam);
  if (attempt.status !== "in_progress")
    return res.status(409).json({ error: "This paper has been handed in — it can no longer be edited." });

  const question = await db.get("SELECT * FROM questions WHERE id = ? AND exam_id = ?", [req.params.questionId, exam.id]);
  if (!question) return res.status(404).json({ error: "Question not found." });

  const code = String(req.body.code ?? "");
  const maxScore = (await testsOf(question.id)).reduce((sum, t) => sum + t.points, 0);
  await db.run(`
    INSERT INTO answers (attempt_id, question_id, code, max_score, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (attempt_id, question_id)
    DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at
  `, [attempt.id, question.id, code, maxScore, now()]);

  res.json({ ok: true, saved_at: now() });
};

router.put("/student/attempts/:id/answers/:questionId", studentOnly, autosaveAnswer);
router.post("/student/attempts/:id/answers/:questionId", studentOnly, autosaveAnswer);

/*
 * Hand in and mark.
 * This is the integrity-critical path: the server takes the code out of the
 * database, runs it itself against every test case, and stores the result.
 * Nothing the browser reports about output is used or even accepted.
 */
async function finaliseAttempt(attempt, exam, { autoClosed = false } = {}) {
  const questions = await questionsOf(exam.id);
  let total = 0;
  let maxTotal = 0;
  let needsManual = false;

  for (const q of questions) {
    const tests = await testsOf(q.id);
    const saved = await db.get("SELECT * FROM answers WHERE attempt_id = ? AND question_id = ?", [attempt.id, q.id]);
    const code = saved ? saved.code : "";

    const result = await gradeAnswer({ code, language: q.language, testCases: tests });
    if (result.ungraded) needsManual = true;
    total += result.score;
    maxTotal += result.maxScore;

    await db.run(`
      INSERT INTO answers (attempt_id, question_id, code, score, max_score,
                           passed_count, total_count, report, grade_note, graded_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (attempt_id, question_id) DO UPDATE SET
        score = excluded.score, max_score = excluded.max_score,
        passed_count = excluded.passed_count, total_count = excluded.total_count,
        report = excluded.report, grade_note = excluded.grade_note,
        graded_at = excluded.graded_at
    `, [
      attempt.id, q.id, code,
      result.score, result.maxScore,
      result.passedCount, result.totalCount,
      JSON.stringify(result.report), result.note || "",
      now(), now(),
    ]);
  }

  await db.run(`
    UPDATE attempts
    SET status = 'submitted', submitted_at = ?, total_score = ?, max_score = ?, auto_closed = ?
    WHERE id = ?
  `, [now(), total, maxTotal, autoClosed ? 1 : 0, attempt.id]);

  return { total, maxTotal, needsManual };
}

router.post("/student/attempts/:id/submit", studentOnly, async (req, res) => {
  const attempt = await db.get("SELECT * FROM attempts WHERE id = ? AND user_id = ?", [req.params.id, req.session.userId]);
  if (!attempt) return res.status(404).json({ error: "Attempt not found." });
  if (attempt.status === "submitted")
    return res.status(409).json({ error: "You have already handed this paper in." });

  const exam = await db.get("SELECT * FROM exams WHERE id = ?", [attempt.exam_id]);
  const deadline = deadlineOf(attempt, exam);
  const late = deadline && Date.now() > deadline.getTime() + GRACE_MS;

  try {
    const { total, maxTotal, needsManual } = await finaliseAttempt(attempt, exam, { autoClosed: late });
    res.json({ ok: true, total_score: total, max_score: maxTotal, needs_manual: needsManual, auto_closed: late });
  } catch (e) {
    res.status(500).json({ error: "Something went wrong while marking. Your code is saved — tell your lecturer." });
  }
});

// ---- Student: my marked paper ----
router.get("/student/attempts/:id/result", studentOnly, async (req, res) => {
  const attempt = await db.get("SELECT * FROM attempts WHERE id = ? AND user_id = ?", [req.params.id, req.session.userId]);
  if (!attempt) return res.status(404).json({ error: "Attempt not found." });
  if (attempt.status !== "submitted")
    return res.status(409).json({ error: "This paper has not been handed in yet." });

  const exam = await db.get("SELECT * FROM exams WHERE id = ?", [attempt.exam_id]);
  const questions = await Promise.all((await questionsOf(exam.id)).map(async (q) => {
    const a = await db.get("SELECT * FROM answers WHERE attempt_id = ? AND question_id = ?", [attempt.id, q.id]);
    return {
      id: q.id, prompt: q.prompt, language: q.language, position: q.position,
      code: a ? a.code : "",
      score: a ? a.score : 0,
      max_score: a ? a.max_score : 0,
      passed_count: a ? a.passed_count : 0,
      total_count: a ? a.total_count : 0,
      grade_note: a ? a.grade_note : "",
      // Hidden cases are reduced to pass/fail before they leave the server.
      report: studentSafeReport(a ? JSON.parse(a.report || "[]") : []),
    };
  }));

  res.json({ attempt, exam: { id: exam.id, title: exam.title }, questions });
});

// ---- Student: all my results ----
router.get("/student/results", studentOnly, async (req, res) => {
  const rows = await db.all(`
    SELECT a.id AS attempt_id, a.total_score, a.max_score, a.submitted_at, a.auto_closed,
           e.title, e.id AS exam_id
    FROM attempts a JOIN exams e ON a.exam_id = e.id
    WHERE a.user_id = ? AND a.status = 'submitted'
    ORDER BY a.submitted_at DESC
  `, [req.session.userId]);
  res.json(rows);
});

module.exports = router;
