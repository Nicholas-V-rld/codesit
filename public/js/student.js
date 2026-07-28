// Student workspace logic.

let editor;
let LANGS = [];
const $ = (id) => document.getElementById(id);

const TEMPLATES = {
  python: '# Write your Python solution here\n\nprint("Hello, CodeSit!")\n',
  javascript: '// Write your JavaScript solution here\n\nconsole.log("Hello, CodeSit!");\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, CodeSit!");\n    }\n}\n',
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, CodeSit!" << endl;\n    return 0;\n}\n',
  c: '#include <stdio.h>\n\nint main() {\n    printf("Hello, CodeSit!\\n");\n    return 0;\n}\n',
  html: '<!DOCTYPE html>\n<html>\n  <body>\n    <h1 style="font-family:sans-serif">Hello, CodeSit!</h1>\n  </body>\n</html>\n',
};

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
function setStatus(state, text, meta = '') {
  $('statusbar').className = 'statusbar state-' + state;
  $('statusText').textContent = text;
  $('statusMeta').textContent = meta;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function tmpl(id) { return TEMPLATES[id] || ''; }

require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
require(['vs/editor/editor.main'], async function () {
  const { data } = await api('/api/meta', 'GET');
  LANGS = data.languages;
  $('language').innerHTML = LANGS.map((l) => `<option value="${l.id}">${l.label}</option>`).join('');

  editor = monaco.editor.create($('editor'), {
    value: tmpl('python'), language: 'python', theme: 'vs-dark',
    fontSize: 14, automaticLayout: true, minimap: { enabled: false },
    scrollBeyondLastLine: false, padding: { top: 12 },
  });

  $('language').addEventListener('change', () => {
    const l = LANGS.find((x) => x.id === $('language').value);
    monaco.editor.setModelLanguage(editor.getModel(), l.monaco);
    editor.setValue(tmpl(l.id));
    setStatus('ready', 'ready');
    $('preview').style.display = 'none';
    $('console').style.display = '';
  });

  loadMe();
  loadSubmissions();
});

async function loadMe() {
  const { data } = await api('/api/me', 'GET');
  $('whoami').textContent = data.full_name || data.username;
  $('p_name').value = data.full_name || '';
  $('p_matric').value = data.matric_number || '';
  $('p_dept').textContent = data.department || '—';
  $('p_level').textContent = data.level || '—';
}

$('saveProfile').addEventListener('click', async () => {
  const { ok } = await api('/api/profile', 'PUT', {
    full_name: $('p_name').value.trim(),
    matric_number: $('p_matric').value.trim(),
  });
  if (ok) { toast('Profile saved'); loadMe(); }
});

$('runBtn').addEventListener('click', runCode);
async function runCode() {
  const code = editor.getValue();
  if (!code.trim()) { toast('Write some code first'); return; }
  const language = $('language').value;

  // HTML is previewed in the browser, never sent to an engine.
  if (language === 'html') {
    $('console').style.display = 'none';
    const frame = $('preview');
    frame.style.display = 'block';
    frame.srcdoc = code;
    setStatus('ok', 'preview', 'rendered in browser');
    return;
  }

  $('preview').style.display = 'none';
  $('console').style.display = '';
  const btn = $('runBtn');
  btn.disabled = true;
  setStatus('running', 'running…');
  $('console').innerHTML = '<span class="muted">Running…</span>';

  const started = performance.now();
  const { data } = await api('/api/execute', 'POST', { code, language });
  const secs = ((performance.now() - started) / 1000).toFixed(2);

  if (data.note && !data.output && !data.stdout && !data.stderr) {
    setStatus('error', 'runner issue');
    $('console').innerHTML = `<span class="err">${escapeHtml(data.note)}</span>`;
  } else {
    setStatus(data.ok ? 'ok' : 'error', data.ok ? 'done' : 'errors', `${secs}s`);
    renderConsole(data);
  }
  btn.disabled = false;
}

function renderConsole(data) {
  const out = (data.stdout || '').trimEnd();
  const err = (data.stderr || '').trimEnd();
  let html = out ? escapeHtml(out) : '';
  if (err) html += (html ? '\n' : '') + `<span class="err">${escapeHtml(err)}</span>`;
  if (!html && data.output) html = escapeHtml(data.output);
  if (!html) html = '<span class="muted">(no output)</span>';
  $('console').innerHTML = html;
}

$('submitBtn').addEventListener('click', async () => {
  const code = editor.getValue();
  if (!code.trim()) { toast('Nothing to submit'); return; }
  const language = $('language').value;
  const btn = $('submitBtn');
  btn.disabled = true;
  const status = $('statusbar').classList.contains('state-error') ? 'error' : 'submitted';
  const { ok, data } = await api('/api/submit', 'POST', {
    code, language,
    title: $('title').value.trim(),
    output: $('console').innerText,
    status,
  });
  btn.disabled = false;
  if (ok && data.ok) { toast('Submitted ✓'); loadSubmissions(); }
  else toast(data.error || 'Could not submit');
});

async function loadSubmissions() {
  const { data } = await api('/api/submissions', 'GET');
  const list = $('subList');
  if (!data.length) { list.innerHTML = '<div class="empty">No submissions yet</div>'; return; }
  list.innerHTML = data.map((s) => `
    <div class="sub-item ${s.status === 'error' ? 'err' : ''}">
      <div class="lang">${s.language.toUpperCase()}</div>
      ${s.title ? `<div class="ttl">${escapeHtml(s.title)}</div>` : ''}
      <div class="when">${new Date(s.submitted_at).toLocaleString()}</div>
    </div>`).join('');
}

$('logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', 'POST');
  window.location.href = '/login';
});
