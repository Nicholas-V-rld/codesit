/*
 * The exam engine extends the same "your department, your levels" rule to
 * exams themselves. This proves that extension, plus the integrity
 * properties that do not require a live code-execution engine: ownership,
 * the server-authoritative clock, and the lock against editing a handed-in
 * paper.
 *
 * Nothing here depends on Wandbox/Piston actually being reachable — the exam
 * used has a test case whose grading outcome is not asserted on, only that
 * grading was attempted and the paper's state transitions correctly.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApp, startServer, makeClient } = require("./support/helpers");

let server;

test.before(async () => {
  const app = makeApp();
  server = await startServer(app);
});

test.after(async () => {
  await server.close();
});

async function createExam(client, overrides = {}) {
  const body = {
    title: "Sample exam",
    level: "ND1",
    duration_mins: 30,
    questions: [{
      prompt: "Print hello.",
      language: "python",
      tests: [{ stdin: "", expected_output: "hello", points: 5 }],
    }],
    ...overrides,
  };
  return client.post("/api/exams", body);
}

test("a lecturer can only set an exam for a level they actually teach", async () => {
  const c = makeClient(server.baseUrl);
  await c.login("mr_aluko", "codesit123"); // teaches ND1, ND2 only

  const ok = await createExam(c, { level: "ND1" });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.ok, true);

  const forbidden = await createExam(c, { level: "HND1" }); // Aluko does not teach this
  assert.equal(forbidden.status, 403);
});

test("the exam's department always comes from the lecturer's own record, never the request", async () => {
  const c = makeClient(server.baseUrl);
  await c.login("mr_aluko", "codesit123"); // Computer Science

  // Try to smuggle a different department in — the server must ignore it.
  const created = await createExam(c, { department: "Computer Engineering" });
  assert.equal(created.status, 200);

  const exam = await c.get(`/api/exams/${created.data.id}`);
  assert.equal(exam.data.department, "Computer Science");
});

test("a student only ever sees exams matching their own department AND level", async () => {
  const lec = makeClient(server.baseUrl);
  await lec.login("mr_aluko", "codesit123"); // CS, ND1+ND2

  const nd1Exam = await createExam(lec, { level: "ND1", title: "ND1-only exam" });
  await lec.post(`/api/exams/${nd1Exam.data.id}/publish`);

  // Chioma is CS/ND1 — should see it.
  const chioma = makeClient(server.baseUrl);
  await chioma.login("chioma", "codesit123");
  const chiomaExams = await chioma.get("/api/student/exams");
  assert.ok(chiomaExams.data.some((e) => e.id === nd1Exam.data.id));

  // Tunde is CS/ND2 — same department, wrong level, must NOT see it.
  const tunde = makeClient(server.baseUrl);
  await tunde.login("tunde", "codesit123");
  const tundeExams = await tunde.get("/api/student/exams");
  assert.ok(!tundeExams.data.some((e) => e.id === nd1Exam.data.id));

  // Adeola is Computer Engineering/ND2 — wrong department entirely.
  const adeola = makeClient(server.baseUrl);
  await adeola.login("adeola", "codesit123");
  const adeolaExams = await adeola.get("/api/student/exams");
  assert.ok(!adeolaExams.data.some((e) => e.id === nd1Exam.data.id));

  // And Tunde cannot start it directly by id either, bypassing the list.
  const startAttempt = await tunde.post(`/api/student/exams/${nd1Exam.data.id}/start`);
  assert.equal(startAttempt.status, 404);
});

test("a lecturer cannot see or touch another lecturer's exam, even in the same department", async () => {
  const aluko = makeClient(server.baseUrl);
  await aluko.login("mr_aluko", "codesit123"); // CS, ND1+ND2
  const exam = await createExam(aluko, { level: "ND1" });

  const okoro = makeClient(server.baseUrl); // also CS, but HND1+HND2
  await okoro.login("mrs_okoro", "codesit123");

  const view = await okoro.get(`/api/exams/${exam.data.id}`);
  assert.equal(view.status, 404);

  const publish = await okoro.post(`/api/exams/${exam.data.id}/publish`);
  assert.equal(publish.status, 404);

  const results = await okoro.get(`/api/exams/${exam.data.id}/results`);
  assert.equal(results.status, 404);
});

test("a student cannot reach any lecturer-only exam route", async () => {
  const lec = makeClient(server.baseUrl);
  await lec.login("mr_aluko", "codesit123");
  const exam = await createExam(lec, { level: "ND1" });

  const stu = makeClient(server.baseUrl);
  await stu.login("chioma", "codesit123");

  assert.equal((await stu.post("/api/exams", { title: "x" })).status, 403);
  assert.equal((await stu.get("/api/exams")).status, 403);
  assert.equal((await stu.get(`/api/exams/${exam.data.id}`)).status, 403);
  assert.equal((await stu.post(`/api/exams/${exam.data.id}/publish`)).status, 403);
});

test("a submitted paper cannot be edited or resubmitted", async () => {
  const lec = makeClient(server.baseUrl);
  await lec.login("mr_aluko", "codesit123");
  const exam = await createExam(lec, { level: "ND1" });
  await lec.post(`/api/exams/${exam.data.id}/publish`);

  const stu = makeClient(server.baseUrl);
  await stu.login("chioma", "codesit123");
  const start = await stu.post(`/api/student/exams/${exam.data.id}/start`);
  const attemptId = start.data.attempt_id;

  const firstSubmit = await stu.post(`/api/student/attempts/${attemptId}/submit`);
  assert.equal(firstSubmit.status, 200);

  const resubmit = await stu.post(`/api/student/attempts/${attemptId}/submit`);
  assert.equal(resubmit.status, 409);

  const questions = await stu.get(`/api/exams/${exam.data.id}`).catch(() => ({ status: 403 }));
  // (student has no access to the authoring view anyway — 403 confirms it)
  assert.equal(questions.status, 403);

  // Editing an answer on a handed-in paper is refused.
  const detail = await stu.get(`/api/student/attempts/${attemptId}`);
  const qId = detail.data.questions[0].id;
  const edit = await stu.put(`/api/student/attempts/${attemptId}/answers/${qId}`, { code: "print('too late')" });
  assert.equal(edit.status, 409);
});

test("the exam clock is server-authoritative: backdating started_at auto-closes the paper", async () => {
  const lec = makeClient(server.baseUrl);
  await lec.login("mr_aluko", "codesit123");
  const exam = await createExam(lec, { level: "ND2", duration_mins: 5 }); // minimum duration
  await lec.post(`/api/exams/${exam.data.id}/publish`);

  const stu = makeClient(server.baseUrl);
  await stu.login("tunde", "codesit123"); // CS/ND2
  const start = await stu.post(`/api/student/exams/${exam.data.id}/start`);
  const attemptId = start.data.attempt_id;

  // Simulate 25 minutes having passed against a 5-minute paper by rewriting
  // started_at directly in the database — exactly what a tampered client-side
  // clock would be trying (and failing) to achieve.
  const db = require("../src/db"); // the same connection the app is using
  const past = new Date(Date.now() - 25 * 60 * 1000).toISOString();
  await db.run("UPDATE attempts SET started_at = ? WHERE id = ?", [past, attemptId]);

  const reload = await stu.get(`/api/student/attempts/${attemptId}`);
  assert.equal(reload.data.attempt.status, "submitted");
  assert.equal(reload.data.attempt.auto_closed, 1);

  // And it cannot be edited after the fact either.
  const qId = reload.data.questions[0].id;
  const edit = await stu.put(`/api/student/attempts/${attemptId}/answers/${qId}`, { code: "print('late')" });
  assert.equal(edit.status, 409);
});

test("hidden test cases never reach the student — not while sitting, not in the result", async () => {
  const lec = makeClient(server.baseUrl);
  await lec.login("mr_aluko", "codesit123");
  const exam = await createExam(lec, {
    level: "ND1",
    questions: [{
      prompt: "Echo the input.",
      language: "python",
      tests: [
        { stdin: "1", expected_output: "1", hidden: false, points: 5 },
        { stdin: "SECRET_INPUT", expected_output: "SECRET_ANSWER", hidden: true, points: 5 },
      ],
    }],
  });
  await lec.post(`/api/exams/${exam.data.id}/publish`);

  const stu = makeClient(server.baseUrl);
  await stu.login("chioma", "codesit123");
  const start = await stu.post(`/api/student/exams/${exam.data.id}/start`);
  const attemptId = start.data.attempt_id;

  const sitting = await stu.get(`/api/student/attempts/${attemptId}`);
  const raw = JSON.stringify(sitting.data);
  assert.ok(!raw.includes("SECRET_INPUT"));
  assert.ok(!raw.includes("SECRET_ANSWER"));
  assert.equal(sitting.data.questions[0].hidden_test_count, 1);
  assert.equal(sitting.data.questions[0].sample_tests.length, 1);

  await stu.post(`/api/student/attempts/${attemptId}/submit`);
  const result = await stu.get(`/api/student/attempts/${attemptId}/result`);
  const rawResult = JSON.stringify(result.data);
  assert.ok(!rawResult.includes("SECRET_INPUT"));
  assert.ok(!rawResult.includes("SECRET_ANSWER"));
});

test("an exam cannot be deleted once a student has an attempt on it", async () => {
  const lec = makeClient(server.baseUrl);
  await lec.login("mr_aluko", "codesit123");
  const exam = await createExam(lec, { level: "ND1" });
  await lec.post(`/api/exams/${exam.data.id}/publish`);

  const stu = makeClient(server.baseUrl);
  await stu.login("chioma", "codesit123");
  await stu.post(`/api/student/exams/${exam.data.id}/start`);

  const del = await lec.del(`/api/exams/${exam.data.id}`);
  assert.equal(del.status, 409);
});

test("a submitted answer's stored output is never taken from the client — /api/submit ignores a forged output", async () => {
  const stu = makeClient(server.baseUrl);
  await stu.login("khalid", "codesit123");

  const submit = await stu.post("/api/submit", {
    code: "print('the real program prints this')",
    language: "python",
    output: "FORGED: this was never actually printed",
    stderr: "",
    status: "submitted",
  });
  assert.equal(submit.status, 200);
  // Whatever the server recorded, it must not be the client's forged string —
  // it was either the server's own execution result or an honest failure note.
  assert.notEqual(submit.data.output, "FORGED: this was never actually printed");
});
