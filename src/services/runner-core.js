/*
 * CodeSit — the program runner
 * ----------------------------
 * Compiles a student's program once and runs it against one or more inputs,
 * each run under a wall-clock timeout and with its output capped.
 *
 * This file is used in two places, which is why it depends on nothing but
 * Node's own modules:
 *
 *   • EXECUTOR=local   — executor.js requires it and runs programs on this
 *                        machine, in a temp directory. Not a security sandbox.
 *   • EXECUTOR=sandbox — vercel-sandbox.js copies this very file into a Vercel
 *                        Sandbox microVM and runs it there as a script (see
 *                        the bottom of the file). With `isolate` on, every job
 *                        also gets its own throwaway Linux user, so one
 *                        student's program cannot read another's files, and
 *                        process and file-size limits so it cannot fork-bomb
 *                        or fill the disk.
 *
 * Every run returns the same shape:
 *   { ok: boolean, stdout, stderr, output, note }
 * A note with no output at all means "the runner itself failed" — the grader
 * reads that as "could not mark", never as a wrong answer (see grader.js).
 */

const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

// What each language needs: the file to write, and how to compile/run it.
// When `compile` is null the source runs directly.
const RECIPES = {
  python:     { file: "main.py",    compile: null,                                   run: (d) => ["python3", [path.join(d, "main.py")]] },
  javascript: { file: "main.js",    compile: null,                                   run: (d) => ["node", [path.join(d, "main.js")]] },
  c:          { file: "main.c",     compile: (d) => ["gcc", ["-O0", "-o", path.join(d, "a.out"), path.join(d, "main.c")]],  run: (d) => [path.join(d, "a.out"), []] },
  cpp:        { file: "main.cpp",   compile: (d) => ["g++", ["-O0", "-o", path.join(d, "a.out"), path.join(d, "main.cpp")]], run: (d) => [path.join(d, "a.out"), []] },
  java:       { file: "Main.java",  compile: () => ["javac", ["Main.java"]],          run: (d) => ["java", ["-cp", d, "Main"]] },
};

// Friendly name of the missing binary, for the "not installed" message.
const BINARIES = {
  python: "python3", javascript: "node", c: "gcc", cpp: "g++", java: "javac/java",
};

function capAppend(current, chunk, cap) {
  if (current.length >= cap) return { text: current, truncated: true };
  const s = chunk.toString();
  const room = cap - current.length;
  if (s.length <= room) return { text: current + s, truncated: false };
  return { text: current + s.slice(0, room), truncated: true };
}

/*
 * Spawn one process, feed it stdin, and collect its output under two limits:
 * a wall-clock deadline and a cap on how much output we keep.
 *
 * stdin is the part the marking scheme depends on: each test case's input is
 * written to the program's standard input and the stream is then closed, so a
 * program that reads to EOF terminates instead of hanging until the timeout.
 */
function spawnCapped(cmd, args, { cwd, deadline, stdin, cap, user }) {
  return new Promise((resolve) => {
    const options = {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false, // never hand student code to a shell
    };
    if (user) {
      // Drop to the job's own unprivileged user, with limits applied by
      // prlimit before the program starts: at most 256 processes (no fork
      // bombs), no file over 32 MB, no core dumps.
      options.uid = user.uid;
      options.gid = user.uid;
      options.env = { PATH: process.env.PATH, HOME: cwd, LANG: "C.UTF-8" };
      args = ["--nproc=256", "--fsize=33554432", "--core=0", "--", cmd, ...args];
      cmd = "prlimit";
    }
    const child = spawn(cmd, args, options);

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch (_) {}
      // A background process the program started would otherwise hold its
      // output pipe open, and this run would never finish.
      if (user) spawnSync("pkill", ["-KILL", "-u", String(user.uid)]);
    }, Math.max(1, deadline - Date.now()));

    const onChunk = (which) => (buf) => {
      if (which === "out") {
        const r = capAppend(stdout, buf, cap);
        stdout = r.text;
        if (r.truncated) truncated = true;
      } else {
        const r = capAppend(stderr, buf, cap);
        stderr = r.text;
        if (r.truncated) truncated = true;
      }
    };
    child.stdout.on("data", onChunk("out"));
    child.stderr.on("data", onChunk("err"));

    // A program that ignores stdin makes this pipe error with EPIPE; that is
    // normal and must not take the whole run down.
    child.stdin.on("error", () => {});
    try {
      if (stdin) child.stdin.write(stdin);
      child.stdin.end();
    } catch (_) {}

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.on("error", (err) => finish({
      ok: false, stdout, stderr: stderr || err.message,
      truncated, killed: timedOut, error: err, code: null,
    }));
    child.on("close", (code) => finish({
      ok: code === 0 && !timedOut,
      stdout, stderr, truncated, killed: timedOut, error: null, code,
    }));
  });
}

