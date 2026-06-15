// 수정: 2026-06-15 10:58 — 비밀번호 변경 기능 추가 (employee + viewer 계정)
'use strict';

function initChangePwPage() {
  ['cpw-current', 'cpw-new', 'cpw-confirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.style.borderColor = ''; }
  });
  const e = document.getElementById('cpw-err');
  if (e) { e.textContent = ''; e.style.color = ''; }
  const b = document.getElementById('cpw-btn');
  if (b) b.disabled = false;
  setTimeout(() => { const c = document.getElementById('cpw-current'); if (c) c.focus(); }, 80);
}

async function doChangePassword() {
  const jp    = LANG === 'JP';
  const curEl = document.getElementById('cpw-current');
  const newEl = document.getElementById('cpw-new');
  const cfmEl = document.getElementById('cpw-confirm');
  const errEl = document.getElementById('cpw-err');
  const btnEl = document.getElementById('cpw-btn');

  const curPw = curEl?.value || '';
  const newPw = newEl?.value || '';
  const cfmPw = cfmEl?.value || '';

  const showErr = msg => {
    if (errEl) { errEl.style.color = 'var(--red,#ef4444)'; errEl.textContent = msg; }
  };

  if (!curPw || !newPw || !cfmPw) {
    showErr(jp ? 'すべての項目を入力してください' : '모든 항목을 입력해 주세요');
    return;
  }
  if (newPw !== cfmPw) {
    showErr(jp ? '新しいパスワードが一致しません' : '새 비밀번호가 일치하지 않습니다');
    if (cfmEl) { cfmEl.style.borderColor = 'var(--red,#ef4444)'; cfmEl.focus(); }
    return;
  }
  if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }
  if (cfmEl) cfmEl.style.borderColor = '';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '...'; }

  try {
    const curHash = await _sha256(curPw);
    const newHash = await _sha256(newPw);
    const url     = (typeof gasUrl !== 'undefined' && gasUrl) ? gasUrl : GAS_URL;
    const resp    = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ type: 'changePassword', _uid: currentUser.id, _hash: curHash, newHash }),
    });
    const result = await resp.json();
    if (result.ok) {
      if (errEl) { errEl.style.color = '#16a34a'; errEl.textContent = jp ? 'パスワードを変更しました。再ログインしてください。' : '비밀번호를 변경했습니다. 다시 로그인해 주세요.'; }
      setTimeout(() => doLogout(), 1800);
    } else {
      showErr(result.error || (jp ? '変更に失敗しました' : '변경에 실패했습니다'));
    }
  } catch(e) {
    showErr(jp ? 'エラーが発生しました' : '오류가 발생했습니다');
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = jp ? '変更する' : '변경하기';
    }
  }
}
