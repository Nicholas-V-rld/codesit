/*
 * Administration: the admin role, lecturer approval, and account management.
 *
 * The claims under test:
 *   • a self-registered lecturer cannot sign in until an administrator
 *     approves them, and cannot see any student until then;
 *   • only administrators can reach the admin routes and page;
 *   • suspending an account signs it out at once, even mid-session;
 *   • an account with exam records cannot be deleted;
 *   • an administrator cannot lock themselves out.
 */

process.env.ADMIN_USERNAME = "root";
process.env.ADMIN_PASSWORD = "root-password-1";

const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApp, startServer, makeClient } = require("./support/helpers");

let server;

test.before(async () => {
  server = await startServer(makeApp());
});
test.after(async () => {
  await server.close();
});

async function signIn(username, password = "codesit123") {
  const c = makeClient(server.baseUrl);
  const r = await c.login(username, password);
  assert.equal(r.status, 200, `${username} could not sign in: ${JSON.stringify(r.data)}`);
  return c;
}

test("ADMIN_USERNAME / ADMIN_PASSWORD create an administrator who lands on /admin", async () => {
  const c = makeClient(server.baseUrl);
  const r = await c.login("root", "root-password-1");
  assert.equal(r.status, 200);
  assert.equal(r.data.role, "admin");
  const page = await c.get("/admin");
  assert.equal(page.status, 200);
  const home = await c.get("/");
  assert.equal(home.status, 302);
  assert.equal(home.data, "Found. Redirecting to /admin");
});

test("students and lecturers are refused the admin routes and page", async () => {
  for (const who of ["chioma", "mr_aluko"]) {
    const c = await signIn(who);
    assert.equal((await c.get("/api/admin/users")).status, 403, who);
    assert.equal((await c.get("/api/admin/overview")).status, 403, who);
    const page = await c.get("/admin");
    assert.equal(page.status, 302, who);
  }
  const anon = makeClient(server.baseUrl);
  assert.equal((await anon.get("/api/admin/users")).status, 401);
});

test("a self-registered lecturer waits for approval, then gets in", async () => {
  const anon = makeClient(server.baseUrl);
  const reg = await anon.post("/api/register", {
    role: "lecturer", username: "new_lecturer", password: "secret12", full_name: "New Lecturer",
    department: "Computer Science", teaching_levels: ["ND1"],
  });
  assert.equal(reg.status, 200);
  assert.equal(reg.data.pending, true);

  const early = await makeClient(server.baseUrl).login("new_lecturer", "secret12");
  assert.equal(early.status, 403);
  assert.match(early.data.error, /approve/i);

  const admin = await signIn("root", "root-password-1");
  const pending = await admin.get("/api/admin/users?role=lecturer&status=pending");
  const row = pending.data.find((u) => u.username === "new_lecturer");
  assert.ok(row, "pending lecturer listed");
  assert.deepEqual(row.levels, ["ND1"]);
  const overview = await admin.get("/api/admin/overview");
  assert.ok(overview.data.pendingLecturers >= 1);

  assert.equal((await admin.post(`/api/admin/users/${row.id}/status`, { status: "active" })).status, 200);
  const lec = await signIn("new_lecturer", "secret12");
  const stats = await lec.get("/api/lecturer/stats");
  assert.equal(stats.status, 200);
  assert.equal(stats.data.totalStudents, 1); // Chioma, CS ND1
});

test("students still register and sign in straight away", async () => {
  const anon = makeClient(server.baseUrl);
  const reg = await anon.post("/api/register", {
    role: "student", username: "new_student", password: "secret12", full_name: "New Student",
    department: "Computer Science", level: "ND2",
  });
  assert.equal(reg.status, 200);
  assert.equal(reg.data.pending, false);
  await signIn("new_student", "secret12");
});

test("suspending an account signs it out at once; reactivating lets it back in", async () => {
  const student = await signIn("amaka");
  assert.equal((await student.get("/api/me")).status, 200);

  const admin = await signIn("root", "root-password-1");
  const { data: users } = await admin.get("/api/admin/users?q=amaka");
  const amaka = users.find((u) => u.username === "amaka");
  assert.equal((await admin.post(`/api/admin/users/${amaka.id}/status`, { status: "suspended" })).status, 200);

  assert.equal((await student.get("/api/me")).status, 401, "existing session ended");
  const again = await makeClient(server.baseUrl).login("amaka", "codesit123");
  assert.equal(again.status, 403);
  assert.match(again.data.error, /suspended/i);

  assert.equal((await admin.post(`/api/admin/users/${amaka.id}/status`, { status: "active" })).status, 200);
  await signIn("amaka");
});

