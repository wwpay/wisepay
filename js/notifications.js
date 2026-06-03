// 수정: 2026-06-03 09:27 — Service Worker 푸시 알림 + 송금 독촉 배너/이메일/팝업 (wiseadmin 전용)
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

    const prevY = mon === 1 ? year - 1 : year;
    const prevM = mon === 1 ? 12 : mon - 1;
    const prevMonth = `${prevY}-${String(prevM).padStart(2,'0')}`;

    const jp = LANG === 'JP';
    const prevLabel  = jp ? `${prevY}年${prevM}月` : `${prevY}년 ${prevM}월`;
    const deadline   = jp ? `${year}年${mon}月10日` : `${year}년 ${mon}월 10일`;

    const reminded   = localStorage.getItem('payrollRemindedMonth') === prevMonth;
    const paidArr    = Array.isArray(paidMonths) ? paidMonths : [...paidMonths];

    if (!reminded) {
      showPayrollReminderBanner(prevLabel, deadline, prevMonth, jp);
      const emailedToday = localStorage.getItem('lastReminderEmail') === todayStr;
      if (!emailedToday) {
        _sendReminderEmailViaGas(prevY, prevM);
        localStorage.setItem('lastReminderEmail', todayStr);
      }
    } else if (!paidArr.includes(prevMonth)) {
      showUnconfirmedPaymentModal(prevLabel, jp);
    }
  } catch(e) {}
}

function showPayrollReminderBanner(prevLabel, deadline, prevMonth, jp) {
  if (document.getElementById('payroll-reminder-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'payroll-reminder-banner';
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:9999;' +
    'background:#FEF9C3;color:#854D0E;' +
    'padding:12px 20px 14px;box-shadow:0 2px 8px rgba(0,0,0,.15);font-family:inherit;';

  const msg = jp
    ? `💸 ${prevLabel}分 給与振込期限: <strong>${deadline}</strong>まで — 振込完了後、下のボタンを押してください`
    : `💸 ${prevLabel}분 급여 송금 기한: <strong>${deadline}</strong>까지 — 송금 완료 후 아래 버튼을 눌러주세요`;
  const btnTxt = jp ? '✅ 振込完了を確認' : '✅ 송금 완료 확인';

  banner.innerHTML =
    `<div style="font-size:13px;font-weight:600;margin-bottom:9px;line-height:1.5;">${msg}</div>` +
    `<button id="payroll-remind-ok" style="display:inline-flex;align-items:center;gap:5px;` +
    `padding:7px 18px;background:#16a34a;color:#fff;border:none;border-radius:7px;` +
    `font-size:12px;font-weight:700;cursor:pointer;">${btnTxt}</button>`;

  document.body.prepend(banner);
  requestAnimationFrame(() => {
    const h = banner.getBoundingClientRect().height;
    banner._h = h;
    document.body.style.paddingTop = (parseInt(document.body.style.paddingTop || '0') + h) + 'px';
  });

  document.getElementById('payroll-remind-ok').addEventListener('click', () => {
    localStorage.setItem('payrollRemindedMonth', prevMonth);
    const h = banner._h || 0;
    const cur = parseInt(document.body.style.paddingTop || '0');
    document.body.style.paddingTop = Math.max(0, cur - h) + 'px';
    banner.remove();
    addNotification(
      'wire-done-' + prevMonth, 'info',
      `${prevLabel}분 급여 송금 완료 확인됨`,
      `${prevLabel}分の給与振込完了を確認しました`
    );
  });
}

function showUnconfirmedPaymentModal(prevLabel, jp) {
  if (document.getElementById('modal-unpaid-alert')) return;
  const ov = document.createElement('div');
  ov.id = 'modal-unpaid-alert';
  ov.style.cssText =
    'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;' +
    'justify-content:center;background:rgba(0,0,0,.45);font-family:inherit;';
  const body = jp
    ? `${prevLabel}分の給与支払い完了処理が行われていません。<br>支払い完了ボタンを押してください。`
    : `${prevLabel}분 급여 지급완료 처리가 되지 않았습니다.<br>지급완료 버튼을 눌러주세요.`;
  const sub = jp
    ? '給与明細画面下部の [🔒 支払い確定] ボタンで処理してください。'
    : '급여 명세 화면 하단의 [🔒 지급 확정] 버튼을 눌러 처리해 주세요.';
  const btnTxt = jp ? '確認' : '확인';

  ov.innerHTML =
    `<div style="background:#fff;border-radius:12px;padding:28px 28px 22px;` +
    `max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.18);">` +
    `<div style="font-size:22px;margin-bottom:10px;">⚠️</div>` +
    `<div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:8px;line-height:1.6;">${body}</div>` +
    `<div style="font-size:11px;color:#64748b;margin-bottom:18px;">${sub}</div>` +
    `<div style="display:flex;justify-content:flex-end;">` +
    `<button id="unpaid-alert-ok" style="padding:8px 22px;background:#4f46e5;color:#fff;` +
    `border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">${btnTxt}</button>` +
    `</div></div>`;

  document.body.appendChild(ov);
  document.getElementById('unpaid-alert-ok').addEventListener('click', () => ov.remove());
}

async function _sendReminderEmailViaGas(year, month) {
  if (typeof gasUrl === 'undefined' || !gasUrl) return;
  try {
    const auth = typeof gasWriteAuth === 'function' ? gasWriteAuth() : {};
    await fetch(gasUrl, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'sendReminderEmail', year, month, ...auth })
    });
  } catch(e) {}
}

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
