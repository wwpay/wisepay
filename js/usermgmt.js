'use strict';

function renderUserMgmt() {
  const wrap = document.getElementById('usermgmt-wrap');
  if (!wrap) return;
  if (!currentUser || currentUser.role !== 'admin') {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  // 내 비번 변경 섹션에 현재 ID 표시
  const myIdEl = document.getElementById('mypw-my-id');
  if (myIdEl) myIdEl.textContent = '(' + currentUser.id + ')';
}

// ── 로그인 이력 (최근 1년) ──
let _loginLogById = {};

async function _loadLoginLog() {
  try {
    const resp = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'getLoginLog', ...gasWriteAuth() })
    });
    const r = await resp.json();
    return r.ok ? (r.logs || []) : [];
  } catch(e) { return []; }
}

function _fmtLoginAt(at, withWeek) {
  // at: 'yyyy-MM-dd HH:mm:ss' (JST)
  const m = String(at || '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return _esc(at);
  if (!withWeek) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  const wd = new Date(+m[1], +m[2] - 1, +m[3]).getDay();
  const W = LANG === 'JP' ? ['日','月','火','水','木','金','土'] : ['일','월','화','수','목','금','토'];
  return `${+m[2]}/${+m[3]}(${W[wd]}) ${m[4]}:${m[5]}`;
}

function _devLabel(d) {
  return d === 'mobile' ? (LANG === 'JP' ? '📱 スマホ' : '📱 폰') : '💻 PC';
}

function _loginSummaryHtml(id) {
  const logs = _loginLogById[id] || [];
  const lastLbl = LANG === 'JP' ? '最終ログイン' : '마지막 로그인';
  const cntLbl  = LANG === 'JP' ? '直近1年' : '최근 1년';
  const unit    = LANG === 'JP' ? '回' : '회';
  const last = logs.length
    ? `<b style="color:var(--accent);">${_fmtLoginAt(logs[0].at, true)}</b> · ${_devLabel(logs[0].device)}`
    : `<b style="color:var(--red);">${LANG === 'JP' ? '記録なし' : '기록 없음'}</b>`;
  return `<div style="margin-top:8px;font-size:14px;color:var(--text2);display:flex;gap:20px;flex-wrap:wrap;">
      <span>${lastLbl}: ${last}</span>
      <span>${cntLbl}: <b style="color:var(--accent);">${logs.length}${unit}</b></span>
    </div>`;
}

function _loginHistHtml(id) {
  const logs = _loginLogById[id] || [];
  if (!logs.length) return `<div style="font-size:13px;color:var(--text3);">${LANG === 'JP' ? '直近1年のログイン記録はありません' : '최근 1년간 로그인 기록이 없습니다'}</div>`;
  const rows = logs.map(l => `<tr><td style="padding:6px 4px;border-bottom:1px solid var(--border);">${_fmtLoginAt(l.at, false)}</td><td style="padding:6px 4px;border-bottom:1px solid var(--border);">${_devLabel(l.device)}</td></tr>`).join('');
  return `<div style="max-height:260px;overflow-y:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><th style="text-align:left;color:var(--text3);font-weight:600;padding:5px 4px;border-bottom:1px solid var(--border);">${LANG === 'JP' ? '日時' : '일시'}</th><th style="text-align:left;color:var(--text3);font-weight:600;padding:5px 4px;border-bottom:1px solid var(--border);">${LANG === 'JP' ? '端末' : '기기'}</th></tr>
        ${rows}
      </table></div>`;
}

function toggleLoginHist(id) {
  const el  = document.getElementById('lh-' + id);
  const btn = document.getElementById('lh-btn-' + id);
  if (!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? '' : 'none';
  if (btn) btn.textContent = (LANG === 'JP' ? 'ログイン履歴 ' : '로그인 이력 ') + (open ? '▲' : '▼');
}

async function loadUserList() {
  if (!gasUrl) {
    showToast(LANG === 'JP' ? '先にURLを設定してください' : '먼저 URL을 설정해 주세요', 'w');
    return;
  }
  const listEl = document.getElementById('usermgmt-list');
  if (listEl) listEl.innerHTML = '<span style="color:var(--text3);font-size:12px;">' + (LANG === 'JP' ? '読み込み中...' : '불러오는 중...') + '</span>';

  try {
    const [result, logs] = await Promise.all([gasRequest({ action: 'getUsers' }), _loadLoginLog()]);
    if (!result.ok) throw new Error(result.error || (LANG === 'JP' ? '読み込み失敗' : '불러오기 실패'));
    _loginLogById = {};
    (logs || []).forEach(l => { (_loginLogById[l.id] = _loginLogById[l.id] || []).push(l); });
    Object.keys(_loginLogById).forEach(k => _loginLogById[k].sort((a, b) => (a.at < b.at ? 1 : -1)));
    _renderUserRows(result.users || []);
  } catch(e) {
    if (listEl) listEl.innerHTML = '<span style="color:var(--red);font-size:12px;">❌ ' + _esc(e.message || '오류') + '</span>';
  }
}

function _renderUserRows(users) {
  const listEl = document.getElementById('usermgmt-list');
  if (!listEl) return;

  const others = users.filter(u => u.role !== 'admin');
  if (!others.length) {
    listEl.innerHTML = '<span style="color:var(--text3);font-size:12px;">' + (LANG === 'JP' ? '対象ユーザーなし' : '재설정 대상 사용자 없음') + '</span>';
    return;
  }

  listEl.innerHTML = '';
  others.forEach(u => {
    const id = _esc(u.id);
    const isEmp = u.role === 'employee';
    const roleLabel = isEmp ? (LANG === 'JP' ? '従業員' : '직원') : (LANG === 'JP' ? '閲覧者' : '열람자');
    const sessLabel = u.sessionType === 'persistent'
      ? (LANG === 'JP' ? '長期' : '장기')
      : (LANG === 'JP' ? 'セッション' : '세션');

    const row = document.createElement('div');
    row.id = 'umrow-' + id;
    row.style.cssText = 'border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;';
    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:13px;font-weight:600;">${id}</span>
          <span style="font-size:12px;color:var(--text2);">${_esc(u.name)}</span>
          <span style="font-size:11px;color:#fff;background:${isEmp ? '#0d9488' : '#64748b'};border-radius:4px;padding:1px 6px;">${roleLabel}</span>
          <span style="font-size:11px;color:var(--text3);">${sessLabel}</span>
        </div>
        <div style="display:flex;gap:6px;">
        <button id="lh-btn-${id}" onclick="toggleLoginHist('${id}')"
          style="padding:5px 12px;background:var(--surface2);color:var(--text2);border:1px solid var(--border);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">
          ${LANG === 'JP' ? 'ログイン履歴 ▼' : '로그인 이력 ▼'}
        </button>
        <button onclick="togglePwResetForm('${id}')"
          style="padding:5px 12px;background:var(--accent2);color:var(--accent);border:1px solid var(--accent3);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">
          ${LANG === 'JP' ? 'PW再設定' : '비번 재설정'}
        </button>
        </div>
      </div>
      ${_loginSummaryHtml(u.id)}
      <div id="lh-${id}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">${_loginHistHtml(u.id)}</div>
      <div id="pwr-form-${id}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;">
          <div style="position:relative;flex:1;min-width:140px;">
            <input type="password" id="pwr-input-${id}"
              placeholder="${LANG === 'JP' ? '新しいパスワード' : '새 비밀번호'}"
              style="width:100%;padding:7px 36px 7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
              onkeydown="if(event.key==='Enter')confirmPwReset('${id}')">
            <button type="button" id="pwr-eye-${id}" tabindex="-1" onclick="togglePwEye('pwr-input-${id}','pwr-eye-${id}')"
              style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;color:#94a3b8;display:flex;align-items:center;line-height:1;">
              ${typeof _EYE_ON !== 'undefined' ? _EYE_ON : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'}
            </button>
          </div>
          <button id="pwr-ok-${id}" onclick="confirmPwReset('${id}')"
            style="padding:7px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">
            ${LANG === 'JP' ? '確定' : '확인'}
          </button>
          <button onclick="togglePwResetForm('${id}')"
            style="padding:7px 10px;background:var(--surface2);color:var(--text2);border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer;">
            ${LANG === 'JP' ? 'キャンセル' : '취소'}
          </button>
        </div>
        <div id="pwr-err-${id}" style="color:var(--red);font-size:12px;margin-top:5px;min-height:16px;"></div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

function togglePwResetForm(id) {
  const form = document.getElementById('pwr-form-' + id);
  if (!form) return;
  const isOpen = form.style.display !== 'none';
  form.style.display = isOpen ? 'none' : '';
  if (!isOpen) {
    const inp = document.getElementById('pwr-input-' + id);
    if (inp) { inp.value = ''; inp.focus(); }
    const err = document.getElementById('pwr-err-' + id);
    if (err) err.textContent = '';
  }
}

async function confirmPwReset(id) {
  const inp   = document.getElementById('pwr-input-' + id);
  const errEl = document.getElementById('pwr-err-' + id);
  const btnEl = document.getElementById('pwr-ok-' + id);
  const pw    = (inp?.value || '').trim();

  if (!pw) {
    if (errEl) errEl.textContent = LANG === 'JP' ? '新しいパスワードを入力してください' : '새 비밀번호를 입력해 주세요';
    return;
  }
  if (errEl) errEl.textContent = '';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '...'; }

  try {
    const hash   = await _sha256(pw);
    const resp   = await fetch(gasUrl, { method: 'POST', body: JSON.stringify({ type: 'updatePassword', id, hash }) });
    const result = await resp.json();
    if (result.ok) {
      showToast(LANG === 'JP' ? 'パスワードを更新しました ✓' : '비밀번호를 변경했습니다 ✓', 's');
      togglePwResetForm(id);
    } else {
      if (errEl) errEl.textContent = result.error || (LANG === 'JP' ? '更新失敗' : '변경 실패');
    }
  } catch(e) {
    if (errEl) errEl.textContent = LANG === 'JP' ? 'エラーが発生しました' : '오류가 발생했습니다';
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = LANG === 'JP' ? '確定' : '확인'; }
  }
}

// ── 내 비번 변경 (admin 본인) ──

async function confirmMyPwChange() {
  const curEl = document.getElementById('mypw-current');
  const newEl = document.getElementById('mypw-new');
  const errEl = document.getElementById('mypw-err');
  const btnEl = document.getElementById('mypw-btn');
  const curPw = (curEl?.value || '').trim();
  const newPw = (newEl?.value || '').trim();

  if (!curPw || !newPw) {
    if (errEl) errEl.textContent = LANG === 'JP' ? '現在・新しいパスワードを両方入力してください' : '현재·새 비밀번호를 모두 입력해 주세요';
    return;
  }
  if (errEl) errEl.textContent = '';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '...'; }

  try {
    const curHash = await _sha256(curPw);
    const newHash = await _sha256(newPw);
    const resp    = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify({ type: 'updatePassword', id: currentUser.id, hash: newHash, verifyHash: curHash }),
    });
    const result = await resp.json();
    if (result.ok) {
      if (curEl) curEl.value = '';
      if (newEl) newEl.value = '';
      showToast(LANG === 'JP' ? 'パスワードを変更しました ✓' : '비밀번호를 변경했습니다 ✓', 's');
    } else {
      if (errEl) errEl.innerHTML = result.error || '現在のパスワードが違います<br>현재 비밀번호가 틀렸습니다';
    }
  } catch(e) {
    if (errEl) errEl.innerHTML = 'エラーが発生しました<br>오류가 발생했습니다';
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = LANG === 'JP' ? '変更完了' : '변경 완료';
    }
  }
}

function _esc(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
