// A student's marked paper — read-only.

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const ATTEMPT_ID = params.get("attempt");

async function api(path) {
  const res = await fetch(path);
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function scoreClass(score, max) {
  if (max <= 0) return "part";
  if (score >= max) return "full";
  if (score <= 0) return "zero";
  return "part";
}

function renderCase(c, i) {
  const isHidden = c.hidden && c.actual === undefined;
  const verdict = c.skipped ? "not run" : c.passed ? "pass" : "fail";
  const cls = c.skipped ? "" : c.passed ? "pass" : "fail";

  if (isHidden) {
    // Hidden case: only pass/fail is known, never the input or expected output.
    return `
      <div class="case ${cls}">
        <div class="hd">
          <span>Hidden test ${i + 1}</span>
          <span class="verdict ${c.passed ? "pass" : "fail"}">${c.skipped ? "not run" : c.passed ? "✓ passed" : "✗ failed"}</span>
        </div>
      </div>`;
  }

  return `
    <div class="case ${cls}">
      <div class="hd">
        <span>Test ${i + 1}${c.hidden ? " (hidden)" : ""}</span>
        <span class="verdict ${c.passed ? "pass" : "fail"}">${c.skipped ? "not run" : c.passed ? "✓ passed" : "✗ failed"}</span>
      </div>
      ${c.skipped ? "" : `
      <div class="io">
        ${c.stdin ? `<div class="k">input</div><div class="v">${escapeHtml(c.stdin)}</div>` : ""}
        <div class="k">expected</div><div class="v">${escapeHtml(c.expected)}</div>
        <div class="k">got</div><div class="v">${escapeHtml(c.actual) || "(nothing)"}</div>
        ${c.stderr ? `<div class="k">stderr</div><div class="v">${escapeHtml(c.stderr)}</div>` : ""}
      </div>`}
    </div>`;
}

async function load() {
  if (!ATTEMPT_ID) { location.href = "/student"; return; }

  const me = await api("/api/me");
  $("whoami").textContent = me.data.full_name || me.data.username;

  const { ok, data } = await api(`/api/student/attempts/${ATTEMPT_ID}/result`);
  if (!ok) {
    document.querySelector(".page").innerHTML =
      `<div class="card"><div class="card__body">${escapeHtml(data.error || "Could not load this result.")}</div></div>`;
    return;
  }

  const { attempt, exam, questions } = data;
  const percent = attempt.max_score > 0 ? Math.round((attempt.total_score / attempt.max_score) * 1000) / 10 : 0;

  $("examTitle").textContent = exam.title;
  $("scoreBig").textContent = attempt.total_score;
  $("scoreOf").textContent = `out of ${attempt.max_score} · ${percent}%`;
  $("scoreBar").style.width = Math.min(100, percent) + "%";
  $("examSub").textContent =
    `Submitted ${new Date(attempt.submitted_at).toLocaleString()}` +
    (attempt.auto_closed ? " · auto-submitted when time ran out" : "");

  /*
   * Was any question left ungraded by an engine outage? The per-question
   * note always ends in this exact phrase for that case (see grader.js) —
   * a blank answer or a lecturer's own override note never does — so this
   * is the real signal, not the `?manual=1` link from the hand-in redirect,
   * which is lost the moment a student revisits this page later.
   */
  const needsManual = questions.some((q) => (q.grade_note || "").includes("needs marking by hand"));
  if (needsManual) $("manualNotice").style.display = "block";

  $("questions").innerHTML = questions.map((q, i) => `
    <div class="qresult">
      <div class="qresult__head">
        <span class="t">Question ${i + 1}</span>
        <span class="pillscore ${scoreClass(q.score, q.max_score)}">${q.score} / ${q.max_score} marks · ${q.passed_count}/${q.total_count} tests</span>
      </div>
      <div class="qresult__body">
        <p style="margin-bottom:12px; white-space:pre-wrap; color:var(--muted); font-size:13.5px">${escapeHtml(q.prompt)}</p>
        ${q.grade_note ? `<div class="notice">${escapeHtml(q.grade_note)}</div>` : ""}
        <div class="codeblock" style="margin-bottom:14px">${escapeHtml(q.code) || "<em style='color:#6b7796'>(no answer submitted)</em>"}</div>
        <div class="cases">${q.report.map((c, j) => renderCase(c, j)).join("") || '<span class="muted" style="font-size:13px">No test results.</span>'}</div>
      </div>
    </div>`).join("");
}

load();
