// 수정: 2026-06-24 22:45 — 비밀번호 분실 모달 + 이메일 링크 방식 재설정 + 로그인 유효성 ID/PW 분리
'use strict';

const AUTH_SESS_KEY = 'wisepay_session';
const AUTH_ID_KEY   = 'wisepay_saved_id';

// ── 비밀번호 눈 아이콘 SVG ──
const _EYE_ON  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const _EYE_OFF = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function toggleLoginPw() {
  const pw  = document.getElementById('login-pw');
  const btn = document.getElementById('login-pw-eye');
  if (!pw || !btn) return;
  const show = pw.type === 'password';
  pw.type    = show ? 'text' : 'password';
  btn.innerHTML = show ? _EYE_OFF : _EYE_ON;
}

function togglePwEye(inputId, btnId) {
  const pw  = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!pw || !btn) return;
  const show = pw.type === 'password';
  pw.type       = show ? 'text' : 'password';
  btn.innerHTML = show ? _EYE_OFF : _EYE_ON;
}

// ── Viewer idle 자동 로그아웃 ──
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1시간
let _idleTimer = null;

function _onIdleActivity() { _startIdleTimer(); }

function _startIdleTimer() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(_idleLogout, IDLE_TIMEOUT_MS);
}

function _stopIdleTimer() {
  if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
  document.removeEventListener('click',   _onIdleActivity);
  document.removeEventListener('keydown', _onIdleActivity);
}

function _idleLogout() {
  _stopIdleTimer();
  _clearSession();
  const layout = document.getElementById('layout');
  const overlay = document.getElementById('login-overlay');
  if (layout)  layout.style.display  = 'none';
  if (overlay) overlay.style.display = 'flex';
  const modal = document.getElementById('modal-idle-logout');
  if (modal) modal.style.display = 'flex';
}

function closeIdleLogoutModal() {
  const modal = document.getElementById('modal-idle-logout');
  if (modal) modal.style.display = 'none';
}

let currentUser  = null; // { id, name, role, sessionType, employeeId? }
let _writeToken  = null; // admin·employee 로그인 시 설정 (GAS 인증용), viewer는 null

const VIEWER_PAGES    = new Set(['payroll', 'annual', 'change-password']);
const VIEWER_PS_IDS   = new Set(['wisejp']); // 원천세 납부서 추가 열람 허용 계정
const EMPLOYEE_PAGES  = new Set(['payroll', 'annual', 'vacation', 'change-password']);

async function _sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function _getStoredSession() {
  try {
    const raw = localStorage.getItem(AUTH_SESS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.sessionType === 'persistent' && s.expires && Date.now() < s.expires) return s;
      localStorage.removeItem(AUTH_SESS_KEY);
    }
  } catch(e) { localStorage.removeItem(AUTH_SESS_KEY); }
  try {
    const raw = sessionStorage.getItem(AUTH_SESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) { sessionStorage.removeItem(AUTH_SESS_KEY); }
  return null;
}

function _storeSession(user, wt) {
  const data = wt ? { ...user, _wt: wt } : { ...user };
  if (user.sessionType === 'persistent') {
    const midnight = new Date();
    midnight.setHours(23, 59, 59, 999);
    localStorage.setItem(AUTH_SESS_KEY, JSON.stringify({ ...data, expires: midnight.getTime() }));
  } else {
    sessionStorage.setItem(AUTH_SESS_KEY, JSON.stringify(data));
  }
}

function _clearSession() {
  localStorage.removeItem(AUTH_SESS_KEY);
  sessionStorage.removeItem(AUTH_SESS_KEY);
  currentUser = null;
  _writeToken = null;
}

function checkAuth() {
  const sess = _getStoredSession();
  if (sess) {
    currentUser = sess;
    _writeToken = sess._wt || null;
    LANG = sess.role === 'admin' ? 'KR' : 'JP';
    applyLang();
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('layout').style.display = '';
    renderNavForRole();
    return true;
  }
  _showLogin();
  return false;
}

function _showLogin() {
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('layout').style.display = 'none';
  const savedId = localStorage.getItem(AUTH_ID_KEY);
  if (savedId) {
    document.getElementById('login-id').value = savedId;
    document.getElementById('login-save-id').checked = true;
    setTimeout(() => document.getElementById('login-pw').focus(), 50);
  } else {
    setTimeout(() => document.getElementById('login-id').focus(), 50);
  }
}

