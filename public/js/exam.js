/*
 * Sitting a paper.
 *
 * Two things worth knowing about this file:
 *
 *  1. The countdown is display only. It counts toward a deadline the server
 *     worked out from the moment the attempt was created. Every save and the
 *     hand-in itself are re-checked against the server's own clock, so editing
 *     this timer in the console gains a student nothing.
 *
 *  2. "Run against samples" is practice. It never records a mark. Marking
 *     happens once, on the server, when the paper is handed in.
 */

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const ATTEMPT_ID = params.get("attempt");

let editor;
let questions = [];
let current = 0;
let deadline = null;
let handedIn = false;
let saveTimer = null;
let clockTimer = null;

// --- small helpers -------------------------------------------------------
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}
async function api(path, method, body) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function setStatus(state, text, meta = "") {
  $("statusbar").className = "statusbar state-" + state;
  $("statusText").textContent = text;
  $("statusMeta").textContent = meta;
}

// --- the clock -----------------------------------------------------------
function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  tickClock();
  clockTimer = setInterval(tickClock, 1000);
}

function tickClock() {
  if (!deadline || handedIn) return;
  const left = deadline - Date.now();
  const clock = $("clock");

  if (left <= 0) {
    clock.textContent = "00:00";
    clock.className = "clock critical";
    clearInterval(clockTimer);
    // Time is up. Save whatever is on screen, then let the server close it.
    autoHandIn();
    return;
  }

  const totalSecs = Math.floor(left / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = (n) => String(n).padStart(2, "0");
  clock.textContent = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

  // Under five minutes goes amber, under one minute goes red.
  clock.className =
    left <= 60 * 1000 ? "clock critical" : left <= 5 * 60 * 1000 ? "clock warn" : "clock";
}

async function autoHandIn() {
  if (handedIn) return;
  // Save whatever is on screen — including anything typed in the last
  // second before the clock hit zero — BEFORE marking the paper as handed
  // in. saveCurrent() itself refuses to write once handedIn is true, so
  // that flag can only be set after this save has gone through.
  await saveCurrent(true);
  handedIn = true;
  toast("Time is up — handing your paper in…");
  const { data } = await api(`/api/student/attempts/${ATTEMPT_ID}/submit`, "POST");
  location.href = `/result?attempt=${ATTEMPT_ID}` + (data.needs_manual ? "&manual=1" : "");
}

// --- loading -------------------------------------------------------------
require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" } });
require(["vs/editor/editor.main"], async function () {
  if (!ATTEMPT_ID) { location.href = "/student"; return; }

  const me = await api("/api/me", "GET");
  $("whoami").textContent = me.data.full_name || me.data.username;

  const { ok, data } = await api(`/api/student/attempts/${ATTEMPT_ID}`, "GET");
  if (!ok) { toast(data.error || "Could not open that paper"); setTimeout(() => (location.href = "/student"), 1500); return; }

  // A paper that was already handed in (or ran out of time while away) goes
  // straight to the result rather than reopening as editable.
  if (data.attempt.status === "submitted") { location.href = `/result?attempt=${ATTEMPT_ID}`; return; }

  questions = data.questions;
  deadline = new Date(data.deadline).getTime();

  $("examTitle").textContent = data.exam.title;
  $("examSub").textContent =
    `${questions.length} question${questions.length === 1 ? "" : "s"} · ${data.exam.total_marks} marks · ${data.exam.duration_mins} minutes`;

  if (data.exam.instructions) {
    $("notice").style.display = "block";
    $("notice").textContent = data.exam.instructions;
  }

  editor = monaco.editor.create($("editor"), {
    value: "", language: "python", theme: "vs-dark",
    fontSize: 14, automaticLayout: true, minimap: { enabled: false },
    scrollBeyondLastLine: false, padding: { top: 12 },
  });

  // Autosave: debounced, so a fast typist does not fire a request per keypress.
  editor.onDidChangeModelContent(() => {
    questions[current].code = editor.getValue();
    renderNav();
    $("autosave").textContent = "unsaved…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveCurrent(), 1200);
  });

  showQuestion(0);
  startClock();
  // A last save on the way out, for a closed tab or a navigation away.
  window.addEventListener("beforeunload", () => {
    if (handedIn) return;
    const q = questions[current];
    navigator.sendBeacon?.(
      `/api/student/attempts/${ATTEMPT_ID}/answers/${q.id}`,
      new Blob([JSON.stringify({ code: editor.getValue() })], { type: "application/json" })
    );
  });
});

// --- rendering -----------------------------------------------------------
function renderNav() {
  $("qnav").innerHTML = questions.map((q, i) =>
    `<button class="${i === current ? "on " : ""}${(q.code || "").trim() ? "answered" : ""}" data-i="${i}">${i + 1}</button>`
  ).join("");
  $("qnav").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", async () => {
      await saveCurrent();
      showQuestion(Number(b.dataset.i));
    })
  );
}

