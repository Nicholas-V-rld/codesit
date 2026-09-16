// Building (and editing) an exam.

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const EDIT_ID = params.get("exam");

let LEVELS = [];
let LANGS = [];
let questions = [];
let qSeq = 0;
let published = false;

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
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// --- data model ------------------------------------------------------------
// Each question keeps a local `key` (not sent to the server) so its DOM block
// survives re-renders even before it has a database id.
function blankQuestion() {
  return { key: ++qSeq, prompt: "", language: "python", starter_code: "", tests: [blankTest()] };
}
function blankTest() {
  return { stdin: "", expected_output: "", hidden: false, points: 5 };
}

// --- boot --------------------------------------------------------------
(async function init() {
  const me = await api("/api/me", "GET");
  $("whoami").textContent = me.data.full_name || me.data.username;

  const meta = await api("/api/meta", "GET");
  LANGS = meta.data.languages.filter((l) => l.id !== "html");

  // Only offer levels this lecturer actually teaches — the server rejects
  // anything else anyway, but the form should never offer a choice that
  // can only fail.
  const myLevels = new Set(me.data.levels || []);
  LEVELS = meta.data.levels.filter((l) => myLevels.has(l.value));
  if (LEVELS.length === 0) {
    toast("You aren't set up to teach any level yet — ask an admin to fix your account.");
  }
  $("level").innerHTML = LEVELS.map((l) => `<option value="${l.value}">${l.label}</option>`).join("");

  if (EDIT_ID) {
    $("formTitle").textContent = "Edit exam";
    const { ok, data } = await api(`/api/exams/${EDIT_ID}`, "GET");
    if (!ok) { toast(data.error || "Could not load that exam"); location.href = "/lecturer"; return; }

    published = !!data.published;
    if (published) {
      $("lockedNotice").style.display = "block";
      document.querySelectorAll("input, select, textarea, button").forEach((el) => {
        if (el.id !== "logoutBtn") el.disabled = true;
      });
    }

    $("title").value = data.title;
    $("level").value = data.level;
    $("duration").value = data.duration_mins;
    $("instructions").value = data.instructions || "";
    questions = data.questions.map((q) => ({
      key: ++qSeq, id: q.id, prompt: q.prompt, language: q.language, starter_code: q.starter_code,
      tests: q.tests.map((t) => ({ stdin: t.stdin, expected_output: t.expected_output, hidden: !!t.hidden, points: t.points })),
    }));
  } else {
    questions = [blankQuestion()];
  }

  render();
})();

// --- rendering -----------------------------------------------------------
function render() {
  $("questions").innerHTML = questions.map((q, qi) => `
    <div class="qcard" data-qkey="${q.key}">
      <div class="qcard__head">
        <span class="n">Question ${qi + 1}</span>
        <div style="display:flex; align-items:center; gap:10px">
          <select class="input qlang" style="width:auto; padding:6px 10px">
            ${LANGS.map((l) => `<option value="${l.id}" ${l.id === q.language ? "selected" : ""}>${l.label}</option>`).join("")}
          </select>
          ${questions.length > 1 ? `<button class="icon-x qremove" title="Remove question">✕</button>` : ""}
        </div>
      </div>
      <div class="qcard__body">
        <div class="field">
          <label>Prompt</label>
          <textarea class="input qprompt" placeholder="Describe the problem the student must solve.">${escapeHtml(q.prompt)}</textarea>
        </div>
        <div class="field">
          <label>Starter code (optional — shown in the student's editor)</label>
          <textarea class="input qstarter" placeholder="e.g. a function signature to fill in">${escapeHtml(q.starter_code)}</textarea>
        </div>
        <div class="field" style="margin-bottom:8px">
          <label>Test cases (marking scheme)</label>
        </div>
        <div class="tests">
          ${q.tests.map((t, ti) => `
            <div class="tc" data-ti="${ti}">
              <div class="tc__head">
                <span class="n">Test ${ti + 1}</span>
                <div style="display:flex; align-items:center; gap:12px">
                  <label class="switch"><input type="checkbox" class="thidden" ${t.hidden ? "checked" : ""}/> hidden</label>
                  ${q.tests.length > 1 ? `<button class="icon-x tremove" title="Remove test">✕</button>` : ""}
                </div>
              </div>
              <div class="tc-grid">
                <div class="field" style="margin:0">
                  <label>Input (stdin, optional)</label>
                  <textarea class="input tstdin">${escapeHtml(t.stdin)}</textarea>
                </div>
                <div class="field" style="margin:0">
                  <label>Expected output</label>
                  <textarea class="input texpected">${escapeHtml(t.expected_output)}</textarea>
                </div>
              </div>
              <div class="field" style="margin:10px 0 0; max-width:140px">
                <label>Marks</label>
                <input class="input tpoints" type="number" min="1" max="100" value="${t.points}" />
              </div>
            </div>`).join("")}
        </div>
        <button class="btn btn-ghost btn-sm addTest" style="margin-top:4px">+ Add test case</button>
      </div>
    </div>`).join("");

  wireEvents();
  updateTotal();
}

