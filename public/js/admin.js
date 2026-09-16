// Administration page logic.

const $ = (id) => document.getElementById(id);
let META = { departments: [], levels: [] };
let ME = null;
let USERS = [];
let filter = { role: '', status: '', q: '' };
let editing = null;        // the account open in the editor, or null when creating
let createRole = 'student';

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}
async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { window.location.href = '/login'; return { ok: false, data: {} }; }
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const levelLabel = (v) => (META.levels.find((l) => l.value === v) || { label: v }).label;
const when = (ts) => {
  if (!ts) return '';
  const d = new Date(/[TZ]/.test(ts) ? ts : ts.replace(' ', 'T') + 'Z');
  return isNaN(d) ? ts : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
function showAlert(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.toggle('show', Boolean(msg));
}

// ---------------------------------------------------------------- tabs
function showTab(name) {
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  if (name === 'accounts') loadUsers();
  if (name === 'exams') loadExams();
  if (name === 'overview') loadOverview();
}
document.querySelectorAll('#tabs a').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  history.replaceState(null, '', '#' + a.dataset.tab);
  showTab(a.dataset.tab);
}));

// ------------------------------------------------------------ overview
async function loadOverview() {
  const { data } = await api('/api/admin/overview');
  $('mStudents').textContent = data.students ?? 0;
  $('mLecturers').textContent = data.lecturers ?? 0;
  $('mExams').textContent = data.exams ?? 0;
  $('mLive').textContent = data.liveExams ?? 0;
  $('mPapers').textContent = data.papersHandedIn ?? 0;
  $('mSitting').textContent = data.sittingNow ?? 0;
  const pending = data.pendingLecturers || 0;
  $('pendingCount').hidden = !pending;
  $('pendingCount').textContent = pending;

  $('deptBody').innerHTML = (data.departments || []).length
    ? data.departments.map((d) => `
        <tr><td>${esc(d.department)}</td><td>${d.students}</td><td>${d.lecturers}</td><td>${d.exams}</td></tr>`).join('')
    : '<tr><td colspan="4"><div class="empty">No accounts yet.</div></td></tr>';

  const { data: list } = await api('/api/admin/users?role=lecturer&status=pending');
  $('approvals').innerHTML = Array.isArray(list) && list.length
    ? list.map((u) => `
        <div class="approval">
          <div class="grow">
            <div class="name">${esc(u.full_name || u.username)} <span class="muted-mono">@${esc(u.username)}</span></div>
            <div class="meta">${esc(u.department)} · teaches ${u.levels.map(levelLabel).join(', ') || '—'}${u.staff_id ? ` · staff ID ${esc(u.staff_id)}` : ''} · registered ${when(u.created_at)}</div>
          </div>
          <button class="btn btn-run btn-sm" data-approve="${u.id}">Approve</button>
          <button class="btn btn-ghost btn-sm" data-reject="${u.id}">Reject</button>
        </div>`).join('')
    : '<div class="empty">No lecturers are waiting.</div>';
}

$('approvals').addEventListener('click', async (e) => {
  const approve = e.target.closest('[data-approve]');
  const reject = e.target.closest('[data-reject]');
  if (approve) {
    approve.disabled = true;
    const { ok, data } = await api(`/api/admin/users/${approve.dataset.approve}/status`, 'POST', { status: 'active' });
    toast(ok ? 'Lecturer approved — they can sign in now.' : data.error);
    loadOverview();
  }
  if (reject) {
    if (!confirm('Reject this registration? The account will be deleted.')) return;
    reject.disabled = true;
    const { ok, data } = await api(`/api/admin/users/${reject.dataset.reject}`, 'DELETE');
    toast(ok ? 'Registration rejected.' : data.error);
    loadOverview();
  }
});