// ── 비밀번호 분실 모달 ──

function openPwResetModal() {
  const modal = document.getElementById('pw-reset-modal');
  modal.style.display = 'flex';
  const inp = document.getElementById('pw-reset-id');
  inp.value = (document.getElementById('login-id')?.value || '').trim();
  document.getElementById('pw-reset-err').innerHTML = '';
  inp.style.borderColor = '#e2e8f0';
  setTimeout(() => inp.focus(), 50);
}

function closePwResetModal() {
  document.getElementById('pw-reset-modal').style.display = 'none';
}

async function submitPwReset() {
  const inp  = document.getElementById('pw-reset-id');
  const id   = (inp.value || '').trim();
  const err  = document.getElementById('pw-reset-err');
  const btn  = document.getElementById('pw-reset-btn');

  if (!id) {
    inp.style.borderColor = '#ef4444';
    inp.focus();
    err.innerHTML = 'IDを入力してください<br>ID를 입력해 주세요';
    return;
  }
  inp.style.borderColor = '#e2e8f0';
  err.innerHTML = '';
  btn.disabled = true;
  btn.textContent = '送信中… / 발송 중…';

  try {
    const url  = (typeof gasUrl !== 'undefined' && gasUrl) ? gasUrl : GAS_URL;
    const resp = await fetch(url, { method: 'POST', body: JSON.stringify({ type: 'requestPasswordReset', id }) });
    const res  = await resp.json();
    if (res.ok) {
      closePwResetModal();
      const isAdmin = res.role === 'admin';
      showPwResetResult(true,
        isAdmin
          ? 'メールにリセットリンクを送信しました。<br>（有効期限：1時間）<br><br>메일로 재설정 링크를 발송했습니다。<br>（유효 시간: 1시간）'
          : 'メールで管理者に通知しました。<br>管理者が対応後ご連絡します<br><br>관리자에게 메일로 알렸습니다。<br>관리자 처리 후 연락드립니다'
      );
    } else {
      err.innerHTML = res.error || '送信失敗<br>발송 실패';
    }
  } catch(e) {
    err.innerHTML = 'エラーが発生しました<br>오류가 발생했습니다';
  } finally {
    btn.disabled = false;
    btn.textContent = '確認 / 확인';
  }
}

function showPwResetResult(ok, msg) {
  const modal = document.getElementById('pw-reset-result-modal');
  document.getElementById('pw-reset-result-icon').textContent = ok ? '✉️' : '⚠️';
  document.getElementById('pw-reset-result-msg').innerHTML = msg;
  modal.style.display = 'flex';
}

function closePwResetResultModal() {
  document.getElementById('pw-reset-result-modal').style.display = 'none';
}

// ── 앱 로드 시 reset_token URL 파라미터 감지 ──

(function checkResetToken() {
  const token = new URLSearchParams(window.location.search).get('reset_token');
  if (!token) return;
  // URL에서 토큰 제거 (주소창 노출 최소화)
  history.replaceState(null, '', window.location.pathname);
  const url = (typeof gasUrl !== 'undefined' && gasUrl) ? gasUrl : GAS_URL;
  if (!url) return;
  showPwResetResult(true, 'リセットリンクを確認中…<br>링크 확인 중…');
  fetch(url + '?action=confirmReset&token=' + encodeURIComponent(token))
    .then(r => r.json())
    .then(res => {
      if (res.ok) {
        showPwResetResult(true,
          '仮パスワード:<br><strong style="font-size:20px;letter-spacing:2px;color:#4f46e5;">' + res.tempPw + '</strong><br>' +
          '<span style="font-size:11px;color:#94a3b8;">上記でログイン後、パスワードを変更してください<br>위 비밀번호로 로그인 후 변경해 주세요</span>'
        );
      } else {
        showPwResetResult(false, res.error || '無効なリンクです<br>유효하지 않은 링크입니다');
      }
    })
    .catch(() => showPwResetResult(false, 'エラーが発生しました<br>오류가 발생했습니다'));
})();

