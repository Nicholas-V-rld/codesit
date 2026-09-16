/*
 * CodeSit — running student code in Vercel Sandbox
 * ------------------------------------------------
 * Vercel Sandbox provides Firecracker microVMs: a separate Linux machine with
 * its own kernel, so a student's program shares nothing with the web server,
 * the database or the app's secrets. CodeSit keeps ONE such machine, named
 * "codesit-runner", and sends every run to it:
 *
 *   1. The first time, the machine is created, the compilers are installed
 *      (gcc, g++, a JDK; Python and Node come with the image), and its
 *      network access is then switched off ("deny-all"), so a program can
 *      neither download anything nor send answers anywhere.
 *
 *   2. The machine is persistent: when it has sat idle it stops, and the next
 *      run resumes it with the compilers still installed.
 *
 *   3. Each job uploads runner-core.js — the same runner the local engine
 *      uses — together with the job, and executes it as root. The runner then
 *      compiles and runs the program as a throwaway unprivileged user unique
 *      to that job (see runner-core.js), so two students' programs running at
 *      the same moment cannot see each other's files.
 *
 * All test cases of one answer travel as one job: compile once, run each
 * input, one round trip.
 *
 * Authentication is automatic on Vercel (an OIDC token issued to the
 * deployment). Locally, `vercel env pull` writes a development token to
 * .env.local.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { SANDBOX_NAME } = require("../config");

const RUNNER_SOURCE = fs.readFileSync(path.join(__dirname, "runner-core.js"));
// Named by content, so a new version of the runner never collides with an old one.
const RUNNER_NAME = `runner-${crypto.createHash("sha256").update(RUNNER_SOURCE).digest("hex").slice(0, 12)}.js`;

const SESSION_MS = 15 * 60 * 1000; // an idle machine stops after this long
// Bump when provision() changes, so machines set up by an older version are
// brought up to date on their next use.
const SETUP_VERSION = "2";

let runnerPromise = null;

// Loaded as an ES module: the SDK's CommonJS build require()s an ESM-only
// dependency, which Vercel's function runtime refuses.
function sandboxSdk() {
  return import("@vercel/sandbox");
}

async function sh(sandbox, script, { sudo = false, timeoutMs = 10 * 60 * 1000 } = {}) {
  const result = await sandbox.runCommand({ cmd: "bash", args: ["-lc", script], sudo, timeoutMs });
  const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()]);
  return { code: result.exitCode, stdout, stderr };
}

/*
 * Setup of a new machine. Idempotent, so it is also how a machine set up by
 * an older version, or whose setup was interrupted, is brought up to date.
 */
async function provision(sandbox, log = () => {}) {
  const check = await sh(sandbox, "command -v gcc && command -v g++ && command -v javac", {});
  if (check.code !== 0) {
    // Installing needs the internet, which a finished machine no longer has.
    log("Installing compilers…");
    await sandbox.update({ networkPolicy: "allow-all" });
    const install = await sh(sandbox, `
      set -e
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq
      apt-get install -y -qq --no-install-recommends gcc g++ openjdk-21-jdk-headless
      apt-get clean
    `, { sudo: true });
    if (install.code !== 0) {
      throw new Error(`Sandbox setup failed: ${install.stderr.slice(-2000) || install.stdout.slice(-2000)}`);
    }
  }

  const finish = await sh(sandbox, `
    set -e
    # The runner and the job files (which contain students' code) live here.
    # Only root, which runs the runner, may look inside.
    mkdir -p "${sandbox.cwd}/codesit"
    chown root:root "${sandbox.cwd}/codesit"
    chmod 700 "${sandbox.cwd}/codesit"
    python3 --version; node --version; gcc --version | head -1; javac -version 2>&1
  `, { sudo: true });
  if (finish.code !== 0) throw new Error(`Sandbox setup failed: ${finish.stderr.slice(-2000)}`);
  log(finish.stdout.trim());

  log("Switching off network access…");
  await sandbox.update({ networkPolicy: "deny-all", tags: { setup: SETUP_VERSION } });
}

/*
 * Get the runner machine, creating and setting it up if it does not exist
 * yet. Shared by every request this server instance handles.
 */
function getRunner({ log } = {}) {
  if (!runnerPromise) {
    runnerPromise = (async () => {
      const { Sandbox } = await sandboxSdk();
      const sandbox = await Sandbox.getOrCreate({
        name: SANDBOX_NAME,
        persistent: true,
        resources: { vcpus: 2 },
        timeout: SESSION_MS,
        snapshotExpiration: 0, // keep the installed compilers indefinitely
      });
      const policy = sandbox.networkPolicy;
      const locked = policy === "deny-all" || (policy && policy.mode === "deny-all");
      const current = sandbox.tags && sandbox.tags.setup === SETUP_VERSION;
      if (!locked || !current) await provision(sandbox, log);
      return sandbox;
    })().catch((err) => {
      runnerPromise = null; // try again on the next run
      throw err;
    });
  }
  return runnerPromise;
}

/*
 * Run one job in the sandbox. Never throws: a failure to reach the sandbox
 * comes back as a note on every result, which the grader treats as "could
 * not mark" rather than as a wrong answer.
 */
async function runInSandbox(job) {
  const stdins = job.stdins.length ? job.stdins : [""];
  const failAll = (note) => stdins.map(() => ({ ok: false, stdout: "", stderr: "", output: "", note }));

  try {
    const sandbox = await getRunner();

    // Don't start a job the machine's session would cut short.
    const expiresAt = sandbox.expiresAt;
    if (expiresAt && expiresAt.getTime() - Date.now() < 2 * 60 * 1000) {
      try { await sandbox.extendTimeout(5 * 60 * 1000); } catch (_) {}
    }

    const dir = `${sandbox.cwd}/codesit`;
    const jobFile = `${dir}/job-${crypto.randomUUID()}.json`;
    await sandbox.writeFiles([
      { path: `${dir}/${RUNNER_NAME}`, content: RUNNER_SOURCE },
      { path: jobFile, content: Buffer.from(JSON.stringify({ ...job, stdins, isolate: true })) },
    ]);

    // Enough for compiling plus every run, and some slack for the round trip.
    const budget = job.timeoutMs * (stdins.length + 1) + 30 * 1000;
    const result = await sandbox.runCommand({
      cmd: "node",
      args: [`${dir}/${RUNNER_NAME}`, jobFile],
      sudo: true,
      timeoutMs: budget,
    });
    const stdout = await result.stdout();
    if (result.exitCode !== 0 || !stdout.trim()) {
      const stderr = await result.stderr();
      console.error(`[sandbox] runner exited ${result.exitCode}: ${stderr.slice(-1000)}`);
      return failAll("The code runner hit a problem and could not run this program.");
    }
    const results = JSON.parse(stdout);
    return Array.isArray(results) && results.length === stdins.length
      ? results
      : failAll("The code runner returned an unexpected answer.");
  } catch (err) {
    console.error("[sandbox] could not run job:", err && err.message);
    return failAll("Couldn't reach the code runner. Please try again in a moment.");
  }
}

module.exports = { runInSandbox, getRunner, provision };
