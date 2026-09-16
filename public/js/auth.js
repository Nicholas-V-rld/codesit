// Shared script for the login and register pages.

function showAlert(msg, kind) {
  const el = document.getElementById('alert');
  if (!el) return;
  el.textContent = msg;
  el.className = 'alert show ' + (kind === 'ok' ? 'alert-ok' : 'alert-error');
}

async function api(path, method, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// ---------------- LOGIN ----------------
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    const { ok, data } = await api('/api/login', 'POST', {
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value,
    });
    if (ok && data.ok) {
      window.location.href = '/' + data.role;
    } else {
      showAlert(data.error || 'Could not sign in.');
      btn.disabled = false;
    }
  });
}

// ---------------- REGISTER ----------------
const regForm = document.getElementById('regForm');
if (regForm) {
  let role = 'student';

  (async () => {
    const { data } = await api('/api/meta', 'GET');
    document.getElementById('department').innerHTML =
      data.departments.map((d) => `<option>${d}</option>`).join('');
    document.getElementById('level').innerHTML =
      data.levels.map((l) => `<option value="${l.value}">${l.label}</option>`).join('');
    const teach = document.getElementById('teachLevels');
    teach.innerHTML = data.levels
      .map((l) => `<label class="check"><input type="checkbox" value="${l.value}"><span>${l.label}</span></label>`)
      .join('');
    teach.querySelectorAll('.check').forEach((c) => {
      const input = c.querySelector('input');
      input.addEventListener('change', () => c.classList.toggle('on', input.checked));
    });
  })();

  document.querySelectorAll('.roletab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.roletab').forEach((t) => t.classList.remove('on'));
      tab.classList.add('on');
      role = tab.dataset.role;
      document.querySelector('.student-only').style.display = role === 'student' ? '' : 'none';
      document.querySelector('.lecturer-only').style.display = role === 'lecturer' ? '' : 'none';
    });
  });

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const payload = {
      role,
      full_name: document.getElementById('full_name').value.trim(),
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value,
      department: document.getElementById('department').value,
    };
    if (role === 'student') {
      payload.matric_number = document.getElementById('matric_number').value.trim();
      payload.level = document.getElementById('level').value;
    } else {
      payload.staff_id = document.getElementById('staff_id').value.trim();
      payload.teaching_levels = [...document.querySelectorAll('#teachLevels input:checked')].map((i) => i.value);
    }
    btn.disabled = true;
    const { ok, data } = await api('/api/register', 'POST', payload);
    if (ok && data.ok && data.pending) {
      // Lecturer accounts wait for an administrator before they can sign in.
      regForm.reset();
      document.querySelectorAll('#teachLevels .check').forEach((c) => c.classList.remove('on'));
      showAlert('Account created. An administrator needs to approve lecturer accounts before you can sign in — you will be able to sign in once that is done.', 'ok');
      btn.disabled = false;
    } else if (ok && data.ok) {
      showAlert('Account created — taking you to sign in…', 'ok');
      setTimeout(() => (window.location.href = '/login'), 900);
    } else {
      showAlert(data.error || 'Could not create the account.');
      btn.disabled = false;
    }
  });
}