/*
 * Compilers and tracebacks name the file by its full path, which here is a
 * throwaway temp directory. A student should see "main.c:1: error", not
 * "/var/folders/.../codesit-a1b2/main.c:1: error" — it is noise to them and
 * it puts this server's internal paths on their screen.
 */
function scrubPaths(text, dir) {
  if (!text) return text;
  return text.split(dir + path.sep).join("").split(dir).join("");
}

const failure = (note) => ({ ok: false, stdout: "", stderr: "", output: "", note });
const timedOutResult = () => failure("Your program was stopped because it ran too long.");

// A random uid per job, in a range no real account uses. It needs no entry in
// /etc/passwd: the kernel only cares about the number.
function makeJobUser() {
  return { uid: 20000 + Math.floor(Math.random() * 40000) };
}

// Stop anything the job left running in the background and delete files it
// scattered outside its own directory.
function cleanUpUser(user) {
  if (!user) return;
  spawnSync("pkill", ["-KILL", "-u", String(user.uid)]);
  spawnSync("find", ["/tmp", "/var/tmp", "/dev/shm", "-xdev", "-uid", String(user.uid), "-delete"]);
}

/*
 * Run one job: compile once (if the language needs it), then run the program
 * once per input. The compile step and each run get their own `timeoutMs`,
 * so every test case is measured the same way however many there are.
 *
 *   job = { language, label, code, stdins: [..], timeoutMs, cap, isolate }
 *
 * Returns one result per input.
 */
async function runJob(job) {
  const { language, code, timeoutMs, cap } = job;
  const label = job.label || language;
  const stdins = Array.isArray(job.stdins) && job.stdins.length ? job.stdins : [""];
  const all = (result) => stdins.map(() => result);

  const recipe = RECIPES[language];
  if (!recipe) return all(failure("Unknown language."));

  const user = job.isolate ? makeJobUser() : null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codesit-"));

  try {
    fs.writeFileSync(path.join(dir, recipe.file), code, "utf8");
    if (user) {
      fs.chownSync(dir, user.uid, user.uid);
      fs.chownSync(path.join(dir, recipe.file), user.uid, user.uid);
      fs.chmodSync(dir, 0o700); // no other job's user can look inside
    }

    if (recipe.compile) {
      const [cmd, args] = recipe.compile(dir);
      const compiled = await spawnCapped(cmd, args, { cwd: dir, deadline: Date.now() + timeoutMs, stdin: "", cap, user });
      if (compiled.error && compiled.error.code === "ENOENT") {
        return all(failure(`${label} can't run on this machine — ${BINARIES[language]} is missing.`));
      }
      if (compiled.killed) return all(timedOutResult());
      if (!compiled.ok) {
        // A compile error is the student's answer being wrong, not the runner
        // failing — so it carries real stderr and is marked, not skipped.
        const cOut = scrubPaths(compiled.stdout, dir);
        const cErr = scrubPaths(compiled.stderr, dir) || "Compilation failed.";
        return all({
          ok: false,
          stdout: cOut,
          stderr: cErr,
          output: (cOut + (cErr ? "\n" + cErr : "")).trim(),
        });
      }
    }

    const results = [];
    for (const stdin of stdins) {
      const [runCmd, runArgs] = recipe.run(dir);
      const result = await spawnCapped(runCmd, runArgs, { cwd: dir, deadline: Date.now() + timeoutMs, stdin, cap, user });

      if (result.error && result.error.code === "ENOENT") {
        results.push(failure(`${label} can't run on this machine — ${BINARIES[language]} is missing.`));
        continue;
      }
      if (result.killed) {
        results.push(timedOutResult());
        continue;
      }

      const rOut = scrubPaths(result.stdout, dir);
      const rErr = scrubPaths(result.stderr, dir);
      const out = {
        ok: result.ok,
        stdout: rOut,
        stderr: rErr,
        output: (rOut + (rErr ? "\n" + rErr : "")).trim(),
      };
      if (result.truncated) out.note = "Output was truncated.";
      results.push(out);
    }
    return results;
  } catch (err) {
    return all(failure(`Couldn't run the code on this machine (${err.code || "error"}).`));
  } finally {
    cleanUpUser(user);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { runJob, RECIPES, BINARIES };

/*
 * Script mode, used inside the Vercel Sandbox:
 *   node runner-core.js /path/to/job.json
 * Prints the results as one line of JSON on stdout, then deletes the job file.
 */
if (require.main === module) {
  const jobFile = process.argv[2];
  const job = JSON.parse(fs.readFileSync(jobFile, "utf8"));
  try { fs.unlinkSync(jobFile); } catch (_) {}
  runJob(job).then((results) => {
    process.stdout.write(JSON.stringify(results));
  });
}