// ------------------------------------------------------------ accounts
const statusTag = (s) => ({
  active: '<span class="status-tag live">Active</span>',
  pending: '<span class="status-tag pending">Pending</span>',
  suspended: '<span class="status-tag suspended">Suspended</span>',
}[s] || esc(s));
const roleTag = (r) => `<span class="tag ${r === 'admin' ? 'tag-admin' : ''}">${esc(r)}</span>`;

async function loadUsers() {
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
  const { data } = await api('/api/admin/users' + (qs ? '?' + qs : ''));
  USERS = Array.isArray(data) ? data : [];
  $('userBody').innerHTML = USERS.length
    ? USERS.map((u) => `
        <tr>
          <td class="who">
            <div class="name">${esc(u.full_name || u.username)}${u.id === ME.id ? ' <span class="muted-mono">(you)</span>' : ''}</div>
            <div class="meta">@${esc(u.username)}${u.matric_number ? ' · ' + esc(u.matric_number) : ''}${u.staff_id ? ' · ' + esc(u.staff_id) : ''}</div>
          </td>
          <td>${roleTag(u.role)}</td>
          <td>${esc(u.department) || '<span class="muted-mono">—</span>'}</td>
          <td>${u.role === 'student' ? `<span class="tag tag-lvl">${esc(levelLabel(u.level))}</span>`
              : u.role === 'lecturer' ? u.levels.map((l) => `<span class="tag tag-lvl">${esc(levelLabel(l))}</span>`).join(' ')
              : '<span class="muted-mono">—</span>'}</td>
          <td>${statusTag(u.status)}</td>
          <td style="text-align:right">
            ${u.status === 'pending' ? `<button class="btn btn-run btn-sm" data-approve-row="${u.id}">Approve</button>` : ''}
            <button class="btn btn-ghost btn-sm" data-edit="${u.id}">Manage</button>
          </td>
        </tr>`).join('')
    : '<tr><td colspan="6"><div class="empty">No accounts match.</div></td></tr>';
}

$('userBody').addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  const approve = e.target.closest('[data-approve-row]');
  if (edit) openEditor(USERS.find((u) => u.id === Number(edit.dataset.edit)));
  if (approve) {
    approve.disabled = true;
    const { ok, data } = await api(`/api/admin/users/${approve.dataset.approveRow}/status`, 'POST', { status: 'active' });
    toast(ok ? 'Lecturer approved.' : data.error);
    loadUsers();
    loadOverview();
  }
});

function bindPills(containerId, key) {
  $(containerId).addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    $(containerId).querySelectorAll('.pill').forEach((p) => p.classList.toggle('on', p === pill));
    filter[key] = pill.dataset[key];
    loadUsers();
  });
}
bindPills('roleFilters', 'role');
bindPills('statusFilters', 'status');
let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { filter.q = $('search').value.trim(); loadUsers(); }, 250);
});

// ------------------------------------------------------ account editor
function setRoleFields(role) {
  document.querySelectorAll('#userModal .student-only').forEach((el) => { el.hidden = role !== 'student'; });
  document.querySelectorAll('#userModal .lecturer-only').forEach((el) => { el.hidden = role !== 'lecturer'; });
  document.querySelectorAll('#userModal .not-admin').forEach((el) => { el.hidden = role === 'admin'; });
}
function setLevelChecks(selected) {
  $('fLevels').innerHTML = META.levels.map((l) => `
    <label class="check ${selected.includes(l.value) ? 'on' : ''}">
      <input type="checkbox" value="${l.value}" ${selected.includes(l.value) ? 'checked' : ''}><span>${l.label}</span>
    </label>`).join('');
}
$('fLevels').addEventListener('change', (e) => {
  e.target.closest('.check').classList.toggle('on', e.target.checked);
});