test("an administrator can create accounts, edit them and reset passwords", async () => {
  const admin = await signIn("root", "root-password-1");
  const created = await admin.post("/api/admin/users", {
    role: "lecturer", username: "Dr.Bello", password: "temporary1", full_name: "Dr. Bello",
    department: "Computer Engineering", teaching_levels: ["HND1", "HND2", "nonsense"],
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));

  // Created by an administrator, so active at once.
  const bello = await signIn("dr.bello", "temporary1");
  assert.deepEqual((await bello.get("/api/me")).data.levels.sort(), ["HND1", "HND2"]);

  assert.equal((await admin.post("/api/admin/users", {
    role: "lecturer", username: "dr.bello", password: "temporary1", full_name: "Dup",
    department: "Computer Engineering", teaching_levels: ["ND1"],
  })).status, 409);
  assert.equal((await admin.post("/api/admin/users", {
    role: "student", username: "weak", password: "short", full_name: "W",
    department: "Computer Science", level: "ND1",
  })).status, 400);

  const edited = await admin.put(`/api/admin/users/${created.data.id}`, {
    full_name: "Dr. A. Bello", department: "Computer Engineering", teaching_levels: ["ND1"],
  });
  assert.equal(edited.status, 200);
  const me = (await bello.get("/api/me")).data;
  assert.equal(me.full_name, "Dr. A. Bello");
  assert.deepEqual(me.levels, ["ND1"]);

  assert.equal((await admin.post(`/api/admin/users/${created.data.id}/password`, { password: "brand-new-pass" })).status, 200);
  assert.equal((await bello.get("/api/me")).status, 401, "old session signed out");
  assert.equal((await makeClient(server.baseUrl).login("dr.bello", "temporary1")).status, 401);
  await signIn("dr.bello", "brand-new-pass");

  const newAdmin = await admin.post("/api/admin/users", {
    role: "admin", username: "second_admin", password: "second-admin-1", full_name: "Second Admin",
  });
  assert.equal(newAdmin.status, 200);
  const second = await signIn("second_admin", "second-admin-1");
  assert.equal((await second.get("/api/admin/overview")).status, 200);
});

test("accounts with exam records cannot be deleted; others can", async () => {
  const lec = await signIn("mrs_okoro");
  const exam = await lec.post("/api/exams", {
    title: "Records", level: "HND1", duration_mins: 30,
    questions: [{ prompt: "p", language: "python", tests: [{ stdin: "", expected_output: "x", points: 1 }] }],
  });
  assert.equal(exam.status, 200);

  const admin = await signIn("root", "root-password-1");
  const { data: users } = await admin.get("/api/admin/users");
  const okoro = users.find((u) => u.username === "mrs_okoro");
  assert.equal(okoro.exam_count, 1);
  const refused = await admin.del(`/api/admin/users/${okoro.id}`);
  assert.equal(refused.status, 409);

  const { data: exams } = await admin.get("/api/admin/exams");
  assert.ok(exams.some((e) => e.id === exam.data.id && e.lecturer_username === "mrs_okoro"));

  const reg = await makeClient(server.baseUrl).post("/api/register", {
    role: "lecturer", username: "to_reject", password: "secret12", full_name: "Reject Me",
    department: "Computer Science", teaching_levels: ["HND2"],
  });
  assert.equal(reg.status, 200);
  const target = (await admin.get("/api/admin/users?q=to_reject")).data[0];
  assert.equal((await admin.del(`/api/admin/users/${target.id}`)).status, 200);
  assert.equal((await admin.get("/api/admin/users?q=to_reject")).data.length, 0);
});

test("an administrator cannot suspend or delete themselves", async () => {
  const admin = await signIn("root", "root-password-1");
  const me = (await admin.get("/api/me")).data;
  assert.equal((await admin.post(`/api/admin/users/${me.id}/status`, { status: "suspended" })).status, 400);
  assert.equal((await admin.del(`/api/admin/users/${me.id}`)).status, 400);
  assert.equal((await admin.get("/api/me")).status, 200);
});

test("anyone can change their own password, given the current one", async () => {
  const c = await signIn("khalid");
  assert.equal((await c.put("/api/password", { current_password: "wrong", new_password: "khalid-new-1" })).status, 400);
  assert.equal((await c.put("/api/password", { current_password: "codesit123", new_password: "short" })).status, 400);
  assert.equal((await c.put("/api/password", { current_password: "codesit123", new_password: "khalid-new-1" })).status, 200);
  await signIn("khalid", "khalid-new-1");
});
