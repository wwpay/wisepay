// 수정: 2026-06-08 21:46 — 달력 유급일 표시: 파란 원 배경 → 앰버 밑줄로 변경 (styles.css 연동)
'use strict';

// 입사월 → 초기 발생일수
function calcInitialDays(joinMonth) {
  if (joinMonth >= 1 && joinMonth <= 9) {
    return 15 - (joinMonth - 1);
  }
  return 1; // 10~12월 입사
}

// grant_year별 부여/사용 집계 맵 생성
// empNo 키 정규화: '2' → '0002', '19' → '0019' (GAS 숫자 변환 대응)
function _vacKey(empNo) {
  const s = String(empNo).trim();
  return s.padStart(4, '0');
}

// vacationData 전체 키를 4자리 패딩으로 일괄 정규화 (마이그레이션용)
function _normalizeVacationKeys() {
  const needsFix = Object.keys(vacationData).some(k => k !== k.padStart(4, '0'));
  if (!needsFix) return;
  const fixed = {};
  Object.keys(vacationData).forEach(k => {
    fixed[k.padStart(4, '0')] = vacationData[k];
  });
  vacationData = fixed;
  localStorage.setItem(typeof LS !== 'undefined' ? LS.vacation : 'kyuyo_vacation', JSON.stringify(vacationData));
}

function _buildGrantMap(empNo) {
  const records = vacationData[_vacKey(empNo)] || [];
  const map = {};
  records.forEach(r => {
    const gy = parseInt(r.grant_year);
    if (isNaN(gy)) return;
    if (!map[gy]) map[gy] = { granted: 0, used: 0 };
    if (r.used === 0 && (r.reason === '초기발생' || r.reason === '연간발생')) {
      map[gy].granted += (r.days || 0);
    } else if (r.used > 0) {
      map[gy].used += r.used;
    }
  });
  return map;
}

// 사원의 현재 유급휴가 현황 계산
function calcVacationSummary(empNo) {
  const today = jstToday();
  const thisYear = parseInt(today.substring(0, 4));
  const jan1Str = `${thisYear}-01-01`;
  const records = vacationData[_vacKey(empNo)] || [];
  const map = _buildGrantMap(empNo);

  let totalGranted = 0;
  let totalUsed = 0;
  let remaining = 0;
  let expiringInfo = null;

  Object.keys(map).forEach(gy => {
    const gyNum = parseInt(gy);
    const { granted, used } = map[gyNum];
    totalGranted += granted;
    totalUsed += used;

    // 유효기간: 발생연도+1년 12월 31일 소멸
    const expireDate = (gyNum + 1) + '-12-31';
    if (expireDate < today) return;

    const rem = Math.max(0, granted - used);
    remaining += rem;

    // 3개월 이내 소멸 예정
    if (rem > 0) {
      const diffDays = (new Date(expireDate) - new Date(today)) / 86400000;
      const monthsLeft = diffDays / 30.44;
      if (monthsLeft <= 3 && (!expiringInfo || gyNum < parseInt(expiringInfo.grantYear))) {
        expiringInfo = { days: rem, expireDate, monthsLeft: Math.ceil(monthsLeft), grantYear: gy };
      }
    }
  });

  // 올해 1월 1일 기준 잔여 (소멸되지 않은 grant_year 기준, 1월1일 이전 기록만)
  let _jan1G = 0, _jan1U = 0;
  records.forEach(r => {
    const gy = parseInt(r.grant_year);
    if (isNaN(gy) || gy < thisYear - 1) return; // 1월1일 기준 소멸된 연도 제외
    if (!r.date || r.date >= jan1Str) return;    // 1월1일 이후 기록 제외
    if (r.used === 0 && (r.reason === '초기발생' || r.reason === '연간발생')) {
      _jan1G += (r.days || 0);
    } else if (r.used > 0) {
      _jan1U += r.used;
    }
  });
  const jan1Remaining = parseFloat(Math.max(0, _jan1G - _jan1U).toFixed(1));

  // 올해 1월 1일 이후 오늘까지 사용
  let usedSinceJan1 = 0;
  records.forEach(r => {
    if (r.used > 0 && r.date && r.date >= jan1Str && r.date <= today) {
      usedSinceJan1 += r.used;
    }
  });

  // 올해 소진 필요 (전년도 grant_year → 올해 12월31일 소멸)
  const prevGY = thisYear - 1;
  const prevGYData = map[prevGY] || { granted: 0, used: 0 };
  const mustUseByYearEnd = parseFloat(Math.max(0, prevGYData.granted - prevGYData.used).toFixed(1));

  return {
    totalGranted,
    totalUsed,
    remaining: parseFloat(remaining.toFixed(1)),
    expiringInfo,
    jan1Remaining,
    usedSinceJan1: parseFloat(usedSinceJan1.toFixed(1)),
    mustUseByYearEnd,
  };
}