function showQuestion(index) {
  current = index;
  const q = questions[index];

  renderNav();
  $("qTitle").textContent = `Question ${index + 1}`;
  $("qMarks").textContent = `${q.marks} mark${q.marks === 1 ? "" : "s"}`;
  $("qPrompt").textContent = q.prompt;
  $("qLang").textContent = q.language.toUpperCase();

  // Sample cases are the visible half of the marking scheme — worked examples.
  const samples = q.sample_tests || [];
  let html = "";
  if (samples.length) {
    html += "<h4>Sample cases</h4>";
    html += samples.map((t) => `
      <div class="sample">
        ${t.stdin ? `<div class="row"><div class="k">input</div><div class="v">${escapeHtml(t.stdin)}</div></div>` : ""}
        <div class="row"><div class="k">expects</div><div class="v">${escapeHtml(t.expected_output)}</div></div>
      </div>`).join("");
  }
  if (q.hidden_test_count > 0) {
    html += `<div class="hidden-note">Plus ${q.hidden_test_count} hidden test case${q.hidden_test_count === 1 ? "" : "s"} you cannot see. Write a general solution, not one that prints the samples.</div>`;
  }
  $("samples").innerHTML = html;

  monaco.editor.setModelLanguage(editor.getModel(), q.language);
  editor.setValue(q.code || q.starter_code || "");
  setStatus("ready", "ready");
  $("console").innerHTML = '<span class="muted">Run your code to check it against the sample cases. This is practice — it does not affect your mark.</span>';
}

// --- saving --------------------------------------------------------------
async function saveCurrent(silent = false) {
  if (handedIn) return;
  const q = questions[current];
  q.code = editor.getValue();
  const { ok, data } = await api(
    `/api/student/attempts/${ATTEMPT_ID}/answers/${q.id}`, "PUT", { code: q.code }
  );
  if (ok) {
    if (!silent) $("autosave").textContent = "saved " + new Date().toLocaleTimeString();
  } else if (data.error) {
    // The usual cause is the server having closed the paper on time.
    $("autosave").textContent = "not saved";
    if (!silent) toast(data.error);
  }
}

// --- practice run --------------------------------------------------------
$("runBtn").addEventListener("click", async () => {
  const q = questions[current];
  const code = editor.getValue();
  if (!code.trim()) { toast("Write some code first"); return; }

  const btn = $("runBtn");
  btn.disabled = true;
  setStatus("running", "running…");
  $("console").innerHTML = '<span class="muted">Running…</span>';

  const samples = q.sample_tests || [];
  // With no visible samples there is nothing to compare against, so just run.
  const cases = samples.length ? samples : [{ stdin: "", expected_output: null }];
  const lines = [];
  let passed = 0;
  const started = performance.now();

  for (const [i, t] of cases.entries()) {
    const { data } = await api("/api/execute", "POST", { code, language: q.language, stdin: t.stdin || "" });

    if (data.note && !data.output && !data.stdout && !data.stderr) {
      lines.push(`<span class="err">${escapeHtml(data.note)}</span>`);
      break;
    }
    const actual = (data.stdout || data.output || "").replace(/\s+$/, "");

    if (t.expected_output === null) {
      lines.push(escapeHtml(actual) || '<span class="muted">(no output)</span>');
    } else {
      const want = String(t.expected_output).replace(/\s+$/, "");
      const good = actual === want;
      if (good) passed++;
      lines.push(
        `<span class="${good ? "" : "err"}">${good ? "✓" : "✗"} sample ${i + 1}</span>` +
        (good ? "" : `\n   expected: ${escapeHtml(want)}\n   got:      ${escapeHtml(actual) || "(nothing)"}`)
      );
    }
    if (data.stderr) lines.push(`<span class="err">${escapeHtml(data.stderr.trimEnd())}</span>`);
  }

  const secs = ((performance.now() - started) / 1000).toFixed(2);
  if (samples.length) {
    const all = passed === samples.length;
    setStatus(all ? "ok" : "error", `${passed}/${samples.length} samples pass`, `${secs}s`);
    lines.push(all
      ? '\n<span class="muted">All samples pass. Hidden cases are still marked separately.</span>'
      : '\n<span class="muted">Samples are only part of the marking scheme.</span>');
  } else {
    setStatus("ok", "done", `${secs}s`);
  }

  $("console").innerHTML = lines.join("\n");
  btn.disabled = false;
});

// --- reset ---------------------------------------------------------------
$("resetBtn").addEventListener("click", () => {
  const q = questions[current];
  editor.setValue(q.starter_code || "");
  toast("Reset to the starter code");
});

// --- handing in ----------------------------------------------------------
$("handInBtn").addEventListener("click", async () => {
  await saveCurrent();
  const blank = questions.filter((q) => !(q.code || "").trim()).length;
  const warn = $("unansweredWarn");
  if (blank > 0) {
    warn.style.display = "block";
    warn.textContent = `${blank} question${blank === 1 ? " is" : "s are"} still blank. Blank answers score zero.`;
  } else {
    warn.style.display = "none";
  }
  $("confirmModal").classList.add("show");
});

const closeConfirm = () => $("confirmModal").classList.remove("show");
$("closeConfirm").addEventListener("click", closeConfirm);
$("cancelHandIn").addEventListener("click", closeConfirm);
$("confirmModal").addEventListener("click", (e) => { if (e.target.id === "confirmModal") closeConfirm(); });

$("confirmHandIn").addEventListener("click", async () => {
  const btn = $("confirmHandIn");
  btn.disabled = true;
  btn.textContent = "Marking…";
  handedIn = true;
  clearInterval(clockTimer);

  const { ok, data } = await api(`/api/student/attempts/${ATTEMPT_ID}/submit`, "POST");
  if (!ok) {
    handedIn = false;
    btn.disabled = false;
    btn.textContent = "Yes, hand in";
    startClock();
    toast(data.error || "Could not hand in — try again");
    return;
  }
  location.href = `/result?attempt=${ATTEMPT_ID}` + (data.needs_manual ? "&manual=1" : "");
});
