/*
 * CodeSit — code execution service
 * --------------------------------
 * Takes source code, a language id and optional stdin, and returns the
 * program's output. stdin is what makes automatic marking possible: the grader
 * feeds a test case's input in and compares what comes back.
 *
 * Four providers sit behind one interface, chosen with EXECUTOR:
 *
 *   • local (default) — runs the code on THIS machine, in a temp directory,
 *                       under a wall-clock timeout with its output capped.
 *                       No network, no account, no third party: "Run" and
 *                       automatic marking work the moment you start the app.
 *                       It is NOT a security sandbox — it is meant for
 *                       development and for a lecturer's own lab machine,
 *                       where the code being run is your own students' work
 *                       on hardware you control.
 *   • sandbox         — Vercel Sandbox: the same runner (runner-core.js),
 *                       executed inside an isolated microVM with no network
 *                       access, away from the web server, its database and
 *                       its secrets. The default on Vercel.
 *   • piston          — a real sandbox for a self-hosted deployment. Self-host
 *                       it in Docker: the public API stopped being freely
 *                       available on 15 Feb 2026.
 *   • wandbox         — a free public sandbox, no key required. Handy, but it
 *                       is a shared community service and does go down.
 *
 * All of them return the same shape:
 *   { ok: boolean, stdout, stderr, output, note }
 *
 * A note with no output at all means "the runner itself failed" — the grader
 * reads that as "could not mark", never as a wrong answer (see grader.js).
 */

const { spawnSync } = require("child_process");
const axios = require("axios");
const {
  EXECUTOR, LANGUAGES, PISTON_URL, PISTON_TOKEN, WANDBOX_URL, RUN_TIMEOUT_MS,
  OUTPUT_CAP_BYTES,
} = require("../config");
const { runJob, BINARIES } = require("./runner-core");

const langById = Object.fromEntries(LANGUAGES.map((l) => [l.id, l]));

// ---------------------------------------------------------------------------
// Local provider
// ---------------------------------------------------------------------------
// Which language tools actually exist on this machine? Checked once, at boot,
// so a missing compiler becomes a clear message rather than a crash mid-exam.

function toolWorks(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 4000, env: process.env });
    if (r.error) return false;
    const text = `${r.stdout || ""}${r.stderr || ""}`;
    // macOS ships /usr/bin/java stubs that print this instead of running.
    if (/Unable to locate a Java Runtime/i.test(text)) return false;
    return r.status === 0;
  } catch (_) {
    return false;
  }
}

// Detection costs a few process spawns, so only pay for it in local mode.
const localTools = EXECUTOR === "local" ? {
  python: toolWorks("python3", ["--version"]),
  javascript: toolWorks("node", ["--version"]),
  c: toolWorks("gcc", ["--version"]),
  cpp: toolWorks("g++", ["--version"]),
  java: toolWorks("javac", ["-version"]) && toolWorks("java", ["-version"]),
} : {};

const localRunnable = Object.keys(localTools).filter((id) => localTools[id]);

// The compile-and-run work itself lives in runner-core.js, shared with the
// sandbox provider.
async function runLocalBatch(code, lang, stdins) {
  if (!localTools[lang.id]) {
    const note = `${lang.label} can't run on this machine — ${BINARIES[lang.id] || lang.id} is not installed or not on PATH.`;
    return stdins.map(() => ({ ok: false, stdout: "", stderr: "", output: "", note }));
  }
  return runJob({
    language: lang.id, label: lang.label, code, stdins,
    timeoutMs: RUN_TIMEOUT_MS, cap: OUTPUT_CAP_BYTES, isolate: false,
  });
}

// Printed once at boot so it is obvious which languages are actually usable.
function localStatus() {
  if (EXECUTOR !== "local") return null;
  return localRunnable.length
    ? `local — ready for: ${localRunnable.join(", ")}`
    : "local — WARNING: no language tools found on PATH";
}

// ---------------------------------------------------------------------------
// Wandbox provider
// ---------------------------------------------------------------------------
// Wandbox names its compilers with pinned versions (e.g. "cpython-3.10.2").
// Those change over time, so instead of hard-coding them we fetch the live
// list once, cache it, and pick the newest compiler for each language family.
let wandboxListCache = null;
let wandboxListFetchedAt = 0;

async function wandboxCompilers() {
  const fresh = Date.now() - wandboxListFetchedAt < 60 * 60 * 1000; // 1 hour
  if (wandboxListCache && fresh) return wandboxListCache;
  const { data } = await axios.get(`${WANDBOX_URL}/list.json`, { timeout: RUN_TIMEOUT_MS });
  wandboxListCache = data;
  wandboxListFetchedAt = Date.now();
  return data;
}

// Pull the dotted version out of a compiler name (e.g. "cpython-3.14.0" -> [3,14,0]).
// Falls back to comparing the raw name for compilers that don't carry one
// (e.g. "cpython-head"), so those still sort somewhere sensible.
function versionOf(name) {
  const match = name.match(/(\d+(?:\.\d+)*)$/);
  return match ? match[1].split(".").map(Number) : null;
}

