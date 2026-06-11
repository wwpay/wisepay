// 수정: 2026-06-13 15:32 — 알림 2/3번 말풍선 색상 구분 (type 파라미터), 타이밍 주석 정리
'use strict';
const NOTIF_KEY = 'kyuyo_notifications';

let _notifView = 'list'; // 'list' | 'trash'

function loadNotifications() {
  try {
    const list = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
    // 구버전 항목에 deleted 필드가 없으면 false로 초기화
    return list.map(n => ({ deleted: false, ...n }));
  } catch(e) { return []; }
}
function saveNotificationsData(list) {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
}

// id가 같은 알림이 이미 있으면 추가하지 않음
function addNotification(id, level, msgKR, msgJP) {
  const list = loadNotifications();
  if(list.find(n => n.id === id)) { updateNotifBadge(); return; }
  list.unshift({ id, level, msgKR, msgJP, createdAt: new Date().toISOString(), read: false, deleted: false });
  saveNotificationsData(list);
  updateNotifBadge();
}

function markAllNotifsRead() {
  const list = loadNotifications().map(n => ({...n, read: true}));
  saveNotificationsData(list);
  updateNotifBadge();
}

// 소프트 삭제 (휴지통으로 이동)
function deleteNotification(id) {
  const list = loadNotifications().map(n => n.id === id ? {...n, deleted: true} : n);
  saveNotificationsData(list);
  updateNotifBadge();
  renderNotificationsPage();
}

// 전체 소프트 삭제
function deleteAllNotifications() {
  const jp = LANG === 'JP';
  if(!confirm(jp ? '通知をすべてゴミ箱に移動しますか？' : '알림을 모두 휴지통으로 이동하시겠습니까?')) return;
  const list = loadNotifications().map(n => ({...n, deleted: true}));
  saveNotificationsData(list);
  updateNotifBadge();
  renderNotificationsPage();
}

// 휴지통에서 복원
function restoreNotification(id) {
  const list = loadNotifications().map(n => n.id === id ? {...n, deleted: false} : n);
  saveNotificationsData(list);
  updateNotifBadge();
  renderNotificationsPage();
}

// 휴지통 비우기 (영구 삭제)
function emptyTrash() {
  const jp = LANG === 'JP';
  if(!confirm(jp ? 'ゴミ箱を完全に削除しますか？この操作は元に戻せません。' : '휴지통을 비우시겠습니까? 영구 삭제되어 복구할 수 없습니다.')) return;
  saveNotificationsData(loadNotifications().filter(n => !n.deleted));
  renderNotificationsPage();
}

function getUnreadCount() {
  return loadNotifications().filter(n => !n.read && !n.deleted).length;
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if(!badge) return;
  const count = getUnreadCount();
  badge.textContent = count > 9 ? '9+' : String(count);
  badge.style.display = count > 0 ? '' : 'none';
}

const _trashIconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

function renderNotificationsPage() {
  if(_notifView === 'trash') { _renderTrashPage(); return; }
  _renderListPage();
}

