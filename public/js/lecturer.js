// Lecturer dashboard logic.

let modalEditor;
let currentSub = null;
let allSubs = [];
let activeLevel = 'all';
let LANGS = [];
const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
async function api(path, method, body) {
  const res = await fetch(path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
require(['vs/editor/editor.main'], async function () {
  const { data } = await api('/api/meta', 'GET');
  LANGS = data.languages;
  loadMe();
  await loadStats();
  loadSubmissions();
});

async function loadMe() {
  const { data } = await api('/api/me', 'GET');
  $('whoami').textContent = data.full_name || data.username;
}

async function loadStats() {
  const { data } = await api('/api/lecturer/stats', 'GET');
  $('mDept').textContent = data.department || '—';
  $('mStudents').textContent = data.totalStudents ?? 0;
  $('mSubs').textContent = data.totalSubmissions ?? 0;
  $('mLevels').innerHTML = (data.levels || []).map((l) => `<span>${l}</span>`).join('') || '<span>none</span>';

  $('statGrid').innerHTML = (data.perLevel || []).map((b) => `
    <div class="stat">
      <div class="lvl">${b.level}</div>
      <div class="big">${b.students}</div>
      <div class="sm">${b.students === 1 ? 'student' : 'students'} · ${b.submissions} ${b.submissions === 1 ? 'submission' : 'submissions'}</div>
    </div>`).join('');

  const levels = data.levels || [];
  $('filters').innerHTML =
    `<div class="pill on" data-level="all">All levels</div>` +
    levels.map((l) => `<div class="pill" data-level="${l}">${l}</div>`).join('');
  $('filters').querySelectorAll('.pill').forEach((p) => {
    p.addEventListener('click', () => {
      $('filters').querySelectorAll('.pill').forEach((x) => x.classList.remove('on'));
      p.classList.add('on');
      activeLevel = p.dataset.level;
      renderTable();
    });
  });
}

async function loadSubmissions() {
  const { data } = await api('/api/lecturer/submissions', 'GET');
  allSubs = Array.isArray(data) ? data : [];
  renderTable();
}

function renderTable() {
  const rows = activeLevel === 'all' ? allSubs : allSubs.filter((s) => s.level === activeLevel);
  const body = $('subBody');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6"><div class="empty">No submissions to show</div></td></tr>';
    return;
  }
  body.innerHTML = rows.map((s) => `
    <tr>
      <td class="who">
        <div class="name">${escapeHtml(s.full_name || s.username)}</div>
        <div class="meta">${escapeHtml(s.matric_number || s.username)}</div>
      </td>
      <td><span class="tag tag-lvl">${s.level || '—'}</span></td>
      <td>${s.title ? escapeHtml(s.title) : '<span class="muted">—</span>'}</td>
      <td><span class="tag ${s.status === 'error' ? 'tag-err' : ''}">${s.language.toUpperCase()}</span></td>
      <td>${new Date(s.submitted_at).toLocaleString()}</td>
      <td><button class="btn btn-ghost btn-sm" data-id="${s.id}">View</button></td>
    </tr>`).join('');
  body.querySelectorAll('button[data-id]').forEach((b) =>
    b.addEventListener('click', () => openModal(Number(b.dataset.id)))
  );
}

$('refreshBtn').addEventListener('click', () => { loadStats(); loadSubmissions(); });

function openModal(id) {
  const s = allSubs.find((x) => x.id === id);
  if (!s) return;
  currentSub = s;

  $('dName').textContent = s.full_name || s.username;
  $('dMatric').textContent = s.matric_number || '—';
  $('dLevel').textContent = s.level || '—';
  $('dLang').textContent = s.language.toUpperCase();
  $('dWhen').textContent = new Date(s.submitted_at).toLocaleString();

  setModalStatus('ready', 'not run yet');
  $('modalConsole').innerHTML = '<span class="muted">Run the code to verify the student\'s output.</span>';

  const monacoLang = (LANGS.find((l) => l.id === s.language) || {}).monaco || s.language;
  if (!modalEditor) {
    modalEditor = monaco.editor.create($('modalEditor'), {
      value: s.code, language: monacoLang, theme: 'vs-dark',
      fontSize: 13, automaticLayout: true, minimap: { enabled: false }, padding: { top: 10 },
    });
  } else {
    modalEditor.setValue(s.code);
    monaco.editor.setModelLanguage(modalEditor.getModel(), monacoLang);
  }
  $('modal').classList.add('show');
}

function setModalStatus(state, text) {
  const bar = $('mStatus');
  bar.className = 'statusbar state-' + state;
  bar.style.borderRadius = '8px';
  bar.style.flex = '0 0 auto';
  $('mStatusText').textContent = text;
}

$('closeModal').addEventListener('click', () => $('modal').classList.remove('show'));
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('modal').classList.remove('show'); });

$('verifyBtn').addEventListener('click', async () => {
  const code = modalEditor.getValue();
  const language = currentSub.language;
  const btn = $('verifyBtn');
  btn.disabled = true;
  setModalStatus('running', 'running…');
  $('modalConsole').innerHTML = '<span class="muted">Running…</span>';

  const { data } = await api('/api/execute', 'POST', { code, language });
  if (data.note && !data.output && !data.stdout && !data.stderr) {
    setModalStatus('error', 'runner issue');
    $('modalConsole').innerHTML = `<span class="err">${escapeHtml(data.note)}</span>`;
  } else {
    setModalStatus(data.ok ? 'ok' : 'error', data.ok ? 'done' : 'errors');
    const out = (data.stdout || '').trimEnd();
    const err = (data.stderr || '').trimEnd();
    let html = out ? escapeHtml(out) : '';
    if (err) html += (html ? '\n' : '') + `<span class="err">${escapeHtml(err)}</span>`;
    if (!html && data.output) html = escapeHtml(data.output);
    $('modalConsole').innerHTML = html || '<span class="muted">(no output)</span>';
  }
  btn.disabled = false;
});

$('logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', 'POST');
  window.location.href = '/login';
});
