// Lecturer: results for one exam, plus per-answer marking overrides.

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const EXAM_ID = params.get("exam");

let examMeta = null;

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}
async function api(path, method, body) {
  const res = await fetch(path, {
    method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

(async function init() {
  if (!EXAM_ID) { location.href = "/lecturer"; return; }

  const me = await api("/api/me", "GET");
  $("whoami").textContent = me.data.full_name || me.data.username;

  await load();
})();

async function load() {
  const { ok, data } = await api(`/api/exams/${EXAM_ID}/results`, "GET");
  if (!ok) { toast(data.error || "Could not load results"); return; }

  examMeta = data.exam;
  $("examTitle").textContent = examMeta.title;
  $("examMeta").textContent = `${examMeta.level} · ${examMeta.total_marks} marks · ${examMeta.duration_mins} min`;
  $("sCohort").textContent = data.stats.cohort;
  $("sSubmitted").textContent = data.stats.submitted;
  $("sSitting").textContent = data.stats.sitting;
  $("sAvg").textContent = data.stats.averagePercent + "%";
  $("csvLink").href = `/api/exams/${EXAM_ID}/results.csv`;

  const toggleBtn = $("togglePublish");
  toggleBtn.textContent = examMeta.published ? "Unpublish" : "Publish";
  toggleBtn.onclick = async () => {
    toggleBtn.disabled = true;
    const action = examMeta.published ? "unpublish" : "publish";
    const { ok, data: r } = await api(`/api/exams/${EXAM_ID}/${action}`, "POST");
    toggleBtn.disabled = false;
    if (ok) { toast(action === "publish" ? "Published" : "Unpublished"); load(); }
    else toast(r.error || "Could not update");
  };

  const rows = data.results.map((r) => {
    const percent = r.max_score > 0 ? Math.round((r.total_score / r.max_score) * 1000) / 10 : 0;
    const statusLabel = r.status === "submitted"
      ? (r.auto_closed ? '<span class="tag tag-err">time up</span>' : '<span class="tag tag-lvl">submitted</span>')
      : '<span class="tag">sitting</span>';
    return `
      <tr>
        <td class="who"><div class="name">${escapeHtml(r.full_name || r.username)}</div><div class="meta">${escapeHtml(r.matric_number || r.username)}</div></td>
        <td><span class="tag tag-lvl">${r.level || "—"}</span></td>
        <td>${statusLabel}</td>
        <td>${r.status === "submitted" ? `${r.total_score} / ${r.max_score} <span class="muted" style="font-size:12px">(${percent}%)</span>` : '<span class="muted">—</span>'}</td>
        <td>${r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '<span class="muted">—</span>'}</td>
        <td>${r.status === "submitted" ? `<button class="btn btn-ghost btn-sm" data-attempt="${r.attempt_id}">Review</button>` : ""}</td>
      </tr>`;
  });

  const notStarted = (data.notStarted || []).map((s) => `
    <tr>
      <td class="who"><div class="name">${escapeHtml(s.full_name || s.username)}</div><div class="meta">${escapeHtml(s.matric_number || s.username)}</div></td>
      <td><span class="tag tag-lvl">${examMeta.level}</span></td>
      <td><span class="tag">not started</span></td>
      <td><span class="muted">—</span></td>
      <td><span class="muted">—</span></td>
      <td></td>
    </tr>`);

  const body = $("resultsBody");
  const all = rows.concat(notStarted);
  body.innerHTML = all.length ? all.join("") : '<tr><td colspan="6"><div class="empty">Nobody in this cohort yet.</div></td></tr>';
  body.querySelectorAll("[data-attempt]").forEach((b) =>
    b.addEventListener("click", () => openPaper(Number(b.dataset.attempt)))
  );
}

// --- reviewing one paper ---------------------------------------------------
function caseHtml(c, i) {
  const isHiddenBlind = c.hidden && c.actual === undefined;
  if (isHiddenBlind) {
    return `<div class="case ${c.passed ? "pass" : "fail"}"><div class="hd"><span>Hidden test ${i + 1}</span><span class="verdict ${c.passed ? "pass" : "fail"}">${c.passed ? "✓ passed" : "✗ failed"}</span></div></div>`;
  }
  return `
    <div class="case ${c.passed ? "pass" : "fail"}">
      <div class="hd"><span>Test ${i + 1}${c.hidden ? " (hidden)" : ""}</span><span class="verdict ${c.passed ? "pass" : "fail"}">${c.passed ? "✓ passed" : "✗ failed"}</span></div>
      <div class="io">
        ${c.stdin ? `<div class="k">input</div><div class="v">${escapeHtml(c.stdin)}</div>` : ""}
        <div class="k">expected</div><div class="v">${escapeHtml(c.expected)}</div>
        <div class="k">got</div><div class="v">${escapeHtml(c.actual) || "(nothing)"}</div>
      </div>
    </div>`;
}

async function openPaper(attemptId) {
  const { ok, data } = await api(`/api/exam-attempts/${attemptId}`, "GET");
  if (!ok) { toast(data.error || "Could not open this paper"); return; }

  const { attempt, answers } = data;
  $("modalTitle").textContent = `${attempt.full_name || attempt.username} — ${data.exam.title}`;

  $("modalBody").innerHTML = `
    <div class="detail-grid">
      <div><div class="k">Student</div><div class="v">${escapeHtml(attempt.full_name || attempt.username)}</div></div>
      <div><div class="k">Matric</div><div class="v">${escapeHtml(attempt.matric_number || "—")}</div></div>
      <div><div class="k">Total</div><div class="v" id="paperTotal">${attempt.total_score} / ${attempt.max_score}</div></div>
      <div><div class="k">Submitted</div><div class="v">${new Date(attempt.submitted_at).toLocaleString()}</div></div>
    </div>
    ${answers.map(({ question, answer }) => `
      <div class="qresult">
        <div class="qresult__head">
          <span class="t">Q${question.position + 1}: ${escapeHtml(question.language.toUpperCase())}</span>
          <span class="pillscore ${!answer ? "zero" : answer.score >= answer.max_score ? "full" : answer.score <= 0 ? "zero" : "part"}" id="scoreTag-${question.id}">
            ${answer ? `${answer.score} / ${answer.max_score}` : "no answer"}
          </span>
        </div>
        <div class="qresult__body">
          <p style="margin-bottom:12px; color:var(--muted); font-size:13.5px; white-space:pre-wrap">${escapeHtml(question.prompt)}</p>
          ${answer && answer.grade_note ? `<div class="notice">${escapeHtml(answer.grade_note)}</div>` : ""}
          <div class="codeblock" style="margin-bottom:14px">${escapeHtml(answer?.code) || "<em style='color:#6b7796'>(no answer)</em>"}</div>
          <div class="cases">${(answer?.report || []).map((c, i) => caseHtml(c, i)).join("") || '<span class="muted" style="font-size:13px">No test results.</span>'}</div>
          ${answer ? `
          <div style="display:flex; align-items:center; gap:10px; margin-top:14px; border-top:1px solid var(--line); padding-top:14px">
            <label style="font-size:13px; color:var(--muted)">Override mark</label>
            <input class="input" style="width:90px" type="number" min="0" max="${answer.max_score}" value="${answer.score}" id="override-${answer.id}" />
            <span style="font-size:13px; color:var(--muted)">/ ${answer.max_score}</span>
            <button class="btn btn-ghost btn-sm" data-override="${answer.id}">Save</button>
          </div>` : ""}
        </div>
      </div>`).join("")}
  `;

  $("modalBody").querySelectorAll("[data-override]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const answerId = btn.dataset.override;
      const score = Number($(`#override-${answerId}`).value);
      btn.disabled = true;
      const { ok, data: r } = await api(`/api/exam-answers/${answerId}/score`, "PUT", { score });
      btn.disabled = false;
      if (ok) {
        toast("Mark updated");
        $("paperTotal").textContent = `${r.total_score} / ${attempt.max_score}`;
        load(); // refresh the table behind the modal
      } else {
        toast(r.error || "Could not save");
      }
    });
  });

  $("modal").classList.add("show");
}

$("closeModal").addEventListener("click", () => $("modal").classList.remove("show"));
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("modal").classList.remove("show"); });

$("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", "POST");
  window.location.href = "/login";
});