// 사용 시 차감할 grant_year 자동 결정 (오래된 것부터)
function _resolveGrantYear(empNo) {
  const today = jstToday();
  const map = _buildGrantMap(empNo);

  const sortedYears = Object.keys(map)
    .map(gy => parseInt(gy))
    .filter(gyNum => (gyNum + 1) + '-12-31' >= today)
    .sort((a, b) => a - b);

  for (const gyNum of sortedYears) {
    const { granted, used } = map[gyNum];
    if (granted - used > 0) return gyNum;
  }
  return new Date().getFullYear(); // fallback
}

// 유급휴가 사용 추가
function addVacationUsage(empNo, date, used, reason) {
  const key = _vacKey(empNo);
  if (!vacationData[key]) vacationData[key] = [];

  const grantYear = _resolveGrantYear(empNo);
  vacationData[key].push({ date, used, reason, grant_year: grantYear });

  localStorage.setItem('kyuyo_vacation', JSON.stringify(vacationData));
  if (typeof saveVacationToGas === 'function') saveVacationToGas(vacationData);
}

// 유급휴가 발생 추가 (초기발생·연간발생)
function addVacationGrant(empNo, days, grantYear, reason) {
  const key = _vacKey(empNo);
  if (!vacationData[key]) vacationData[key] = [];

  const today = jstToday();
  vacationData[key].push({ date: today, used: 0, reason, grant_year: grantYear, days });

  localStorage.setItem('kyuyo_vacation', JSON.stringify(vacationData));
  if (typeof saveVacationToGas === 'function') saveVacationToGas(vacationData);
}

// 사용 기록 삭제 (index: vacationData[empNo] 배열 인덱스)
function deleteVacationUsage(empNo, index) {
  const key = _vacKey(empNo);
  if (!vacationData[key] || vacationData[key][index] === undefined) return;

  vacationData[key].splice(index, 1);
  localStorage.setItem('kyuyo_vacation', JSON.stringify(vacationData));
  if (typeof saveVacationToGas === 'function') saveVacationToGas(vacationData);
}

// 신규 사원 초기 유급휴가 발생
function initEmployeeVacation(emp) {
  if (!emp || !emp.join) return;
  const joinMonth = parseInt(emp.join.substring(5, 7));
  if (isNaN(joinMonth)) return;

  const joinYear = parseInt(emp.join.substring(0, 4));
  const days = calcInitialDays(joinMonth);
  const empNo = String(emp.no).padStart(4, '0');

  addVacationGrant(empNo, days, joinYear, '초기발생');
}

// ══════════════ UI ══════════════

let _vacTab = 'main';
let _vacDetailEmpNo = null;
let _vacDetailYear  = new Date().getFullYear();
let _vacDetailMonth = new Date().getMonth() + 1;
let _vacModalEmpNo  = null;
let _vacHideNotApplied = true;

function _jstDateFmt(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
}