function compareCompilerNames(a, b) {
  const va = versionOf(a);
  const vb = versionOf(b);
  if (va && vb) {
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const diff = (vb[i] || 0) - (va[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }
  if (va) return -1; // a versioned build outranks an unversioned one (e.g. "-head")
  if (vb) return 1;
  return a < b ? 1 : a > b ? -1 : 0;
}

function pickWandboxCompiler(list, lang) {
  // Prefer a compiler whose name starts with our preferred family and whose
  // language matches; fall back to any compiler for that language.
  const byLang = list.filter((c) => c.language === lang.wandboxLang);
  const preferred = byLang.filter((c) => c.name.startsWith(lang.wandboxPrefix));
  const pool = preferred.length ? preferred : byLang;
  // Sort by actual version number, not lexicographically — otherwise
  // "cpython-3.9.20" outranks "cpython-3.14.0" because "9" > "1" as text.
  pool.sort((a, b) => compareCompilerNames(a.name, b.name));
  return pool.length ? pool[0].name : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wandbox is a shared free service and occasionally answers a single request
// with a transient 5xx (its sandbox allocation failing under load) even
// though the service as a whole is up. One retry after a short pause clears
// most of those without meaningfully slowing down a normal run.
async function postWithRetry(url, body, options, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await axios.post(url, body, options);
    } catch (err) {
      lastErr = err;
      const status = err.response && err.response.status;
      const retryable = !status || status >= 500;
      if (!retryable || i === attempts - 1) throw err;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

async function runWandbox(code, lang, stdin) {
  const list = await wandboxCompilers();
  const compiler = pickWandboxCompiler(list, lang);
  if (!compiler) {
    return { ok: false, stdout: "", stderr: "", output: "",
      note: `No ${lang.label} compiler is currently available on the runner.` };
  }
  const { data } = await postWithRetry(
    `${WANDBOX_URL}/compile.json`,
    { code, compiler, stdin: stdin || "" },
    { timeout: RUN_TIMEOUT_MS + 4000, headers: { "Content-Type": "application/json" } }
  );
  const stdout = data.program_output || "";
  const stderr = [data.compiler_error, data.program_error].filter(Boolean).join("\n");
  const ok = String(data.status) === "0";
  return { ok, stdout, stderr, output: (stdout + (stderr ? "\n" + stderr : "")).trim() };
}

// ---------------------------------------------------------------------------
// Piston provider
// ---------------------------------------------------------------------------
async function runPiston(code, lang, stdin) {
  const headers = { "Content-Type": "application/json" };
  if (PISTON_TOKEN) headers["Authorization"] = PISTON_TOKEN;
  const { data } = await axios.post(
    `${PISTON_URL}/execute`,
    { language: lang.piston, version: "*", files: [{ content: code }], stdin: stdin || "" },
    { timeout: RUN_TIMEOUT_MS + 4000, headers }
  );
  const run = data.run || {};
  const compile = data.compile || {};
  const stderr = [compile.stderr, run.stderr].filter(Boolean).join("\n");
  const stdout = run.stdout || "";
  const ok = run.code === 0;
  return { ok, stdout, stderr, output: (run.output || stdout || stderr || "").trim() };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
async function runCode(code, languageId, stdin) {
  const lang = langById[languageId];
  if (!lang) return { ok: false, output: "", stderr: "", note: "Unknown language." };
  if (!code || !code.trim()) return { ok: false, output: "", stderr: "", note: "There is no code to run." };

  // HTML is previewed in the browser, not executed on an engine.
  if (languageId === "html") {
    return { ok: true, output: "", stderr: "", note: "HTML is shown in the preview panel." };
  }

  // Local and sandbox handle their own failures, so they never throw the
  // axios-shaped errors the remote ones do.
  if (EXECUTOR === "local" || EXECUTOR === "sandbox") {
    return (await runBatch(code, languageId, [stdin || ""]))[0];
  }

  try {
    return EXECUTOR === "piston"
      ? await runPiston(code, lang, stdin)
      : await runWandbox(code, lang, stdin);
  } catch (err) {
    const reason =
      err.response ? `The code runner replied with an error (${err.response.status}).`
      : err.code === "ECONNABORTED" ? "The code runner took too long to respond."
      : "Couldn't reach the code runner. Check your internet connection.";
    return {
      ok: false, stdout: "", stderr: "", output: "",
      note: `${reason} You can also configure a self-hosted Piston engine — see the README.`,
    };
  }
}

/*
 * Run one program against several inputs — every test case of one answer.
 *
 * The local and sandbox providers compile once and run each input in turn in
 * one job, which for the sandbox also means one round trip instead of one per
 * test case. Returns one result per input, or null for a provider that can
 * only take one run at a time (the grader then calls runCode per case).
 */
async function runBatch(code, languageId, stdins) {
  const lang = langById[languageId];
  const all = (note) => stdins.map(() => ({ ok: false, stdout: "", stderr: "", output: "", note }));
  if (!lang || languageId === "html") return all("Unknown language.");
  if (!code || !code.trim()) return all("There is no code to run.");

  if (EXECUTOR === "local") return runLocalBatch(code, lang, stdins);
  if (EXECUTOR === "sandbox") {
    // Loaded only when used, so local development never needs the SDK.
    return require("./vercel-sandbox").runInSandbox({
      language: lang.id, label: lang.label, code, stdins,
      timeoutMs: RUN_TIMEOUT_MS, cap: OUTPUT_CAP_BYTES,
    });
  }
  return null;
}

module.exports = { runCode, runBatch, localStatus, localRunnable };