function _renderListPage() {
  const jp = LANG === 'JP';
  const container = document.getElementById('notif-list');
  if(!container) return;
  markAllNotifsRead();
  const list = loadNotifications().filter(n => !n.deleted);
  const trashCount = loadNotifications().filter(n => n.deleted).length;

  const footer = `
    <div style="display:flex;justify-content:flex-end;padding:14px 16px;">
      <button onclick="_notifView='trash';renderNotificationsPage();"
        style="display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--text3);font-size:12px;cursor:pointer;padding:4px 8px;border-radius:6px;"
        onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background='none'">
        ${_trashIconSvg}
        <span>${jp ? 'ゴミ箱' : '휴지통'}${trashCount > 0 ? ` (${trashCount})` : ''}</span>
      </button>
    </div>`;

  if(!list.length) {
    container.innerHTML = `
      <div style="padding:70px 20px;text-align:center;color:var(--text3);">
        <div style="font-size:40px;margin-bottom:14px;">🔔</div>
        <div style="font-size:14px;">${jp ? '通知はありません' : '알림이 없습니다'}</div>
      </div>
      ${footer}`;
    return;
  }

  const levelIcon  = { warn:'⚠️', info:'ℹ️', error:'🚨' };
  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border);">
      <button class="btn btn-sm" onclick="markAllNotifsRead();renderNotificationsPage();" style="font-size:12px;">
        ${jp ? '全て既読' : '모두 읽음'}
      </button>
      <button class="btn btn-sm" onclick="deleteAllNotifications();" style="font-size:12px;background:#fff7ed;color:#9a3412;border-color:#fed7aa;">
        ${jp ? '全て削除' : '전체 삭제'}
      </button>
    </div>` +
    list.map(n => `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border2);background:${n.read ? 'transparent' : 'var(--accent2)'};">
        <div style="font-size:20px;line-height:1.4;">${levelIcon[n.level] || 'ℹ️'}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;color:var(--text);line-height:1.6;">${jp ? n.msgJP : n.msgKR}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:5px;">${new Date(n.createdAt).toLocaleString(jp ? 'ja-JP' : 'ko-KR')}</div>
        </div>
        ${n.read ? '' : '<div style="width:8px;height:8px;border-radius:50%;background:#ef4444;margin-top:6px;flex-shrink:0;"></div>'}
        <button onclick="deleteNotification('${n.id}')" style="flex-shrink:0;background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;padding:0 2px;line-height:1;" title="${jp ? 'ゴミ箱へ' : '휴지통으로'}">✕</button>
      </div>`).join('') +
    footer;
}

// ══ SERVICE WORKER & PUSH ══

async function initNotifications() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('/service-worker.js'); } catch(e) {}
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch(e) {}
  }
}

async function sendPushNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) { reg.showNotification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico', tag: tag || 'wisepay' }); return; }
    }
    new Notification(title, { body, icon: '/favicon.ico' });
  } catch(e) {}
}

// ══ PAYROLL ALERTS (wiseadmin 전용) ══

function _jstNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
}

function checkAndShowPayrollAlerts(paidMonths) {
  try {
    const jst  = _jstNow();
    const year = jst.getFullYear();
    const mon  = jst.getMonth() + 1;
    const day  = jst.getDate();
    const todayStr = `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    console.log('[알림] day='+day+' todayStr='+todayStr);

    const prevY  = mon === 1 ? year - 1 : year;
    const prevM  = mon === 1 ? 12 : mon - 1;
    const prevYM = `${prevY}-${String(prevM).padStart(2,'0')}`;

    const paidArr = Array.isArray(paidMonths) ? paidMonths : [...paidMonths];
    console.log('[알림] paidArr='+JSON.stringify(paidArr));
    const jp      = LANG === 'JP';

    // 알림 1: 전월 급여 데이터 미저장 → 이메일 (하루 1회)
    console.log('[알림] prevYM='+prevYM+' saved='+_isMonthSaved(prevYM));
    if (!_isMonthSaved(prevYM)) {
      if (localStorage.getItem('lastDataInputReminderEmail') !== todayStr) {
        _sendDataInputReminderViaGas(prevY, prevM);
        localStorage.setItem('lastDataInputReminderEmail', todayStr);
      }
    }

    // 알림 2 / 3: 저장됐는데 송금 완료 안 된 달 존재
    const unpaidYM = _getLatestUnpaidSavedMonth(paidArr);
    console.log('[알림] unpaidYM='+unpaidYM);
    if (!unpaidYM) return;
    const [uy, um] = unpaidYM.split('-').map(Number);

    console.log('[알림] day<10?'+(day<10)+' → 알림'+(day<10?'2':'3')+'번 분기');
    if (day < 10) {
      // 알림 2: 송금 독촉 말풍선 + 이메일 (day < 10)
      showPayrollReminderBanner(
        `💸 ${uy}년 ${um}월분 급여 송금 기한은 10일까지입니다.`,
        `💸 ${uy}年${um}月分の給与振込期限は10日です。`,
        jp, 2
      );
      if (localStorage.getItem('lastSendReminderEmail') !== todayStr) {
        _sendReminderEmailViaGas(uy, um);
        localStorage.setItem('lastSendReminderEmail', todayStr);
      }
    } else {
      // 알림 3: 송금 완료 버튼 독촉 말풍선 + 이메일 (day >= 10)
      console.log('[알림] topbar-center='+document.getElementById('topbar-center'));
      console.log('[알림] 기존balloon='+document.getElementById('payroll-balloon'));
      showPayrollReminderBanner(
        `✅ ${uy}년 ${um}월분 급여 송금이 완료되셨나요? 🔒 송금 완료 버튼을 눌러주세요.`,
        `✅ ${uy}年${um}月分の給与振込はお済みですか？ 🔒 送金完了ボタンを押してください。`,
        jp, 3
      );
      console.log('[알림] showPayrollReminderBanner 호출 완료');
      if (localStorage.getItem('lastPayConfirmReminderEmail') !== todayStr) {
        _sendPayConfirmReminderViaGas(uy, um);
        localStorage.setItem('lastPayConfirmReminderEmail', todayStr);
      }
    }
  } catch(e) { console.error('[알림] catch 에러:', e); }
}

function _isMonthSaved(ym) {
  const [y, m] = ym.split('-').map(Number);
  const emps = (typeof employees !== 'undefined') ? employees : [];
  const pf   = (typeof PFIELDS   !== 'undefined') ? PFIELDS   : [];
  return emps.some(emp => {
    const key = `kyuyo_p_${String(emp.no).padStart(4,'0')}_${y}_${m}`;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    try {
      const d = JSON.parse(raw);
      return pf.some(f => f in d && Number(String(d[f]||'0').replace(/,/g,'')) !== 0);
    } catch(e) { return false; }
  });
}

