const signinTabBtn = document.getElementById('signin-tab-btn');
const registerTabBtn = document.getElementById('register-tab-btn');
const signinPanel = document.getElementById('signin-panel');
const registerPanel = document.getElementById('register-panel');
const authError = document.getElementById('auth-error');
const authSuccess = document.getElementById('auth-success');

// Check if already signed in — redirect away
(async () => {
  const res = await fetch('/api/auth/status');
  const data = await res.json();
  if (data.authenticated) {
    const redirect = new URLSearchParams(window.location.search).get('redirect') || '/';
    window.location.href = redirect;
  }
})();

// Tab switching
signinTabBtn.addEventListener('click', () => {
  signinTabBtn.classList.add('active');
  signinTabBtn.setAttribute('aria-selected', 'true');
  registerTabBtn.classList.remove('active');
  registerTabBtn.setAttribute('aria-selected', 'false');
  signinPanel.classList.remove('hidden');
  registerPanel.classList.add('hidden');
  clearMessages();
});

registerTabBtn.addEventListener('click', () => {
  registerTabBtn.classList.add('active');
  registerTabBtn.setAttribute('aria-selected', 'true');
  signinTabBtn.classList.remove('active');
  signinTabBtn.setAttribute('aria-selected', 'false');
  registerPanel.classList.remove('hidden');
  signinPanel.classList.add('hidden');
  clearMessages();
});

function showError(msg) {
  authError.textContent = msg;
  authError.hidden = false;
  authSuccess.hidden = true;
}

function showSuccess(msg) {
  authSuccess.textContent = msg;
  authSuccess.hidden = false;
  authError.hidden = true;
}

function clearMessages() {
  authError.hidden = true;
  authSuccess.hidden = true;
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait...' : btn.dataset.label;
}

// Sign In form
const signinForm = document.getElementById('signin-form');
const signinBtn = document.getElementById('signin-btn');
signinBtn.dataset.label = 'Sign In';

signinForm.addEventListener('submit', async e => {
  e.preventDefault();
  clearMessages();
  const email = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;

  if (!email || !password) {
    showError('Please enter your email and password.');
    return;
  }

  setLoading(signinBtn, true);
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password})
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Sign in failed.');
    } else {
      showSuccess(`Welcome back, ${data.user.name}! Redirecting...`);
      const redirect = new URLSearchParams(window.location.search).get('redirect') || '/';
      setTimeout(() => { window.location.href = redirect; }, 800);
    }
  } catch {
    showError('Could not connect to the server.');
  } finally {
    setLoading(signinBtn, false);
  }
});

// Register form
const registerForm = document.getElementById('register-form');
const registerBtn = document.getElementById('register-btn');
registerBtn.dataset.label = 'Create Account';

registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  clearMessages();
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;

  if (!email || !password) {
    showError('Email and password are required.');
    return;
  }
  if (password.length < 6) {
    showError('Password must be at least 6 characters.');
    return;
  }

  setLoading(registerBtn, true);
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name, email, password})
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Registration failed.');
    } else {
      showSuccess(`Account created! Welcome, ${data.user.name}! Redirecting...`);
      const redirect = new URLSearchParams(window.location.search).get('redirect') || '/';
      setTimeout(() => { window.location.href = redirect; }, 800);
    }
  } catch {
    showError('Could not connect to the server.');
  } finally {
    setLoading(registerBtn, false);
  }
});

// Pre-select register tab if URL has ?tab=register
if (new URLSearchParams(window.location.search).get('tab') === 'register') {
  registerTabBtn.click();
}
