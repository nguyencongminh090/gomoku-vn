'use strict';

/**
 * login.js — Login page controller.
 *
 * Responsibilities:
 *   - Tab switching (Đăng nhập / Đăng ký)
 *   - Client-side field validation with Vietnamese messages
 *   - API calls to /api/auth/{login,register,guest}
 *   - Start a session (the server sets an HttpOnly cookie), redirect to
 *     index.html on success
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const API_BASE = '';   // Same origin

// ---------------------------------------------------------------------------
// Redirect if already logged in
// ---------------------------------------------------------------------------
(function checkExistingSession() {
  // A kicked tab no longer wipes the shared profile cache (see
  // socket-client.js — localStorage is shared across all tabs, and clearing it
  // here would falsely log out sibling tabs). So this tab may still look
  // signed in even though it was just kicked; skip the auto-bounce in that one
  // case so the kicked-notice below gets a chance to render instead of
  // silently reconnecting (and immediately re-kicking whichever tab is still
  // active).
  //
  // Since TODO.md #68 this cannot check the credential itself — it is an
  // HttpOnly cookie. Bouncing to index.html on a believed session is safe
  // regardless: if the cookie is dead, the socket handshake there rejects it
  // and sends the user straight back here.
  if (window.GvnSession.hasBelievedSession() && !sessionStorage.getItem('gvn_kicked_notice')) {
    window.location.replace('index.html');
  }
})();

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const alertBanner    = document.getElementById('alert-banner');

// ---------------------------------------------------------------------------
// Show a one-time notice if we were redirected here after a forced logout
// (server disconnected this session because the account signed in elsewhere)
// ---------------------------------------------------------------------------
if (sessionStorage.getItem('gvn_kicked_notice')) {
  sessionStorage.removeItem('gvn_kicked_notice');
  showAlert(t('login.session_kicked'));
}

// ---------------------------------------------------------------------------
// Show a notice if we were redirected here after a failed Google OAuth
// attempt (TODO.md #91 — GET /api/auth/google/callback redirects to
// login.html?error=... on state mismatch or a Google/verification failure,
// since that route is a browser navigation and cannot return JSON like the
// AJAX auth calls below). history.replaceState strips the param so a page
// refresh doesn't re-show the alert.
// ---------------------------------------------------------------------------
if (new URLSearchParams(window.location.search).get('error') === 'oauth_failed' ||
    new URLSearchParams(window.location.search).get('error') === 'oauth_state') {
  showAlert(t('login.err_oauth_fail'));
  window.history.replaceState({}, '', window.location.pathname);
}

// Login form
const formLogin      = document.getElementById('form-login');
const loginUsername  = document.getElementById('login-username');
const loginPassword  = document.getElementById('login-password');
const btnLogin       = document.getElementById('btn-login');

// Register form
const formRegister   = document.getElementById('form-register');
const regUsername    = document.getElementById('reg-username');
const regDisplay     = document.getElementById('reg-display');
const regPassword    = document.getElementById('reg-password');
const regConfirm     = document.getElementById('reg-confirm');
const btnRegister    = document.getElementById('btn-register');

// Guest
const btnGuest       = document.getElementById('btn-guest');

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------
function switchTab(which) {
  const tabs   = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach(t => {
    const active = t.id === `tab-${which}`;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  panels.forEach(p => {
    p.classList.toggle('active', p.id === `panel-${which}`);
  });

  hideAlert();
}
// Expose for inline onclick handlers in HTML
window.switchTab = switchTab;

// ---------------------------------------------------------------------------
// Alert helpers
// ---------------------------------------------------------------------------
function showAlert(message, type = 'error') {
  alertBanner.textContent = message;
  alertBanner.className = `alert alert-${type} visible`;
}
function hideAlert() {
  alertBanner.classList.remove('visible');
}

// ---------------------------------------------------------------------------
// Field error helpers
// ---------------------------------------------------------------------------
function setFieldError(input, errorId, message) {
  const errEl = document.getElementById(errorId);
  if (message) {
    input.classList.add('error');
    errEl.textContent = message;
    errEl.classList.add('visible');
  } else {
    input.classList.remove('error');
    errEl.classList.remove('visible');
  }
}
function clearFieldErrors(...pairs) {
  // pairs: [input, errorId]
  pairs.forEach(([input, id]) => setFieldError(input, id, ''));
}

// ---------------------------------------------------------------------------
// Loading state helpers
// ---------------------------------------------------------------------------
function setLoading(btn, loading, originalText) {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>${originalText}...`;
  } else {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ---------------------------------------------------------------------------
// API call wrapper
// ---------------------------------------------------------------------------
async function apiPost(endpoint, body) {
  const res = await fetch(`${API_BASE}/api/auth/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The session arrives as a Set-Cookie header, so the response's cookie
    // must actually be accepted and stored (TODO.md #68).
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------------------
// Map a server error `code` to its i18n key. The server always sends a
// Vietnamese `error` string too (for logs/older clients), but that string
// must never be shown directly — only `code` (language-neutral) drives what
// the user sees, otherwise English-mode users get Vietnamese error text.
// ---------------------------------------------------------------------------
const ERROR_CODE_KEYS = {
  USERNAME_INVALID: 'login.err_reg_username',
  DISPLAY_NAME_INVALID: 'login.err_display',
  PASSWORD_TOO_SHORT: 'login.err_pass_short',
  USERNAME_TAKEN: 'login.err_username_taken',
  MISSING_CREDENTIALS: 'login.err_missing_credentials',
  INVALID_CREDENTIALS: 'login.err_invalid_credentials',
};

function errorMessage(data, fallbackKey) {
  const key = data && data.code && ERROR_CODE_KEYS[data.code];
  return t(key || fallbackKey);
}

// ---------------------------------------------------------------------------
// Redirect to lobby.
//
// There is nothing to save here any more (TODO.md #68): the credential went
// into an HttpOnly cookie the server set on this response, which JavaScript
// cannot see. All that gets cached is the non-secret profile the UI paints
// with, and even that is re-asserted by the server on every socket connect.
// ---------------------------------------------------------------------------
function onAuthSuccess(data) {
  if (data && data.user) window.GvnSession.setUser(data.user);
  window.location.replace('index.html');
}

// ---------------------------------------------------------------------------
// Client-side validation helpers
// ---------------------------------------------------------------------------
const RE_USERNAME = /^[a-zA-Z0-9_]{3,20}$/;

function validateLoginForm() {
  let valid = true;
  clearFieldErrors(
    [loginUsername, 'err-login-username'],
    [loginPassword, 'err-login-password']
  );
  if (!loginUsername.value.trim()) {
    setFieldError(loginUsername, 'err-login-username', t('login.err_username'));
    valid = false;
  }
  if (!loginPassword.value) {
    setFieldError(loginPassword, 'err-login-password', t('login.err_password'));
    valid = false;
  }
  return valid;
}

function validateRegisterForm() {
  let valid = true;
  clearFieldErrors(
    [regUsername, 'err-reg-username'],
    [regDisplay,  'err-reg-display'],
    [regPassword, 'err-reg-password'],
    [regConfirm,  'err-reg-confirm']
  );

  if (!RE_USERNAME.test(regUsername.value)) {
    setFieldError(regUsername, 'err-reg-username',
      t('login.err_reg_username'));
    valid = false;
  }
  if (regDisplay.value.trim().length < 2 || regDisplay.value.trim().length > 24) {
    setFieldError(regDisplay, 'err-reg-display', t('login.err_display'));
    valid = false;
  }
  if (regPassword.value.length < 6) {
    setFieldError(regPassword, 'err-reg-password', t('login.err_pass_short'));
    valid = false;
  }
  if (regPassword.value !== regConfirm.value) {
    setFieldError(regConfirm, 'err-reg-confirm', t('login.err_confirm'));
    valid = false;
  }
  return valid;
}

// ---------------------------------------------------------------------------
// Form submit handlers
// ---------------------------------------------------------------------------
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();

  if (!validateLoginForm()) return;

  setLoading(btnLogin, true, t('login.btn_login'));
  try {
    const { ok, data } = await apiPost('login', {
      username: loginUsername.value.trim(),
      password: loginPassword.value,
    });

    if (ok) {
      onAuthSuccess(data);
    } else {
      showAlert(errorMessage(data, 'login.err_login_fail'));
    }
  } catch {
    showAlert(t('login.err_network'));
  } finally {
    setLoading(btnLogin, false, t('login.btn_login'));
  }
});

formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();

  if (!validateRegisterForm()) return;

  setLoading(btnRegister, true, t('login.btn_register'));
  try {
    const { ok, data } = await apiPost('register', {
      username:    regUsername.value.trim(),
      displayName: regDisplay.value.trim(),
      password:    regPassword.value,
    });

    if (ok) {
      onAuthSuccess(data);
    } else {
      showAlert(errorMessage(data, 'login.err_register_fail'));
    }
  } catch {
    showAlert(t('login.err_network'));
  } finally {
    setLoading(btnRegister, false, t('login.btn_register'));
  }
});

btnGuest.addEventListener('click', async () => {
  hideAlert();
  setLoading(btnGuest, true, t('login.btn_guest'));
  try {
    const { ok, data } = await apiPost('guest', {});
    if (ok) {
      onAuthSuccess(data);
    } else {
      showAlert(errorMessage(data, 'login.err_guest_fail'));
    }
  } catch {
    showAlert(t('login.err_network'));
  } finally {
    setLoading(btnGuest, false, t('login.btn_guest'));
  }
});

// ---------------------------------------------------------------------------
// Real-time field validation (on blur)
// ---------------------------------------------------------------------------
loginUsername.addEventListener('blur', () => {
  if (!loginUsername.value.trim()) {
    setFieldError(loginUsername, 'err-login-username', t('login.err_username'));
  } else {
    setFieldError(loginUsername, 'err-login-username', '');
  }
});

regUsername.addEventListener('blur', () => {
  if (!RE_USERNAME.test(regUsername.value)) {
    setFieldError(regUsername, 'err-reg-username',
      t('login.err_reg_username'));
  } else {
    setFieldError(regUsername, 'err-reg-username', '');
  }
});

regConfirm.addEventListener('input', () => {
  if (regPassword.value && regConfirm.value && regPassword.value !== regConfirm.value) {
    setFieldError(regConfirm, 'err-reg-confirm', t('login.err_confirm'));
  } else {
    setFieldError(regConfirm, 'err-reg-confirm', '');
  }
});

// ---------------------------------------------------------------------------
// 3D Parallax Motion for Abstract Board
// ---------------------------------------------------------------------------
document.addEventListener('mousemove', (e) => {
  // Normalize mouse position from -1 to 1 based on window width/height
  const mx = (e.clientX / window.innerWidth) * 2 - 1;
  const my = (e.clientY / window.innerHeight) * 2 - 1;
  
  // Set CSS variables on the root for the board to consume
  document.documentElement.style.setProperty('--mx', mx.toFixed(3));
  document.documentElement.style.setProperty('--my', my.toFixed(3));
});

// ---------------------------------------------------------------------------
// Password Toggle
// ---------------------------------------------------------------------------
window.togglePassword = function(btn) {
  const input = btn.previousElementSibling;
  const isPassword = input.type === 'password';
  
  // Toggle input type
  input.type = isPassword ? 'text' : 'password';
  
  // Toggle icon
  if (isPassword) {
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-eye-off">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;
    btn.setAttribute('aria-label', t('login.hide_password'));
  } else {
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-eye">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
    btn.setAttribute('aria-label', t('login.show_password'));
  }
};