async function doLogin() {
  const id     = (document.getElementById('login-id').value || '').trim();
  const pw     = document.getElementById('login-pw').value || '';
  const saveId = document.getElementById('login-save-id').checked;
  const err    = document.getElementById('login-err');
  const btn    = document.getElementById('login-btn');

  if (!id) {
    err.innerHTML = 'IDを入力してください<br>ID를 입력해 주세요';
    document.getElementById('login-id').focus();
    return;
  }
  if (!pw) {
    err.innerHTML = 'パスワードを入力してください<br>비밀번호를 입력해 주세요';
    document.getElementById('login-pw').focus();
    return;
  }

  err.textContent = '';
  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = 'ログイン中… / 로그인 중…';

  try {
    const hash   = await _sha256(pw);
    const url    = (typeof gasUrl !== 'undefined' && gasUrl) ? gasUrl : GAS_URL;
    const resp   = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ type: 'verifyLogin', id, hash }),
    });
    const result = await resp.json();

    if (result.ok && result.user) {
      if (saveId) localStorage.setItem(AUTH_ID_KEY, id);
      else        localStorage.removeItem(AUTH_ID_KEY);

      const wt = (result.user.role === 'admin' || result.user.role === 'employee') ? hash : null;
      _storeSession(result.user, wt);
      currentUser = result.user;
      _writeToken = wt;
      LANG = result.user.role === 'admin' ? 'KR' : 'JP';
      applyLang();

      document.getElementById('login-overlay').style.display = 'none';
      document.getElementById('layout').style.display = '';
      renderNavForRole();
      initApp();
    } else {
      err.innerHTML = 'IDまたはパスワードが違います<br>ID 또는 비밀번호가 틀렸습니다';
      document.getElementById('login-pw').value = '';
      document.getElementById('login-pw').focus();
    }
  } catch(e) {
    err.innerHTML = 'ログインエラー<br>로그인 오류가 발생했습니다';
    console.error('Login error:', e);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

function loginOnEnter(e) {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'login-id') {
    document.getElementById('login-pw')?.focus();
  } else {
    doLogin();
  }
}

function doLogout() {
  _stopIdleTimer();
  _clearSession();
  location.reload();
}

// ── 권한 제어 ──

function isWriteAuthorized() {
  return !!(currentUser && currentUser.role === 'admin');
}

function gasWriteAuth() {
  if (!currentUser || !_writeToken) return {};
  return { _uid: currentUser.id, _token: _writeToken };
}

function canAccessPage(pageId) {
  if (!currentUser) return false;
  if (pageId === 'change-password') return currentUser.role === 'employee' || currentUser.role === 'viewer';
  if (currentUser.role === 'admin') return true;
  if (currentUser.role === 'employee') return EMPLOYEE_PAGES.has(pageId);
  if (VIEWER_PS_IDS.has(currentUser.id)) return VIEWER_PAGES.has(pageId) || pageId === 'payment-statement';
  return VIEWER_PAGES.has(pageId);
}

function showAccessDenied() {
  document.getElementById('modal-access-denied').style.display = 'flex';
  setTimeout(() => {
    const btn = document.getElementById('btn-access-denied-ok');
    if (btn) btn.focus();
  }, 50);
}

function closeAccessDenied() {
  document.getElementById('modal-access-denied').style.display = 'none';
}

function renderNavForRole() {
  if (!currentUser) return;
  if (currentUser.role === 'admin') {
    const cpNav = document.querySelector('.nav-item[data-page="change-password"]');
    if (cpNav) cpNav.style.display = 'none';
    return;
  }
  const baseAllowed = currentUser.role === 'employee' ? EMPLOYEE_PAGES : VIEWER_PAGES;
  const allowed = VIEWER_PS_IDS.has(currentUser.id)
    ? new Set([...baseAllowed, 'payment-statement'])
    : baseAllowed;
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    if (!allowed.has(item.dataset.page)) item.style.display = 'none';
  });
  const settingSec = document.getElementById('t-nav-setting');
  if (settingSec) settingSec.style.display = 'none';
}