// 직원 선택 드롭다운 토글
function toggleVacEmpDrop(e) {
  e.stopPropagation();
  const drop = document.getElementById('vacEmpDrop');
  if (!drop) return;
  const open = drop.style.display !== 'none';
  drop.style.display = open ? 'none' : 'block';
  if (!open) buildVacationEmpList();
}

function closeVacEmpDrop() {
  const drop = document.getElementById('vacEmpDrop');
  if (drop) drop.style.display = 'none';
}

function buildVacationEmpList() {
  const list = document.getElementById('vacEmpCheckList');
  if (!list) return;
  const jp = LANG === 'JP';
  const selected = getSelectedVacNos();

  const empList = employees.filter(emp => {
    if (!emp || emp.no == null) return false;
    if (_vacHideNotApplied && emp.vacationApplied === false) return false;
    return true;
  });

  list.innerHTML = empList.map(emp => {
    const no  = String(emp.no).padStart(4, '0');
    const key = `vac_emp_${no}`;
    const chk = selected.has(no);
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 2px;cursor:pointer;font-size:13px;">
      <input type="checkbox" id="${key}" value="${no}" ${chk ? 'checked' : ''}
        style="accent-color:var(--accent);width:14px;height:14px;"
        onchange="updateVacSelSummary()">
      <span style="flex:1;min-width:0;">${no} ${emp.name}${emp.kana?`<span style="font-size:11px;color:var(--text3);margin-left:4px;">（${emp.kana}）</span>`:''}</span>
    </label>`;
  }).join('');

  updateVacSelSummary();
}

function toggleVacHideNotApplied() {
  _vacHideNotApplied = document.getElementById('vacHideNotApplied')?.checked !== false;
  buildVacationEmpList();
}

function getSelectedVacNos() {
  const set = new Set();
  document.querySelectorAll('#vacEmpCheckList input[type=checkbox]:checked').forEach(cb => set.add(cb.value));
  return set;
}

function updateVacSelSummary() {
  const selected = getSelectedVacNos();
  const jp = LANG === 'JP';
  const countEl = document.getElementById('vacEmpSelCount');
  const labelEl = document.getElementById('vacEmpSelLabel');
  if (countEl) {
    countEl.textContent = selected.size;
    countEl.style.display = selected.size > 0 ? '' : 'none';
  }
  if (labelEl) {
    labelEl.textContent = selected.size === 0
      ? (jp ? '従業員選択' : '사원 선택')
      : (jp ? '選択中' : '선택 중');
  }
}

function confirmVacEmpSel() {
  closeVacEmpDrop();
  renderVacationCards();
}

function vacSelectAll() {
  document.querySelectorAll('#vacEmpCheckList input[type=checkbox]').forEach(cb => { cb.checked = true; });
  updateVacSelSummary();
}

function vacSelectNone() {
  document.querySelectorAll('#vacEmpCheckList input[type=checkbox]').forEach(cb => { cb.checked = false; });
  updateVacSelSummary();
}

function renderVacationPage() {
  _normalizeVacationKeys(); // '2'→'0002' 등 기존 비패딩 키 자동 정규화
  if (_vacTab === 'detail') {
    renderVacationDetail();
    return;
  }
  buildVacationEmpList();
  renderVacationCards();
}

function renderVacationCards() {
  const jp = LANG === 'JP';
  const thisYear = parseInt(jstToday().substring(0, 4));
  const container = document.getElementById('vacCardsContainer');
  if (!container) return;

  let selectedNos = getSelectedVacNos();
  if (selectedNos.size === 0) {
    container.innerHTML = `<div style="width:100%;min-height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text3);">
      <div style="font-size:40px;margin-bottom:12px;">🌴</div>
      <div style="font-size:14px;">${jp ? '従業員を選択してください' : '사원을 선택해 주세요'}</div>
    </div>`;
    return;
  }

  const toShow = employees.filter(e => e && e.no != null && selectedNos.has(String(e.no).padStart(4, '0')));
  if (!toShow.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = toShow.map(emp => {
    const no  = String(emp.no).padStart(4, '0');
    const notApplied = emp.vacationApplied === false;
    const subLine = `${no}${emp.kana ? (jp ? '　' : ' ') + emp.kana : ''}`;
    const titleHtml = `<div class="vac-card-title">
        <div class="vac-card-name">${emp.name}</div>
        <div class="vac-card-sub">${subLine}</div>
      </div>`;
    if (notApplied) {
      return `<div class="vac-card">
        <div class="vac-card-head">
          ${titleHtml}
          <span class="vac-badge-none">${jp ? '非適用' : '미적용'}</span>
        </div>
        <div class="vac-card-body" style="color:var(--text3);font-size:12px;">${jp ? '有給管理対象外' : '유급휴가 관리 대상이 아닙니다'}</div>
      </div>`;
    }
    const sum = calcVacationSummary(no);
    const unitStr = jp ? '日' : '일';
    const remClass = sum.remaining <= 5.0 ? 'red' : '';
    const mustClass = sum.mustUseByYearEnd > 0 ? 'red' : '';
    const jan1Label = jp ? `${thisYear}年1月1日時点残日数` : `${thisYear}년 1월 1일 기준 잔여`;
    return `<div class="vac-card">
      <div class="vac-card-head">
        ${titleHtml}
        <button class="btn btn-sm btn-primary" onclick="showVacationDetail('${no}')">${jp ? '詳細' : '상세'}</button>
      </div>
      <div class="vac-card-body">
        <div class="vac-card-row">
          <span class="vac-card-row-label">${jan1Label}</span>
          <span class="vac-card-row-val">${sum.jan1Remaining.toFixed(1)}${unitStr}</span>
        </div>
        <div class="vac-card-row">
          <span class="vac-card-row-label">${jp ? '現在までの使用' : '현재까지 사용'}</span>
          <span class="vac-card-row-val">${sum.usedSinceJan1.toFixed(1)}${unitStr}</span>
        </div>
        <div class="vac-card-row">
          <span class="vac-card-row-label">${jp ? '残年次' : '남은 연차'}</span>
          <span class="vac-card-row-val ${remClass}">${sum.remaining.toFixed(1)}${unitStr}</span>
        </div>
        <div class="vac-card-row">
          <span class="vac-card-row-label">${jp ? '今年中に消化必要' : '올해 소진 필요'}</span>
          <span class="vac-card-row-val ${mustClass}">${sum.mustUseByYearEnd.toFixed(1)}${unitStr}</span>
        </div>
        <div class="vac-card-foot">
          <button class="btn" onclick="showVacationModal('${no}')">${jp ? '休暇登録' : '휴가 등록'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function showVacationDetail(empNo) {
  _vacTab = 'detail';
  _vacDetailEmpNo = empNo;
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  _vacDetailYear  = now.getFullYear();
  _vacDetailMonth = now.getMonth() + 1;

  const mainArea  = document.getElementById('vacMainArea');
  const detailArea = document.getElementById('vacDetailArea');
  if (mainArea)   mainArea.style.display  = 'none';
  if (detailArea) detailArea.style.display = '';

  renderVacationDetail();
}

function hideVacationDetail() {
  _vacTab = 'main';
  _vacDetailEmpNo = null;
  const mainArea   = document.getElementById('vacMainArea');
  const detailArea = document.getElementById('vacDetailArea');
  if (mainArea)   mainArea.style.display  = '';
  if (detailArea) detailArea.style.display = 'none';
  renderVacationCards();
}

function renderVacationDetail() {
  const jp  = LANG === 'JP';
  const emp = employees.find(e => String(e.no).padStart(4, '0') === _vacDetailEmpNo);
  if (!emp) { hideVacationDetail(); return; }
  const no  = String(emp.no).padStart(4, '0');
  const sum = calcVacationSummary(no);

  const headEl = document.getElementById('vacDetailHead');
  if (headEl) {
    const remClass = sum.remaining <= 5.0 ? 'color:var(--red)' : '';
    headEl.innerHTML = `
      <div style="margin-bottom:10px;">
        <div style="font-size:15px;font-weight:700;">${emp.name}
          ${emp.kana ? `<span style="font-size:12px;color:var(--text3);margin-left:5px;font-weight:400;">（${emp.kana}）</span>` : ''}
          <span style="font-size:12px;color:var(--text3);margin-left:5px;">No.${no}</span>
        </div>
      </div>
      <div class="vac-stats-row" style="max-width:240px;margin-bottom:10px;">
        <div class="vac-stat">
          <div class="vac-stat-label">${jp ? '使用合計' : '총 사용'}</div>
          <div class="vac-stat-val">${sum.totalUsed.toFixed(1)}</div>
        </div>
        <div class="vac-stat">
          <div class="vac-stat-label">${jp ? '残日数' : '잔여'}</div>
          <div class="vac-stat-val" style="${remClass}">${sum.remaining.toFixed(1)}</div>
        </div>
      </div>
      ${sum.expiringInfo ? `<div class="vac-expiry-warn">⚠️ ${sum.expiringInfo.days}${jp?'日':'일'} ${jp?'が':'이'} ${sum.expiringInfo.monthsLeft}${jp?'ヶ月以内に失効予定':'개월 이내 소멸 예정'} (${sum.expiringInfo.expireDate})</div>` : ''}`;
  }

  _renderVacNavBar();
  _renderVacCalendar();
  _renderVacList();
}

function _renderVacCalendar() {
  const jp  = LANG === 'JP';
  const cal = document.getElementById('vacCalPanel');
  if (!cal) return;
  const no = _vacDetailEmpNo;
  if (!no) { cal.innerHTML = ''; return; }

  const records = (vacationData[no] || []).filter(r => r.used > 0);
  const usedDates = {};
  records.forEach((r, idx) => {
    if (r.date) usedDates[r.date] = { used: r.used, idx };
  });

  const year  = _vacDetailYear;
  const month = _vacDetailMonth;
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const today = jstToday();
  const dow = jp
    ? ['日','月','火','水','木','金','土']
    : ['일','월','화','수','목','금','토'];

  let cells = '';
  for (let i = 0; i < firstDay; i++) {
    const emptyCls = i === 0 ? ' sun' : i === 6 ? ' sat' : '';
    cells += `<div class="vac-cal-day${emptyCls}"></div>`;
  }
  for (let d = 1; d <= lastDate; d++) {
    const dateStr  = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const info     = usedDates[dateStr];
    const dow_idx  = (firstDay + d - 1) % 7; // 0=Sun, 6=Sat
    let cls = 'vac-cal-day';
    if (dow_idx === 0) cls += ' sun';
    if (dow_idx === 6) cls += ' sat';
    if (info) cls += info.used < 1 ? ' used half' : ' used';
    if (dateStr === today) cls += ' today-mark';
    const clickAttr = info ? ` onclick="_highlightVacCalDate('${dateStr}')"` : '';
    cells += `<div class="${cls}"${clickAttr}>${d}</div>`;
  }

  cal.innerHTML = `
    <div class="vac-cal-month-hdr">${year}${jp ? '年' : '년'} ${month}${jp ? '月' : '월'}</div>
    <div class="vac-cal-grid">
      ${dow.map((d, i) => `<div class="vac-cal-dow${i===0?' sun':i===6?' sat':''}">${d}</div>`).join('')}
      ${cells}
    </div>
    <div style="margin-top:12px;text-align:center;">
      <button class="btn btn-primary" onclick="showVacationModal('${no}')">${jp ? '休暇登録' : '휴가 등록'}</button>
    </div>`;
}

function _renderVacList() {
  const jp   = LANG === 'JP';
  const panel = document.getElementById('vacListPanel');
  if (!panel) return;
  const no = _vacDetailEmpNo;
  if (!no) { panel.innerHTML = ''; return; }

  const year  = _vacDetailYear;
  const month = _vacDetailMonth;
  const monthStr = `${year}-${String(month).padStart(2,'0')}`;
  const records = vacationData[no] || [];
  const monthRecords = records
    .map((r, idx) => ({ ...r, _idx: idx }))
    .filter(r => r.used > 0 && r.date && r.date.startsWith(monthStr))
    .sort((a, b) => a.date.localeCompare(b.date));

  const hdr = `<div class="vac-panel-hdr">${jp ? '使用履歴 / 사용 내역' : '사용 내역 / 使用履歴'}</div>`;

  if (!monthRecords.length) {
    panel.innerHTML = hdr + `<div style="padding:30px 10px;text-align:center;color:var(--text3);font-size:13px;">${jp ? '取得記録なし' : '사용 기록 없음'}</div>`;
    return;
  }

  panel.innerHTML = hdr +
    monthRecords.map(r => {
      const badgeCls = r.used < 1 ? 'half' : 'full';
      const badgeTxt = r.used < 1 ? (jp ? '半日' : '반차') : (jp ? '1日' : '1일');
      return `<div class="vac-list-item" id="vac-li-${r._idx}" onclick="_highlightVacListItem(${r._idx})">
        <span class="vac-list-date">${_jstDateFmt(r.date)}</span>
        <span class="vac-list-badge ${badgeCls}">${badgeTxt}</span>
        <span class="vac-list-reason">${r.reason || ''}</span>
        <button class="vac-list-del" onclick="event.stopPropagation();deleteVacUsage('${no}',${r._idx})" title="${jp ? '削除' : '삭제'}">✕</button>
      </div>`;
    }).join('');
}

function _highlightVacCalDate(dateStr) {
  const no  = _vacDetailEmpNo;
  const rec = (vacationData[no] || [])
    .map((r, i) => ({ ...r, _idx: i }))
    .find(r => r.used > 0 && r.date === dateStr);
  if (!rec) return;
  _highlightVacListItem(rec._idx);
}

function _highlightVacListItem(idx) {
  document.querySelectorAll('.vac-list-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('vac-li-' + idx);
  if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); }

  // 달력 하이라이트
  const cal = document.getElementById('vacCalPanel');
  if (!cal) return;
  cal.querySelectorAll('.vac-cal-day').forEach(d => d.classList.remove('highlight'));
  const no = _vacDetailEmpNo;
  const r  = (vacationData[no] || [])[idx];
  if (!r || !r.date) return;
  const [, , d] = r.date.split('-');
  const dayNum = parseInt(d);
  const days = cal.querySelectorAll('.vac-cal-day');
  const firstDay = new Date(_vacDetailYear, _vacDetailMonth - 1, 1).getDay();
  const targetCell = days[firstDay + dayNum - 1];
  if (targetCell) targetCell.classList.add('highlight');
}

function _renderVacNavBar() {
  const jp  = LANG === 'JP';
  const bar = document.getElementById('vacNavBar');
  if (!bar) return;
  const year  = _vacDetailYear;
  const month = _vacDetailMonth;
  const u = jp ? '月' : '월';
  const monthTabs = Array.from({length:12},(_,i)=>{
    const m = i+1;
    return `<button class="month-tab${m===month?' active':''}" onclick="vacSetMonth(${m})">${m}${u}</button>`;
  }).join('');
  bar.innerHTML = `
    <div class="month-nav">
      <div class="year-ctrl">
        <button class="year-btn" onclick="vacYearPrev(this)">◀</button>
        <span class="year-txt">${year}${jp ? '年' : '년'}</span>
        <button class="year-btn" onclick="vacYearNext()">▶</button>
      </div>
      <div class="month-nav-sep"></div>
      <button class="btn-today" onclick="vacGotoToday()">${jp?'今月':'이번 달'}</button>
      <div class="month-nav-sep"></div>
      <div class="month-tabs">${monthTabs}</div>
    </div>`;
}

function _hasVacDataForYear(year) {
  return Object.values(vacationData).some(records =>
    records.some(r => r.date && r.date.startsWith(String(year)))
  );
}

function vacYearPrev(btn) {
  const prevYear = _vacDetailYear - 1;
  if (!_hasVacDataForYear(prevYear)) {
    const jp = LANG === 'JP';
    const msg = jp ? `${prevYear}年のデータは存在しません` : `${prevYear}년은 데이터가 존재하지 않습니다`;
    if (btn) showAnchorToast(btn, msg, 3000);
    return;
  }
  _vacDetailYear = prevYear; _vacDetailMonth = 12; _renderVacNavBar(); _renderVacCalendar(); _renderVacList();
}
function vacYearNext(btn) { _vacDetailYear++; _vacDetailMonth = 1;  _renderVacNavBar(); _renderVacCalendar(); _renderVacList(); }
function vacSetMonth(m) { _vacDetailMonth = m; _renderVacNavBar(); _renderVacCalendar(); _renderVacList(); }
function vacGotoToday() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  _vacDetailYear  = now.getFullYear();
  _vacDetailMonth = now.getMonth() + 1;
  _renderVacNavBar();
  _renderVacCalendar();
  _renderVacList();
}

function deleteVacUsage(empNo, idx) {
  const jp = LANG === 'JP';
  const r  = (vacationData[empNo] || [])[idx];
  const dStr = r ? _jstDateFmt(r.date) : '';
  const msg = jp
    ? `${dStr} の有給取得記録を削除しますか？`
    : `${dStr} 의 유급휴가 사용 기록을 삭제하시겠습니까?`;
  if (!confirm(msg)) return;
  deleteVacationUsage(empNo, idx);
  renderVacationDetail();
}

function showVacationModal(empNo) {
  _vacModalEmpNo = empNo;
  const jp  = LANG === 'JP';
  const today = jstToday();
  const dateEl = document.getElementById('vac-modal-date');
  if (dateEl) dateEl.value = today;
  const r1 = document.getElementById('vac-modal-r1');
  if (r1) r1.checked = true;
  const reasonEl = document.getElementById('vac-modal-reason');
  if (reasonEl) reasonEl.value = '';
  openModal('modal-vacation');
}

function closeVacationModal() { closeModal('modal-vacation'); }

function saveVacationUsage() {
  const jp   = LANG === 'JP';
  const date = document.getElementById('vac-modal-date')?.value || '';
  if (!date) { showToast(jp ? '日付を入力してください' : '날짜를 입력해 주세요', 'e'); return; }

  const key = _vacKey(_vacModalEmpNo);
  const dup = (vacationData[key] || []).find(r => r.used > 0 && r.date === date);
  if (dup) {
    const d = _jstDateFmt(date);
    alert(jp
      ? `${d} は既に登録されています。\n既存の記録を削除してから再入力してください。`
      : `${d} 는 이미 등록된 날짜입니다.\n기존 기록을 삭제 후 다시 입력해 주세요.`);
    return;
  }

  const r1   = document.getElementById('vac-modal-r1');
  const used = (r1 && r1.checked) ? 1 : 0.5;
  const reason = (document.getElementById('vac-modal-reason')?.value || '').slice(0, 50);
  addVacationUsage(_vacModalEmpNo, date, used, reason);
  closeVacationModal();
  if (_vacTab === 'detail' && _vacDetailEmpNo === _vacModalEmpNo) renderVacationDetail();
  else renderVacationCards();
  showToast(jp ? '有給取得を記録しました' : '유급휴가 사용을 기록했습니다', 's');
}

document.addEventListener('click', e => {
  const wrap = document.getElementById('vacEmpDropWrap');
  if (wrap && !wrap.contains(e.target)) closeVacEmpDrop();
});
