/*
 * Test helpers.
 * -------------
 * Each test FILE gets its own throwaway SQLite database (node's built-in test
 * runner runs each matched file in its own process, so setting DB_PATH here
 * before anything requires src/db/src/config is enough to isolate them).
 *
 * To run the same tests against PostgreSQL instead, point TEST_DATABASE_URL
 * at a database you do not mind writing to: each file then works inside its
 * own freshly named schema there.
 *
 * makeApp() builds the app in-process — no port bound, no real network call
 * needed to exercise a route.
 */

const os = require("os");
const path = require("path");
const fs = require("fs");

const dbFile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "codesit-test-")),
  "test.db"
);
process.env.DB_PATH = dbFile;
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.PG_SCHEMA = `test_${Date.now()}_${process.pid}`;
} else {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
}
process.env.EXECUTOR = "local";
process.env.SESSION_SECRET = "test-secret";
process.env.NODE_ENV = "test";

function makeApp() {
  const { createApp } = require("../../src/app");
  return createApp();
}

/*
 * A tiny fetch-based client that keeps cookies between calls, the way a
 * logged-in browser tab does. http.createServer + fetch avoids adding a test
 * HTTP client as a dependency.
 */
async function startServer(app) {
  const http = require("http");
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function makeClient(baseUrl) {
  let cookie = "";
  async function req(method, path, body) {
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
  return {
    get: (path) => req("GET", path),
    post: (path, body) => req("POST", path, body),
    put: (path, body) => req("PUT", path, body),
    del: (path) => req("DELETE", path),
    login: (username, password) => req("POST", "/api/login", { username, password }),
  };
}

module.exports = { makeApp, startServer, makeClient, dbFile };