function applyViewerRestrictions() {
  if (!currentUser || currentUser.role === 'admin') return;

  // 저장·지급완료 버튼 숨김
  const saveBtn = document.getElementById('btn-save');
  const paidBtn = document.getElementById('btn-mark-paid');
  if (saveBtn) saveBtn.style.display = 'none';
  if (paidBtn) paidBtn.style.display = 'none';

  // 급여 입력 필드 읽기 전용
  document.querySelectorAll('#page-payroll .row-input').forEach(inp => {
    inp.readOnly = true;
    inp.style.background  = 'var(--surface2)';
    inp.style.cursor      = 'default';
    inp.style.borderColor = 'transparent';
  });

  // 쓰기 함수 일괄 no-op 오버라이드
  const blocked = () => {
    showToast(LANG === 'JP' ? '閲覧専用のため操作できません' : '열람 전용 계정입니다', 'w');
  };
  window.saveCurrent           = blocked;
  window.resetLocalData        = blocked;
  window.importFreeePayrollCSV = blocked;
  window.saveEmpForm           = blocked;
  window.saveEmployee          = blocked;
  window.deleteEmp             = blocked;
  window.reinstateEmp          = blocked;
  window.applyRates            = blocked;
  window.saveRateHistory       = blocked;
  window.downloadBackupExcel   = blocked;

  // 표준 보수 월액 행: 빈 칸 유지 (레이아웃 유지)
  const hyoRow = document.getElementById('t-r-hyo')?.closest('.row');
  if (hyoRow) hyoRow.style.visibility = 'hidden';

  // 공제란 물음표(tip-icon) 숨김
  document.querySelectorAll('#page-payroll .tip-icon').forEach(el => {
    el.style.display = 'none';
  });

  // idle 자동 로그아웃: click/keydown 감지, 1시간 무조작 시 로그아웃
  document.addEventListener('click',   _onIdleActivity);
  document.addEventListener('keydown', _onIdleActivity);
  _startIdleTimer();
}

// ── employee 전용 제한: dropdown 잠금 + 본인 사원만 표시 ──
function applyEmployeeRestrictions() {
  if (!currentUser || currentUser.role !== 'employee') return;
  const empId = currentUser.employeeId;
  if (!empId) return;
  const padId = String(parseInt(empId) || 0).padStart(4, '0');

  // 급여명세 dropdown 잠금
  const payrollSel = document.getElementById('empSelect');
  if (payrollSel) {
    const idx = employees.findIndex(e => String(parseInt(e.no || 0)).padStart(4, '0') === padId);
    if (idx >= 0) {
      window.currentEmpIdx = idx;
      payrollSel.value = idx;
      if (typeof loadPayrollForm === 'function') loadPayrollForm();
      if (typeof renderPaidBtn  === 'function') renderPaidBtn();
    }
    payrollSel.disabled = true;
    payrollSel.style.opacity = '0.85';
    payrollSel.style.cursor  = 'default';
  }

  // 임금대장 사원 드롭다운 잠금
  const annualDropWrap = document.getElementById('annualEmpDropWrap');
  if (annualDropWrap) {
    annualDropWrap.style.pointerEvents = 'none';
    annualDropWrap.style.opacity = '0.85';
  }
  const annualList = document.getElementById('annualEmpCheckList');
  if (annualList) {
    annualList.querySelectorAll('label').forEach(label => {
      const no = label.dataset.no || '';
      if (String(parseInt(no) || 0).padStart(4, '0') === padId) {
        const cb = label.querySelector('input[type=checkbox]');
        if (cb) cb.checked = true;
      } else {
        label.style.display = 'none';
      }
    });
    if (typeof updateAnnualSelSummary === 'function') updateAnnualSelSummary();
    if (typeof renderAnnual === 'function') renderAnnual();
  }

  // 유급휴가 사원 드롭다운 잠금
  const vacDropWrap = document.getElementById('vacEmpDropWrap');
  if (vacDropWrap) {
    vacDropWrap.style.pointerEvents = 'none';
    vacDropWrap.style.opacity = '0.85';
  }
  const vacList = document.getElementById('vacEmpCheckList');
  if (vacList) {
    vacList.querySelectorAll('label').forEach(label => {
      const no = label.dataset.no || '';
      if (String(parseInt(no) || 0).padStart(4, '0') === padId) {
        const cb = label.querySelector('input[type=checkbox]');
        if (cb) cb.checked = true;
      } else {
        label.style.display = 'none';
      }
    });
    if (typeof updateVacSelSummary   === 'function') updateVacSelSummary();
    if (typeof renderVacationCards   === 'function') renderVacationCards();
  }
}