function openEditor(user) {
  editing = user || null;
  const role = user ? user.role : createRole;
  showAlert('userAlert', '');
  $('userModalTitle').textContent = user ? `${user.full_name || user.username} · @${user.username}` : 'New account';
  $('roleField').hidden = Boolean(user);
  document.querySelectorAll('#userModal .create-only').forEach((el) => { el.hidden = Boolean(user); });
  document.querySelectorAll('#userModal .edit-only').forEach((el) => { el.hidden = !user; });

  $('fFullName').value = user ? user.full_name : '';
  $('fUsername').value = '';
  $('fPassword').value = '';
  $('fDept').value = user && user.department ? user.department : META.departments[0];
  $('fLevel').value = user && user.level ? user.level : META.levels[0].value;
  $('fMatric').value = user ? user.matric_number || '' : '';
  $('fStaff').value = user ? user.staff_id || '' : '';
  setLevelChecks(user ? user.levels : []);
  setRoleFields(role);
  $('userSave').textContent = user ? 'Save changes' : 'Create account';

  if (user) {
    const self = user.id === ME.id;
    const suspended = user.status === 'suspended';
    const pending = user.status === 'pending';
    $('statusActionTitle').textContent = suspended ? 'Reactivate' : pending ? 'Approve' : 'Suspend';
    $('statusActionHint').textContent = suspended || pending
      ? 'They will be able to sign in again.'
      : 'They can no longer sign in, and are signed out at once.';
    $('statusBtn').textContent = $('statusActionTitle').textContent;
    $('statusBtn').disabled = self;
    const hasRecords = user.exam_count > 0 || user.attempt_count > 0;
    $('deleteBtn').disabled = self || hasRecords;
    $('deleteHint').textContent = self ? 'You cannot delete your own account.'
      : hasRecords ? `Has ${user.exam_count ? `${user.exam_count} exam(s)` : `${user.attempt_count} exam paper(s)`} — suspend instead, so no results are lost.`
      : 'Permanently removes the account and its practice submissions.';
    $('resetPassword').value = '';
  }
  $('userModal').classList.add('show');
  $('fFullName').focus();
}

$('newUserBtn').addEventListener('click', () => openEditor(null));
$('roleTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.roletab');
  if (!tab) return;
  createRole = tab.dataset.role;
  $('roleTabs').querySelectorAll('.roletab').forEach((t) => t.classList.toggle('on', t === tab));
  setRoleFields(createRole);
});

$('userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const role = editing ? editing.role : createRole;
  const body = {
    role,
    full_name: $('fFullName').value.trim(),
    department: $('fDept').value,
    level: $('fLevel').value,
    matric_number: $('fMatric').value.trim(),
    staff_id: $('fStaff').value.trim(),
    teaching_levels: [...$('fLevels').querySelectorAll('input:checked')].map((i) => i.value),
  };
  if (!editing) {
    body.username = $('fUsername').value.trim();
    body.password = $('fPassword').value;
  }
  $('userSave').disabled = true;
  const { ok, data } = editing
    ? await api(`/api/admin/users/${editing.id}`, 'PUT', body)
    : await api('/api/admin/users', 'POST', body);
  $('userSave').disabled = false;
  if (!ok) return showAlert('userAlert', data.error || 'Could not save.');
  closeModals();
  toast(editing ? 'Account updated.' : `Account @${body.username} created.`);
  loadUsers();
  loadOverview();
});

$('resetBtn').addEventListener('click', async () => {
  const password = $('resetPassword').value;
  const { ok, data } = await api(`/api/admin/users/${editing.id}/password`, 'POST', { password });
  if (!ok) return showAlert('userAlert', data.error);
  showAlert('userAlert', '');
  $('resetPassword').value = '';
  toast('Password changed.');
});

$('statusBtn').addEventListener('click', async () => {
  const status = editing.status === 'active' ? 'suspended' : 'active';
  if (status === 'suspended' && !confirm(`Suspend @${editing.username}? They will be signed out immediately.`)) return;
  const { ok, data } = await api(`/api/admin/users/${editing.id}/status`, 'POST', { status });
  if (!ok) return showAlert('userAlert', data.error);
  closeModals();
  toast(status === 'active' ? 'Account active.' : 'Account suspended.');
  loadUsers();
  loadOverview();
});

