// 수정: 2026-06-08 16:26 — showAnchorToast 추가 (연도 화살표 데이터 없음 고정 위치 토스트)
'use strict';

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function showToast(msg, type = '') {
  let el = document.getElementById('showToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'showToast';
    el.className = 'showToast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'showToast show ' + type;
  setTimeout(() => {
    el.className = 'showToast ' + type;
  }, 2600);
}

function showAnchorToast(anchorEl, msg, duration) {
  duration = duration || 3000;
  const existing = document.getElementById('_anchor-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = '_anchor-toast';
  toast.style.cssText = 'position:fixed;z-index:9999;background:#1e293b;color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,.28);pointer-events:none;opacity:0;transition:opacity .2s;white-space:nowrap;line-height:1.5;';
  toast.textContent = msg;
  document.body.appendChild(toast);
  const rect = anchorEl.getBoundingClientRect();
  toast.style.left = (rect.left + rect.width / 2) + 'px';
  toast.style.top  = (rect.top - 8) + 'px';
  toast.style.transform = 'translate(-50%, -100%)';
  requestAnimationFrame(function() { toast.style.opacity = '1'; });
  setTimeout(function() {
    toast.style.opacity = '0';
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, 220);
  }, duration);
}

function fmt(n) {
  return Math.round(n).toLocaleString('ja-JP');
}

// Google Sheets가 "2026-04"를 날짜로 변환해 ISO 문자열로 돌려줄 때 정규화
// YYYY-MM 형식이 아니거나 파싱 불가능하면 '' 반환 (strict)
function normalizeYM(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
  } catch(e) {}
  const match = s.match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : '';
}

// ISO 날짜 문자열 → YYYY-MM-DD (예: '1973-07-18T15:00:00.000Z' → '1973-07-18')
function normalizeDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

// JST 오늘 날짜를 'YYYY-MM-DD' 형식으로 반환
function jstToday() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 두 'YYYY-MM-DD' 문자열 사이의 일수 차이 (절댓값)
function daysDiff(a, b) {
  return Math.abs((new Date(a) - new Date(b)) / 86400000);
}

// 비영업일 판정: 레이어1=토/일, 레이어2=공휴일 캐시, 레이어3=은행 휴업일(매년 고정)
function isNonBusinessDay(d, holidays) {
  const dow = d.getDay();
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const dd  = String(d.getDate()).padStart(2, '0');
  const mmdd = `${mm}-${dd}`;
  if (dow === 0 || dow === 6) return true;
  if (mmdd === '12-31' || mmdd === '01-02' || mmdd === '01-03') return true;
  if (Array.isArray(holidays) && holidays.includes(`${d.getFullYear()}-${mmdd}`)) return true;
  return false;
}

// 익월 10일 지급 예정일 계산 (year/month: 급여 귀속 월 1-based)
// JS Date month が 0-based なので month をそのまま渡すと翌月10日になる
function getPayDate(year, month) {
  const holidays = JSON.parse(localStorage.getItem('holidayCache') || '[]');
  let d = new Date(year, month, 10);
  for (let i = 0; i < 7; i++) {
    if (!isNonBusinessDay(d, holidays)) break;
    d.setDate(d.getDate() - 1);
  }
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), isAdjusted: d.getDate() !== 10 };
}

// 지급 예정일 표시 텍스트 생성
function fmtPayDateTxt(pd, jp) {
  if (!pd.isAdjusted) return jp ? `(${pd.y}年${pd.m}月10日 支給予定)` : `(${pd.y}년 ${pd.m}월 10일 지급 예정)`;
  return jp
    ? `(${pd.y}年${pd.m}月${pd.d}日 支給予定 ※10日が休日)`
    : `(${pd.y}년 ${pd.m}월 ${pd.d}일 지급 예정 ※10일이 휴일)`;
}

function fmtYM(ym) {
  const norm = normalizeYM(ym);
  if (!norm) return ym || '';
  const [y, m] = norm.split('-');
  return LANG === 'JP' ? `${y}年${parseInt(m)}月` : `${y}년 ${parseInt(m)}월`;
}
