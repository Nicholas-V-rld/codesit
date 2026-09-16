/*
 * Real marking, end to end.
 *
 * These tests run actual student code and check the marks that come out.
 * They are possible because the default executor is "local": the code runs
 * as a short-lived process on this machine, so a test can assert on a real
 * score without depending on a third-party service being up.
 *
 * Any language tool missing from this machine simply skips the test that
 * needs it, rather than failing the suite.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApp, startServer, makeClient } = require("./support/helpers");
const { localRunnable } = require("../src/services/executor");

const hasPython = localRunnable.includes("python");

let server;

test.before(async () => {
  server = await startServer(makeApp());
});

test.after(async () => {
  await server.close();
});

// Set an exam, sit it with the given code, hand it in, return the result.
async function sitExam(answers, tests) {
  const lec = makeClient(server.baseUrl);
  await lec.login("mr_aluko", "codesit123");

  const created = await lec.post("/api/exams", {
    title: "Marking test",
    level: "ND1",
    duration_mins: 30,
    questions: [{
      prompt: "Read two integers on one line and print their sum.",
      language: "python",
      tests,
    }],
  });
  assert.equal(created.status, 200);
  await lec.post(`/api/exams/${created.data.id}/publish`);

  const stu = makeClient(server.baseUrl);
  await stu.login("chioma", "codesit123");
  const start = await stu.post(`/api/student/exams/${created.data.id}/start`);
  const attemptId = start.data.attempt_id;

  const paper = await stu.get(`/api/student/attempts/${attemptId}`);
  const qId = paper.data.questions[0].id;
  await stu.put(`/api/student/attempts/${attemptId}/answers/${qId}`, { code: answers });

  const submit = await stu.post(`/api/student/attempts/${attemptId}/submit`);
  const result = await stu.get(`/api/student/attempts/${attemptId}/result`);
  return { submit: submit.data, result: result.data, lecturer: lec, examId: created.data.id };
}

const sumTests = [
  { stdin: "2 3", expected_output: "5", points: 5 },
  { stdin: "10 20", expected_output: "30", hidden: true, points: 5 },
];

test("a fully correct answer scores full marks", { skip: !hasPython }, async () => {
  const { submit } = await sitExam(
    "a, b = map(int, input().split())\nprint(a + b)\n", sumTests
  );
  assert.equal(submit.total_score, 10);
  assert.equal(submit.max_score, 10);
  assert.equal(submit.needs_manual, false);
});

test("a wrong answer scores zero, and is marked wrong rather than 'unmarkable'", { skip: !hasPython }, async () => {
  const { submit, result } = await sitExam(
    "a, b = map(int, input().split())\nprint(a - b)\n", sumTests
  );
  assert.equal(submit.total_score, 0);
  // The distinction that matters: a wrong answer is graded, not deferred to a human.
  assert.equal(submit.needs_manual, false);
  assert.equal(result.questions[0].grade_note, "");
});

test("partial credit: passes the visible case, fails the hidden one", { skip: !hasPython }, async () => {
  // Hard-codes the sample answer — exactly what hidden test cases exist to catch.
  const { submit, result } = await sitExam("print(5)\n", sumTests);
  assert.equal(submit.total_score, 5);
  assert.equal(submit.max_score, 10);

  const report = result.questions[0].report;
  assert.equal(report[0].passed, true);   // visible "2 3" -> 5
  assert.equal(report[1].passed, false);  // hidden "10 20" -> 30
  // And the hidden case still refuses to reveal itself, even in a result.
  assert.equal(report[1].expected, undefined);
  assert.equal(report[1].stdin, undefined);
});

test("trailing whitespace and newlines never cost a student marks", { skip: !hasPython }, async () => {
  const { submit } = await sitExam(
    "a, b = map(int, input().split())\nprint(str(a + b) + '   ')\n", sumTests
  );
  assert.equal(submit.total_score, 10);
});

test("code that crashes scores zero and the student sees the real error", { skip: !hasPython }, async () => {
  const { submit, result } = await sitExam("raise ValueError('boom')\n", sumTests);
  assert.equal(submit.total_score, 0);
  assert.equal(submit.needs_manual, false);

  const shown = result.questions[0].report[0].stderr;
  assert.match(shown, /ValueError: boom/);
  // The server's own temp directory must not leak onto a student's screen.
  assert.ok(!shown.includes(require("os").tmpdir()), "temp path leaked into student-visible error");
});

test("an endless loop is killed by the timeout instead of hanging the exam", { skip: !hasPython }, async () => {
  const { submit } = await sitExam("while True:\n    pass\n", [
    { stdin: "", expected_output: "anything", points: 5 },
  ]);
  assert.equal(submit.total_score, 0);
});

test("a blank answer scores zero without being sent to the runner at all", async () => {
  const { submit, result } = await sitExam("", sumTests);
  assert.equal(submit.total_score, 0);
  assert.match(result.questions[0].grade_note, /No answer was written/);
});