$('deleteBtn').addEventListener('click', async () => {
  if (!confirm(`Delete @${editing.username} permanently? This cannot be undone.`)) return;
  const { ok, data } = await api(`/api/admin/users/${editing.id}`, 'DELETE');
  if (!ok) return showAlert('userAlert', data.error);
  closeModals();
  toast('Account deleted.');
  loadUsers();
  loadOverview();
});

// --------------------------------------------------------------- exams
async function loadExams() {
  const { data } = await api('/api/admin/exams');
  const rows = Array.isArray(data) ? data : [];
  $('examBody').innerHTML = rows.length
    ? rows.map((e) => `
        <tr>
          <td class="who">
            <div class="name">${esc(e.title)}</div>
            <div class="meta">${e.question_count} question${e.question_count === 1 ? '' : 's'} · ${e.duration_mins} min · created ${when(e.created_at)}</div>
          </td>
          <td class="who">
            <div class="name">${esc(e.lecturer_name || e.lecturer_username)}</div>
            <div class="meta">@${esc(e.lecturer_username)}${e.lecturer_status !== 'active' ? ' · ' + esc(e.lecturer_status) : ''}</div>
          </td>
          <td>${esc(e.department)}<br><span class="tag tag-lvl">${esc(levelLabel(e.level))}</span></td>
          <td>${e.submitted_count}${e.sitting_count ? ` <span class="muted-mono">+${e.sitting_count} sitting</span>` : ''}</td>
          <td>${e.submitted_count ? e.average_percent + '%' : '—'}</td>
          <td>${e.published ? '<span class="status-tag live">Live</span>' : '<span class="status-tag draft">Draft</span>'}</td>
          <td style="text-align:right">${e.published ? `<button class="btn btn-ghost btn-sm" data-unpublish="${e.id}">Unpublish</button>` : ''}</td>
        </tr>`).join('')
    : '<tr><td colspan="7"><div class="empty">No exams have been set yet.</div></td></tr>';
}
$('examBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-unpublish]');
  if (!btn) return;
  if (!confirm('Take this exam offline? Students will no longer see it; papers already handed in are kept.')) return;
  const { ok, data } = await api(`/api/admin/exams/${btn.dataset.unpublish}/unpublish`, 'POST');
  toast(ok ? 'Exam unpublished.' : data.error);
  loadExams();
});
$('refreshExams').addEventListener('click', loadExams);

// ----------------------------------------------------- my own password
$('passwordBtn').addEventListener('click', () => {
  showAlert('pwAlert', '');
  $('pwForm').reset();
  $('pwModal').classList.add('show');
  $('pwCurrent').focus();
});
$('pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { ok, data } = await api('/api/password', 'PUT', {
    current_password: $('pwCurrent').value,
    new_password: $('pwNew').value,
  });
  if (!ok) return showAlert('pwAlert', data.error);
  closeModals();
  toast('Your password has been changed.');
});

// -------------------------------------------------------------- modals
function closeModals() {
  document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show'));
}
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModals));
document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

$('logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', 'POST');
  window.location.href = '/login';
});

// ---------------------------------------------------------------- boot
(async () => {
  const [{ data: meta }, { data: me }] = await Promise.all([api('/api/meta'), api('/api/me')]);
  META = meta;
  ME = me;
  $('whoami').textContent = me.full_name || me.username;
  $('fDept').innerHTML = META.departments.map((d) => `<option>${esc(d)}</option>`).join('');
  $('fLevel').innerHTML = META.levels.map((l) => `<option value="${l.value}">${l.label}</option>`).join('');
  const start = (location.hash || '#overview').slice(1);
  showTab(['overview', 'accounts', 'exams'].includes(start) ? start : 'overview');
  if (start !== 'overview') loadOverview(); // keeps the pending badge current
})();