function _getLatestUnpaidSavedMonth(paidArr) {
  const jst = _jstNow();
  let y = jst.getFullYear(), m = jst.getMonth() + 1;
  for (let i = 0; i < 24; i++) {
    const ym = `${y}-${String(m).padStart(2,'0')}`;
    if (!paidArr.includes(ym) && _isMonthSaved(ym)) return ym;
    m--;
    if (m < 1) { m = 12; y--; }
  }
  return null;
}

function showPayrollReminderBanner(msgKR, msgJP, jp, type) {
  if (document.getElementById('payroll-balloon')) return;
  const center = document.getElementById('topbar-center');
  if (!center) return;

  const c = type === 3
    ? { bg: '#EFF6FF', border: '#93C5FD', text: '#1E40AF', btn: '#3B82F6' }
    : { bg: '#FFFBEB', border: '#FCD34D', text: '#92400E', btn: '#F59E0B' };

  const balloon = document.createElement('div');
  balloon.id        = 'payroll-balloon';
  balloon.className = 'payroll-balloon';
  balloon.style.cssText += `background:${c.bg};border:1px solid ${c.border};color:${c.text};`;
  balloon.innerHTML =
    `<span class="payroll-balloon-text">${jp ? msgJP : msgKR}</span>` +
    `<button class="payroll-balloon-confirm" style="background:${c.btn}">${jp ? '確認' : '확인'}</button>`;

  center.appendChild(balloon);

  balloon.querySelector('.payroll-balloon-confirm').addEventListener('click', () => {
    balloon.style.animation = 'balloonFadeOut 0.3s ease forwards';
    balloon.addEventListener('animationend', () => balloon.remove(), { once: true });
  });
}

async function _sendReminderEmailViaGas(year, month) {
  if (typeof gasUrl === 'undefined' || !gasUrl) return;
  try {
    await fetch(gasUrl, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'sendReminderEmail', year, month })
    });
  } catch(e) {}
}

async function _sendDataInputReminderViaGas(year, month) {
  if (typeof gasUrl === 'undefined' || !gasUrl) return;
  try {
    await fetch(gasUrl, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'sendDataInputReminder', year, month })
    });
  } catch(e) {}
}

async function _sendPayConfirmReminderViaGas(year, month) {
  if (typeof gasUrl === 'undefined' || !gasUrl) return;
  try {
    await fetch(gasUrl, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'sendPayConfirmReminder', year, month })
    });
  } catch(e) {}
}

// ── DEV ONLY: 제거 예정 ──────────────────────────────────────
window._testAlert = function(day) {
  const el = document.getElementById('payroll-balloon');
  if (el) el.remove();
  const _orig = window._jstNow;
  window._jstNow = function() { const d = _orig(); d.setDate(day); return d; };
  checkAndShowPayrollAlerts([...paidYMs]);
  window._jstNow = _orig;
};
// ─────────────────────────────────────────────────────────────

function _renderTrashPage() {
  const jp = LANG === 'JP';
  const container = document.getElementById('notif-list');
  if(!container) return;
  const list = loadNotifications().filter(n => n.deleted);
  const levelIcon = { warn:'⚠️', info:'ℹ️', error:'🚨' };

  const header = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);">
      <button onclick="_notifView='list';renderNotificationsPage();"
        style="display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;padding:4px 8px;border-radius:6px;"
        onmouseover="this.style.background='var(--accent2)'" onmouseout="this.style.background='none'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        ${jp ? '通知リストへ戻る' : '알림 목록으로 돌아가기'}
      </button>
      <span style="font-size:12px;font-weight:600;color:var(--text2);">${jp ? 'ゴミ箱' : '휴지통'}</span>
    </div>`;

  if(!list.length) {
    container.innerHTML = header + `
      <div style="padding:70px 20px;text-align:center;color:var(--text3);">
        <div style="font-size:36px;margin-bottom:14px;">🗑️</div>
        <div style="font-size:14px;">${jp ? 'ゴミ箱は空です' : '휴지통이 비어 있습니다'}</div>
      </div>`;
    return;
  }

  container.innerHTML = header + `
    <div style="display:flex;justify-content:flex-end;padding:10px 16px;border-bottom:1px solid var(--border);">
      <button class="btn btn-sm" onclick="emptyTrash();" style="font-size:12px;background:#fee2e2;color:#991b1b;border-color:#fca5a5;">
        ${jp ? 'ゴミ箱を空にする' : '휴지통 비우기'}
      </button>
    </div>` +
    list.map(n => `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border2);opacity:0.7;">
        <div style="font-size:20px;line-height:1.4;">${levelIcon[n.level] || 'ℹ️'}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;color:var(--text);line-height:1.6;">${jp ? n.msgJP : n.msgKR}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:5px;">${new Date(n.createdAt).toLocaleString(jp ? 'ja-JP' : 'ko-KR')}</div>
        </div>
        <button onclick="restoreNotification('${n.id}')" style="flex-shrink:0;background:none;border:1px solid var(--border);color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;padding:3px 8px;border-radius:5px;white-space:nowrap;">
          ${jp ? '復元' : '복원'}
        </button>
      </div>`).join('');
}
