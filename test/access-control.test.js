/*
 * The claim docs/UNDERSTANDING_CODESIT.md makes about submissions:
 *
 *   "a CS ND1/ND2 lecturer sees only the two matching students; a Computer
 *   Engineering lecturer in the same system sees only their own department;
 *   a student hitting the lecturer endpoint is refused outright."
 *
 * This is that proof. It exercises the seeded demo accounts exactly as the
 * README's walkthrough describes them, through real HTTP requests against
 * the real app and a real (throwaway) database — no mocking of the access
 * control itself.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApp, startServer, makeClient } = require("./support/helpers");

let server, client;

test.before(async () => {
  const app = makeApp();
  server = await startServer(app);
});

test.after(async () => {
  await server.close();
});

test("mr_aluko (CS, ND1+ND2) sees exactly Chioma and Tunde", async () => {
  const c = makeClient(server.baseUrl);
  const login = await c.login("mr_aluko", "codesit123");
  assert.equal(login.status, 200);

  const { status, data } = await c.get("/api/lecturer/stats");
  assert.equal(status, 200);
  assert.equal(data.department, "Computer Science");
  assert.deepEqual(data.levels.sort(), ["ND1", "ND2"]);
  assert.equal(data.totalStudents, 2);
});

test("mrs_okoro (CS, HND1+HND2) sees a different two students, same department", async () => {
  const c = makeClient(server.baseUrl);
  await c.login("mrs_okoro", "codesit123");

  const { data } = await c.get("/api/lecturer/stats");
  assert.equal(data.department, "Computer Science");
  assert.deepEqual(data.levels.sort(), ["HND1", "HND2"]);
  assert.equal(data.totalStudents, 2);
});

test("engr_musa (Computer Engineering) sees only Adeola — department isolation", async () => {
  const c = makeClient(server.baseUrl);
  await c.login("engr_musa", "codesit123");

  const { data: stats } = await c.get("/api/lecturer/stats");
  assert.equal(stats.department, "Computer Engineering");
  assert.equal(stats.totalStudents, 1);

  const { data: subs } = await c.get("/api/lecturer/submissions");
  // Every returned submission (if any) must belong to Musa's own department.
  for (const s of subs) assert.equal(s.department, "Computer Engineering");
});

test("a student hitting the lecturer endpoint is refused outright", async () => {
  const c = makeClient(server.baseUrl);
  await c.login("chioma", "codesit123");

  const stats = await c.get("/api/lecturer/stats");
  assert.equal(stats.status, 403);

  const subs = await c.get("/api/lecturer/submissions");
  assert.equal(subs.status, 403);
});

test("an unauthenticated request to any protected API route is refused", async () => {
  const c = makeClient(server.baseUrl);
  const me = await c.get("/api/me");
  assert.equal(me.status, 401);
  const subs = await c.get("/api/submissions");
  assert.equal(subs.status, 401);
});

test("a lecturer's ?level= filter can only narrow, never widen, beyond their taught levels", async () => {
  const c = makeClient(server.baseUrl);
  await c.login("mr_aluko", "codesit123"); // teaches ND1, ND2 only

  // Ask for a level Aluko does NOT teach.
  const { status, data } = await c.get("/api/lecturer/submissions?level=HND1");
  assert.equal(status, 200);
  // The filter is silently ignored rather than honoured, so nothing outside
  // Aluko's own levels can leak through.
  for (const s of data) assert.notEqual(s.level, "HND1");
});

test("wrong password is rejected and does not start a session", async () => {
  const c = makeClient(server.baseUrl);
  const login = await c.login("chioma", "wrong-password");
  assert.equal(login.status, 401);

  const me = await c.get("/api/me");
  assert.equal(me.status, 401);
});

test("a malformed JSON body gets a clean JSON error, not a raw stack trace", async () => {
  const res = await fetch(server.baseUrl + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not valid json",
  });
  assert.equal(res.status, 400);
  assert.match(res.headers.get("content-type") || "", /application\/json/);
  const data = await res.json();
  assert.ok(data.error);
  // The bug this guards against: Express's default handler leaks the
  // server's own filesystem paths in an HTML stack trace for this exact input.
  assert.ok(!JSON.stringify(data).includes(__dirname));
});

/*
 * This must run last in this file: it deliberately exhausts one account's
 * login-attempt budget, which would break any later test that needs to log
 * that account back in.
 */
test("the login rate limit is per-account, not per-IP — a lab full of students on one network can't lock each other out", async () => {
  // Guess chioma's password wrong enough times to trip the limiter...
  let lastStatus;
  for (let i = 0; i < 21; i++) {
    const res = await fetch(server.baseUrl + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "chioma", password: "wrong" }),
    });
    lastStatus = res.status;
  }
  assert.equal(lastStatus, 429);

  // ...and confirm a different account, hit from the very same client (same
  // origin/IP as far as the server is concerned), is completely unaffected.
  const other = makeClient(server.baseUrl);
  const login = await other.login("tunde", "codesit123");
  assert.equal(login.status, 200);
});
