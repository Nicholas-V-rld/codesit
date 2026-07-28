/*
 * CodeSit — code execution service
 * --------------------------------
 * Takes source code + a language id and returns the program's output. The
 * actual running of untrusted code happens on an external, sandboxed engine so
 * that student code never runs on the CodeSit server itself.
 *
 * Two engines are supported behind one interface:
 *
 *   • wandbox (default)  — a long-running free service, no key required. This
 *                          is why "Run" works out of the box.
 *   • piston             — the engine described in the project report. The
 *                          public endpoint now needs a token (since Feb 2026),
 *                          so this is best pointed at a self-hosted instance.
 *
 * Both return the same shape:
 *   { ok: boolean, stdout, stderr, output, note }
 */

const axios = require("axios");
const {
  EXECUTOR, LANGUAGES, PISTON_URL, PISTON_TOKEN, WANDBOX_URL, RUN_TIMEOUT_MS,
} = require("../config");

const langById = Object.fromEntries(LANGUAGES.map((l) => [l.id, l]));

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

function pickWandboxCompiler(list, lang) {
  // Prefer a compiler whose name starts with our preferred family and whose
  // language matches; fall back to any compiler for that language.
  const byLang = list.filter((c) => c.language === lang.wandboxLang);
  const preferred = byLang.filter((c) => c.name.startsWith(lang.wandboxPrefix));
  const pool = preferred.length ? preferred : byLang;
  // Names sort roughly by version; take the highest.
  pool.sort((a, b) => (a.name < b.name ? 1 : -1));
  return pool.length ? pool[0].name : null;
}

async function runWandbox(code, lang) {
  const list = await wandboxCompilers();
  const compiler = pickWandboxCompiler(list, lang);
  if (!compiler) {
    return { ok: false, stdout: "", stderr: "", output: "",
      note: `No ${lang.label} compiler is currently available on the runner.` };
  }
  const { data } = await axios.post(
    `${WANDBOX_URL}/compile.json`,
    { code, compiler, stdin: "" },
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
async function runPiston(code, lang) {
  const headers = { "Content-Type": "application/json" };
  if (PISTON_TOKEN) headers["Authorization"] = PISTON_TOKEN;
  const { data } = await axios.post(
    `${PISTON_URL}/execute`,
    { language: lang.piston, version: "*", files: [{ content: code }] },
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
async function runCode(code, languageId) {
  const lang = langById[languageId];
  if (!lang) return { ok: false, output: "", stderr: "", note: "Unknown language." };
  if (!code || !code.trim()) return { ok: false, output: "", stderr: "", note: "There is no code to run." };

  // HTML is previewed in the browser, not executed on an engine.
  if (languageId === "html") {
    return { ok: true, output: "", stderr: "", note: "HTML is shown in the preview panel." };
  }

  try {
    return EXECUTOR === "piston" ? await runPiston(code, lang) : await runWandbox(code, lang);
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

module.exports = { runCode };