function readQuestionsFromDom() {
  document.querySelectorAll(".qcard").forEach((card) => {
    const key = Number(card.dataset.qkey);
    const q = questions.find((x) => x.key === key);
    if (!q) return;
    q.prompt = card.querySelector(".qprompt").value;
    q.language = card.querySelector(".qlang").value;
    q.starter_code = card.querySelector(".qstarter").value;
    q.tests = [...card.querySelectorAll(".tc")].map((tc) => ({
      stdin: tc.querySelector(".tstdin").value,
      expected_output: tc.querySelector(".texpected").value,
      hidden: tc.querySelector(".thidden").checked,
      points: Number(tc.querySelector(".tpoints").value) || 0,
    }));
  });
}

function updateTotal() {
  readQuestionsFromDom();
  const total = questions.reduce((sum, q) => sum + q.tests.reduce((s, t) => s + (Number(t.points) || 0), 0), 0);
  $("totalMarks").textContent = `${total} mark${total === 1 ? "" : "s"} total across ${questions.length} question${questions.length === 1 ? "" : "s"}`;
}

function wireEvents() {
  document.querySelectorAll(".qcard").forEach((card) => {
    card.querySelector(".qremove")?.addEventListener("click", () => {
      const key = Number(card.dataset.qkey);
      questions = questions.filter((q) => q.key !== key);
      render();
    });
    card.querySelector(".addTest").addEventListener("click", () => {
      readQuestionsFromDom();
      const key = Number(card.dataset.qkey);
      questions.find((q) => q.key === key).tests.push(blankTest());
      render();
    });
    card.querySelectorAll(".tremove").forEach((btn) => {
      btn.addEventListener("click", () => {
        readQuestionsFromDom();
        const key = Number(card.dataset.qkey);
        const q = questions.find((x) => x.key === key);
        const ti = Number(btn.closest(".tc").dataset.ti);
        q.tests.splice(ti, 1);
        render();
      });
    });
    card.querySelectorAll("input, textarea, select").forEach((el) => {
      el.addEventListener("input", updateTotal);
    });
  });
}

$("addQuestion").addEventListener("click", () => {
  readQuestionsFromDom();
  questions.push(blankQuestion());
  render();
});

// --- saving ----------------------------------------------------------------
function payload() {
  readQuestionsFromDom();
  return {
    title: $("title").value.trim(),
    level: $("level").value,
    duration_mins: Number($("duration").value),
    instructions: $("instructions").value.trim(),
    questions: questions.map((q) => ({
      prompt: q.prompt, language: q.language, starter_code: q.starter_code,
      tests: q.tests.map((t) => ({ stdin: t.stdin, expected_output: t.expected_output, hidden: t.hidden, points: t.points })),
    })),
  };
}

async function save() {
  const body = payload();
  const { ok, data } = EDIT_ID
    ? await api(`/api/exams/${EDIT_ID}`, "PUT", body)
    : await api("/api/exams", "POST", body);
  if (!ok) { toast(data.error || "Could not save"); return null; }
  return EDIT_ID || data.id;
}

$("saveDraftBtn").addEventListener("click", async () => {
  const btn = $("saveDraftBtn");
  btn.disabled = true;
  const id = await save();
  btn.disabled = false;
  if (id) { toast("Draft saved"); if (!EDIT_ID) location.href = `/exam-builder?exam=${id}`; }
});

$("publishBtn").addEventListener("click", async () => {
  const btn = $("publishBtn");
  btn.disabled = true;
  const id = await save();
  if (!id) { btn.disabled = false; return; }
  const { ok, data } = await api(`/api/exams/${id}/publish`, "POST");
  btn.disabled = false;
  if (ok) { toast("Published — students can see it now"); location.href = "/lecturer"; }
  else toast(data.error || "Could not publish");
});

$("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", "POST");
  window.location.href = "/login";
});
