// 수정: 2026-06-16 10:18 — 유급휴가 등록 모달 날짜 기본값 항상 오늘로 고정
'use strict';

// fetchVacationData/mSyncFromGas가 로컬 변경분을 덮어쓰지 않도록 변경 카운터
let _vacDirtyVersion = 0;

// 입사월 → 초기 발생일수
function calcInitialDays(joinMonth) {
  if (joinMonth >= 1 && joinMonth <= 6) {
    return 15 - (joinMonth - 1); // 1월=15, 2월=14, ..., 6월=10
  }
  return 13 - joinMonth; // 7월=6, 8월=5, 9월=4, 10월=3, 11월=2, 12월=1
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
  const key = _vacKey(empNo);
  const map = {};

  // 시트 발생 기록(used=0, days>0)과 사용 기록(used>0)을 grant_year별로 집계
  (vacationData[key] || []).forEach(r => {
    const gy = parseInt(r.grant_year);
    if (isNaN(gy)) return;
    if (!map[gy]) map[gy] = { granted: 0, used: 0 };
    if ((r.used || 0) === 0 && (r.days || 0) > 0) {
      map[gy].granted += (r.days || 0);
    } else if ((r.used || 0) > 0) {
      map[gy].used += r.used;
    }
  });

  return map;
}

// beforeDate(YYYY-MM-DD) 이전 마지막 레코드의 remaining 반환. 없으면 null.
function getLastRemaining(empNo, beforeDate) {
  const records = vacationData[_vacKey(empNo)] || [];
  let lastIdx = -1, lastDate = '';
  records.forEach((r, i) => {
    if (!r.date || r.date > beforeDate) return;
    if (r.date >= lastDate) { lastDate = r.date; lastIdx = i; }
  });
  if (lastIdx === -1) return null;
  const rem = records[lastIdx].remaining;
  return rem != null ? parseFloat(rem) : null;
}

// asOfDate까지의 잔여를 전체 재계산 (remaining 미존재 시 fallback)
function _calcRemainingAtDate(empNo, asOfDate) {
  const records = vacationData[_vacKey(empNo)] || [];
  const sorted = records
    .filter(r => r.date && r.date <= asOfDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  sorted.forEach(r => {
    if (r.used === 0 && (r.reason === '초기발생' || r.reason === '연간발생')) {
      running += (r.days || 0);
    } else if (r.used > 0) {
      running = Math.max(0, running - r.used);
    }
  });
  return parseFloat(running.toFixed(1));
}

// 전 레코드의 remaining 필드를 날짜순으로 재계산 (추가·삭제 후 호출)
// 시트 발생 기록(used=0, days>0)을 기준으로 계산
function _rebuildRemainingForEmp(empNo) {
  const key     = _vacKey(empNo);
  const records = vacationData[key];
  if (!records || !records.length) return;

  // 부여(used=0, days>0)와 사용(used>0)을 날짜순으로 합쳐서 remaining 재계산
  const combined = records
    .map((r, i) => ({ ...r, _i: i }))
    .filter(r => (r.used || 0) === 0 ? (r.days || 0) > 0 : true)
    .sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.used || 0) === 0 ? -1 : 1; // 같은 날짜: 부여 먼저
    });

  let running = 0;
  combined.forEach(item => {
    if ((item.used || 0) === 0) {
      running += (item.days || 0);
    } else {
      running = Math.max(0, running - item.used);
      running = parseFloat(running.toFixed(1));
      records[item._i].remaining = running;
    }
  });
}

// 기존 레코드 remaining 일괄 재계산 (플래그 v2 미만이면 재실행)
function _migrateVacationRemaining() {
  const LS_KEY = typeof LS !== 'undefined' ? LS.vacation : 'kyuyo_vacation';
  if (localStorage.getItem('vacMigrated') === 'v2') return;
  let changed = false;
  Object.keys(vacationData).forEach(empNo => {
    const records = vacationData[empNo];
    if (!records || !records.length) return;
    _rebuildRemainingForEmp(empNo); // 전체 재계산 (FIFO 수정 반영)
    changed = true;
  });
  if (changed) {
    localStorage.setItem(LS_KEY, JSON.stringify(vacationData));
    if (typeof saveVacationToGas === 'function') saveVacationToGas(vacationData);
  }
  localStorage.setItem('vacMigrated', 'v2');
}

// 사원의 현재 유급휴가 현황 계산
// ─ 발생일수는 시트 발생 기록(used=0, days>0)에서 산출
// ─ FIFO 소멸 감안: 만료 직전 그랜트부터 차감해 잔여·소멸 예정을 정확히 계산
function calcVacationSummary(empNo) {
  const today    = jstToday();
  const thisYear = parseInt(today.substring(0, 4));
  const prevYear = thisYear - 1;
  const jan1Str  = `${thisYear}-01-01`;
  const prevYearEnd = `${prevYear}-12-31`;

  const key    = _vacKey(empNo);
  const usages = (vacationData[key] || []).filter(r => parseFloat(r.used) > 0);

  // cutoffDate 시점까지 minGrantYear 이상인 발생 합계
  // vacationData[key]를 직접 스캔: used 문자열 "0" 오판 방지를 위해 parseFloat 사용
  function _grants(cutoffDate, minGrantYear) {
    let total = 0;
    (vacationData[key] || []).forEach(r => {
      const usedVal = parseFloat(r.used) || 0;
      const daysVal = parseFloat(r.days) || 0;
      if (usedVal !== 0 || daysVal <= 0) return;
      const gy = parseInt(r.grant_year);
      if (isNaN(gy) || gy < minGrantYear) return;
      if (!r.date || r.date > cutoffDate) return;
      total += daysVal;
    });
    return parseFloat(total.toFixed(1));
  }

  // cutoffDate까지 사용 합계
  function _usedUpTo(cutoffDate) {
    let total = 0;
    usages.forEach(r => { if (r.date && r.date <= cutoffDate) total += parseFloat(r.used) || 0; });
    return parseFloat(total.toFixed(1));
  }

  const TU_prev = _usedUpTo(prevYearEnd);

  // 전년도 12/31 잔여 — FIFO: 만료 그랜트 먼저 소진 후 유효 그랜트 잔여 산출
  const TG_all_prev    = _grants(prevYearEnd, -Infinity);
  const TG_valid_prev  = _grants(prevYearEnd, thisYear - 1);
  const TG_exp_prev    = TG_all_prev - TG_valid_prev;
  const prevYearEndRemaining = parseFloat(
    Math.max(0, TG_valid_prev - Math.max(0, TU_prev - TG_exp_prev)).toFixed(1));

  // 올해 1/1 기준 잔여 — 같은 FIFO 방식
  const TG_all_jan1    = _grants(jan1Str, -Infinity);
  const TG_valid_jan1  = _grants(jan1Str, thisYear - 1);
  const TG_exp_jan1    = TG_all_jan1 - TG_valid_jan1;
  const jan1Remaining  = parseFloat(
    Math.max(0, TG_valid_jan1 - Math.max(0, TU_prev - TG_exp_jan1)).toFixed(1));

  // 올해 1/1 이후 사용 (미래 예정 포함)
  let usedSinceJan1 = 0;
  usages.forEach(r => {
    if (r.date && r.date >= jan1Str) usedSinceJan1 += parseFloat(r.used) || 0;
  });
  usedSinceJan1 = parseFloat(usedSinceJan1.toFixed(1));

  // 잔여 — FIFO (발생은 오늘까지, 사용은 미래 예정 포함)
  const TU_total       = _usedUpTo('9999-12-31');
  const TG_all_today   = _grants(today, -Infinity);
  const TG_valid_today = _grants(today, thisYear - 1);
  const TG_exp_today   = TG_all_today - TG_valid_today;
  const remaining      = parseFloat(
    (TG_valid_today - Math.max(0, TU_total - TG_exp_today)).toFixed(1));

  // 내년 1/1 소멸 예정 (prevYear 그랜트 잔여 - 올해 사용)
  const expiringNextYear = parseFloat(Math.max(0, prevYearEndRemaining - usedSinceJan1).toFixed(1));

  // 전체 이력
  const totalGranted = parseFloat(TG_all_today.toFixed(1));
  const totalUsed    = parseFloat(TU_total.toFixed(1));

  // 3개월 이내 소멸 예정 알림
  let expiringInfo = null;
  if (expiringNextYear > 0) {
    const expireDate = `${thisYear}-12-31`;
    const diffDays   = (new Date(expireDate) - new Date(today)) / 86400000;
    const monthsLeft = diffDays / 30.44;
    if (monthsLeft <= 3) {
      expiringInfo = { days: expiringNextYear, expireDate, monthsLeft: Math.ceil(monthsLeft), grantYear: prevYear };
    }
  }

  return {
    totalGranted,
    totalUsed,
    remaining,
    expiringInfo,
    jan1Remaining,
    usedSinceJan1,
    expiringNextYear,
    mustUseByYearEnd: expiringNextYear,
  };
}

// 사용 시 차감할 grant_year 자동 결정 (오래된 것부터, FIFO)
// 유효 범위: grant_year >= 올해-1 (2년 전 이전은 소멸)
function _resolveGrantYear(empNo) {
  const today = jstToday();
  const thisYear = parseInt(today.substring(0, 4));
  const map = _buildGrantMap(empNo);

  const sortedYears = Object.keys(map)
    .map(gy => parseInt(gy))
    .filter(gyNum => gyNum >= thisYear - 1)
    .sort((a, b) => a - b);

  for (const gyNum of sortedYears) {
    const { granted, used } = map[gyNum];
    if (granted - used > 0) return gyNum;
  }
  return thisYear; // fallback
}

// 유급휴가 사용 추가
function addVacationUsage(empNo, date, used, reason) {
  const key = _vacKey(empNo);
  if (!vacationData[key]) vacationData[key] = [];
  const grantYear = _resolveGrantYear(empNo);
  vacationData[key].push({ date, used, reason, grant_year: grantYear });
  _rebuildRemainingForEmp(empNo);
  _vacDirtyVersion++; // GAS 동기화가 로컬 변경분을 덮어쓰는 것 방지
  localStorage.setItem(LS.vacation, JSON.stringify(vacationData));
  if (typeof saveVacationToGas === 'function') saveVacationToGas(vacationData);
}

// 유급휴가 발생 추가 (초기발생·연간발생)
function addVacationGrant(empNo, days, grantYear, reason) {
  const key = _vacKey(empNo);
  if (!vacationData[key]) vacationData[key] = [];
  const today = jstToday();
  vacationData[key].push({ date: today, used: 0, reason, grant_year: grantYear, days });
  _rebuildRemainingForEmp(empNo);
  _vacDirtyVersion++;
  localStorage.setItem(LS.vacation, JSON.stringify(vacationData));
  if (typeof saveVacationToGas === 'function') saveVacationToGas(vacationData);
}

// 사용 기록 삭제 — 삭제 후 remaining 재계산
function deleteVacationUsage(empNo, index) {
  const key = _vacKey(empNo);
  if (!vacationData[key] || vacationData[key][index] === undefined) return;
  vacationData[key].splice(index, 1);
  _rebuildRemainingForEmp(empNo);
  _vacDirtyVersion++;
  localStorage.setItem(LS.vacation, JSON.stringify(vacationData));
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
let _vacListMode = 'month'; // 'month' | 'year'

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
  const opening = drop.style.display === 'none' || drop.style.display === '';
  drop.style.display = opening ? 'block' : 'none';
  if (opening) {
    buildVacationEmpList();
    const inp = document.getElementById('vacEmpSearch');
    if (inp) { inp.value = ''; inp.focus(); }
    filterVacEmpList();
  }
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

  list.innerHTML = '';
  empList.forEach(emp => {
    const no    = String(emp.no).padStart(4, '0');
    const noStr = String(emp.no);
    const chk   = selected.has(no);

    const label = document.createElement('label');
    label.dataset.no = noStr;
    label.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 6px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;user-select:none;';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = no;
    cb.checked = chk;
    cb.style.cssText = 'width:15px;height:15px;flex-shrink:0;cursor:pointer;accent-color:var(--accent);';
    cb.addEventListener('change', updateVacSelSummary);

    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    nameSpan.textContent = (jp && emp.kana) ? `${emp.name}（${emp.kana}）` : emp.name;

    const noSpan = document.createElement('span');
    noSpan.style.cssText = 'color:var(--text3);font-size:12px;font-variant-numeric:tabular-nums;';
    noSpan.textContent = no;

    label.appendChild(cb);
    label.appendChild(nameSpan);
    label.appendChild(noSpan);
    list.appendChild(label);
  });

  updateVacSelSummary();
}

function filterVacEmpList() {
  const q = (document.getElementById('vacEmpSearch')?.value || '').toLowerCase().trim();
  document.querySelectorAll('#vacEmpCheckList label').forEach(label => {
    const no  = label.dataset.no || '';
    const emp = employees.find(e => String(e.no) === no);
    if (!emp) { label.style.display = 'none'; return; }
    const match = !q || emp.name.toLowerCase().includes(q) || String(emp.no).padStart(4, '0').includes(q);
    label.style.display = match ? 'flex' : 'none';
  });
}

function toggleVacHideNotApplied() {
  _vacHideNotApplied = document.getElementById('vacHideNotApplied')?.checked !== false;
  buildVacationEmpList();
}

function toggleVacInclNotApplied() {
  _vacHideNotApplied = !_vacHideNotApplied;
  const btn = document.getElementById('vacInclNotAppliedBtn');
  if (btn) {
    const active = !_vacHideNotApplied;
    btn.style.background  = active ? 'var(--accent2)' : 'transparent';
    btn.style.color       = active ? 'var(--accent)'  : 'var(--text2)';
    btn.style.borderColor = active ? 'var(--accent)'  : 'var(--border)';
  }
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
  _normalizeVacationKeys();
  _migrateVacationRemaining();
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
    const remStyle  = sum.remaining < 0 ? 'color:var(--red)' : sum.remaining <= 5.0 ? 'color:var(--orange,#e67e22)' : '';
    const expClass  = sum.expiringNextYear  > 0   ? 'red' : '';
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
          <span class="vac-card-row-label">${jp ? '今年使用' : '올해 사용'}</span>
          <span class="vac-card-row-val">${sum.usedSinceJan1.toFixed(1)}${unitStr}</span>
        </div>
        <div class="vac-card-row">
          <span class="vac-card-row-label">${jp ? '残年次' : '남은 연차'}</span>
          <span class="vac-card-row-val" style="${remStyle}">${sum.remaining.toFixed(1)}${unitStr}</span>
        </div>
        <div class="vac-card-row">
          <span class="vac-card-row-label">${jp ? `${thisYear + 1}年1月1日消滅予定` : `${thisYear + 1}년 1월 1일 소멸 예정`}</span>
          <span class="vac-card-row-val ${expClass}">${sum.expiringNextYear.toFixed(1)}${unitStr}</span>
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
    const todayStr = jstToday();
    const thisYear = parseInt(todayStr.substring(0, 4));
    const unitStr  = jp ? '日' : '일';
    const remStyle = sum.remaining < 0 ? 'color:var(--red)' : sum.remaining <= 5.0 ? 'color:var(--orange,#e67e22)' : '';
    const expStyle = sum.expiringNextYear >  0   ? 'color:var(--red)' : '';
    const jan1Lbl  = jp ? `${thisYear}年1月1日<br>時点残日数`       : `${thisYear}년 1월 1일<br>기준 잔여`;
    const usedLbl  = jp ? `今年<br>使用`                             : `올해<br>사용`;
    const remLbl   = jp ? `残<br>年次`                              : `남은<br>연차`;
    const expLbl   = jp ? `${thisYear+1}年1月1日<br>消滅予定`       : `${thisYear+1}년 1월 1일<br>소멸 예정`;
    headEl.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:12px;">
        <span style="font-size:15px;font-weight:700;">${emp.name}</span>
        ${emp.kana ? `<span style="font-size:12px;color:var(--text3);font-weight:400;">（${emp.kana}）</span>` : ''}
        <span style="font-size:12px;color:var(--text3);">No.${no}</span>
      </div>
      <div class="vac-detail-stats">
        <div class="vac-detail-stat">
          <div class="vac-detail-stat-label">${jan1Lbl}</div>
          <div class="vac-detail-stat-val">${sum.jan1Remaining.toFixed(1)}<span style="font-size:12px;font-weight:400;">${unitStr}</span></div>
        </div>
        <div class="vac-detail-stat">
          <div class="vac-detail-stat-label">${usedLbl}</div>
          <div class="vac-detail-stat-val">${sum.usedSinceJan1.toFixed(1)}<span style="font-size:12px;font-weight:400;">${unitStr}</span></div>
        </div>
        <div class="vac-detail-stat">
          <div class="vac-detail-stat-label">${remLbl}</div>
          <div class="vac-detail-stat-val" style="${remStyle}">${sum.remaining.toFixed(1)}<span style="font-size:12px;font-weight:400;">${unitStr}</span></div>
        </div>
        <div class="vac-detail-stat">
          <div class="vac-detail-stat-label">${expLbl}</div>
          <div class="vac-detail-stat-val" style="${expStyle}">${sum.expiringNextYear.toFixed(1)}<span style="font-size:12px;font-weight:400;">${unitStr}</span></div>
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
    const dow_idx  = (firstDay + d - 1) % 7;
    const isToday  = dateStr === today;
    let cls = 'vac-cal-day';
    if (dow_idx === 0) cls += ' sun';
    if (dow_idx === 6) cls += ' sat';
    if (info) cls += ' used';
    if (isToday) cls += ' today-mark';
    let spanCls = '';
    if (info) spanCls = info.used < 1 ? 'vac-day-half' : 'vac-day-used';
    const numSpan = spanCls ? `<span class="${spanCls}">${d}</span>` : `<span class="vac-day-num">${d}</span>`;
    const todayBar = isToday ? '<div class="vac-today-bar"></div>' : '';
    // 모든 날짜 클릭 시 해당 날짜로 등록 팝업 열기
    cells += `<div class="${cls}" style="cursor:pointer;" onclick="showVacationModal('${no}','${dateStr}')">${numSpan}${todayBar}</div>`;
  }

  cal.innerHTML = `
    <div style="position:relative;">
      <div class="vac-cal-month-hdr">${year}${jp ? '年' : '년'} ${month}${jp ? '月' : '월'}</div>
      <div id="vac-cal-inline-msg" style="display:none;position:absolute;inset:0;background:var(--orange);color:#fff;padding:9px 14px;border-radius:var(--r);font-size:calc(13px + var(--fs-delta));font-weight:600;box-shadow:var(--sh2);align-items:center;justify-content:center;z-index:5;pointer-events:none;"></div>
    </div>
    <div class="vac-cal-grid">
      ${dow.map((d, i) => `<div class="vac-cal-dow${i===0?' sun':i===6?' sat':''}">${d}</div>`).join('')}
      ${cells}
    </div>
    <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;">
      <button class="btn" style="padding:4px 9px;background:var(--accent2);color:var(--accent);border-color:var(--accent3);" onclick="toggleVacListMode()">${_vacListMode === 'year' ? (jp ? '月間リスト' : '월간 리스트') : (jp ? '年間リスト' : '연간 리스트')}</button>
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
  const records = vacationData[no] || [];

  const _isEmpRole = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'employee';
  const _today = jstToday();
  const _itemHtml = (r, no, jp) => {
    const usedVal  = parseFloat(r.used);
    const badgeCls = usedVal < 1 ? 'half' : 'full';
    const badgeTxt = usedVal < 1 ? (jp ? '半日' : '반차') : (jp ? '1日' : '1일');
    // employee: 오늘 이전(오늘 포함) 날짜는 삭제 버튼 숨김
    const canDel = !_isEmpRole || (r.date && r.date > _today);
    const delBtn = canDel
      ? `<button class="vac-list-del" onclick="event.stopPropagation();deleteVacUsage('${no}',${r._idx})" title="${jp ? '削除' : '삭제'}">✕</button>`
      : '';
    return `<div class="vac-list-item" id="vac-li-${r._idx}" onclick="_highlightVacListItem(${r._idx})">
        <span class="vac-list-date">${_jstDateFmt(r.date)}</span>
        <span class="vac-list-badge ${badgeCls}">${badgeTxt}</span>
        <span class="vac-list-reason">${r.reason || ''}</span>
        ${delBtn}
      </div>`;
  };

  // ─ 연간 모드 ─
  if (_vacListMode === 'year') {
    const yearRecords = records
      .map((r, idx) => ({ ...r, _idx: idx }))
      .filter(r => parseFloat(r.used) > 0 && r.date && r.date.startsWith(`${year}-`))
      .sort((a, b) => a.date.localeCompare(b.date));
    const yearTotal = parseFloat(yearRecords.reduce((s, r) => s + (parseFloat(r.used) || 0), 0).toFixed(1));
    const hdr = `<div class="vac-panel-hdr">${jp ? `${year}年 年間履歴` : `${year}년 연간 내역`}<span style="margin-left:8px;background:#dbeafe;color:#1e40af;border-radius:6px;padding:2px 10px;font-size:12px;font-weight:600;">${jp ? `合計 ${yearTotal}日` : `합계 ${yearTotal}일`}</span></div>`;
    if (!yearRecords.length) {
      panel.innerHTML = hdr + `<div style="padding:30px 10px;text-align:center;color:var(--text3);font-size:13px;">${jp ? '取得記録なし' : '사용 기록 없음'}</div>`;
      return;
    }
    panel.innerHTML = hdr + yearRecords.map(r => _itemHtml(r, no, jp)).join('');
    return;
  }

  // ─ 월간 모드 ─
  const monthStr = `${year}-${String(month).padStart(2,'0')}`;
  const monthRecords = records
    .map((r, idx) => ({ ...r, _idx: idx }))
    .filter(r => r.used > 0 && r.date && r.date.startsWith(monthStr))
    .sort((a, b) => a.date.localeCompare(b.date));

  const monthTotal = parseFloat(monthRecords.reduce((s, r) => s + (parseFloat(r.used) || 0), 0).toFixed(1));
  const hdr = `<div class="vac-panel-hdr">${jp ? '使用履歴' : '사용 내역'}<span style="margin-left:8px;background:#dbeafe;color:#1e40af;border-radius:6px;padding:2px 10px;font-size:12px;font-weight:600;">${jp ? `合計 ${monthTotal}日` : `합계 ${monthTotal}일`}</span></div>`;

  if (!monthRecords.length) {
    panel.innerHTML = hdr + `<div style="padding:30px 10px;text-align:center;color:var(--text3);font-size:13px;">${jp ? '取得記録なし' : '사용 기록 없음'}</div>`;
    return;
  }

  panel.innerHTML = hdr + monthRecords.map(r => _itemHtml(r, no, jp)).join('');
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
  const records = vacationData[_vacDetailEmpNo] || [];
  const usedMonths = new Set(
    records
      .filter(r => r.date && r.date.startsWith(`${year}-`) && parseFloat(r.used) > 0)
      .map(r => parseInt(r.date.substring(5, 7)))
  );
  const monthTabs = Array.from({length:12},(_,i)=>{
    const m = i+1;
    const isActive = m === month;
    const hasUsage = usedMonths.has(m);
    const style = !isActive && hasUsage ? ' style="background:#bfdbfe;color:#1e40af;"' : '';
    return `<button class="month-tab${isActive?' active':''}"${style} onclick="vacSetMonth(${m})">${m}${u}</button>`;
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
  if (prevYear <= 2023) {
    const jp = LANG === 'JP';
    const msg = jp ? `${prevYear}年のデータは存在しません` : `${prevYear}년은 데이터가 존재하지 않습니다`;
    if (btn) showAnchorToast(btn, msg, 3000);
    return;
  }
  _vacDetailYear = prevYear; _vacDetailMonth = 12; _renderVacNavBar(); _renderVacCalendar(); _renderVacList();
}
function vacYearNext(btn) { _vacDetailYear++; _vacDetailMonth = 1;  _renderVacNavBar(); _renderVacCalendar(); _renderVacList(); }
function toggleVacListMode() {
  _vacListMode = _vacListMode === 'year' ? 'month' : 'year';
  _renderVacCalendar();
  _renderVacList();
}
function vacSetMonth(m) {
  if (_vacListMode === 'year') _vacListMode = 'month';
  _vacDetailMonth = m;
  _renderVacNavBar(); _renderVacCalendar(); _renderVacList();
}
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

  // employee: 오늘 이전(오늘 포함) 날짜는 삭제 불가 (이중 검증)
  const isEmployee = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'employee';
  if (isEmployee && r && r.date <= jstToday()) {
    showToast(jp ? '過去の有給取得記録は削除できません' : '오늘 이전의 휴가는 삭제할 수 없습니다', 'w');
    return;
  }

  const msg = jp
    ? `${dStr} の有給取得記録を削除しますか？`
    : `${dStr} 의 유급휴가 사용 기록을 삭제하시겠습니까?`;
  if (!confirm(msg)) return;

  // employee: saveVacation은 admin-only이므로 deleteVacationEntry 직접 호출
  if (isEmployee && r && gasUrl && typeof _writeToken !== 'undefined' && _writeToken) {
    fetch(gasUrl, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        type: 'deleteVacationEntry', emp_no: empNo,
        date: r.date, reason: r.reason || '',
        _uid: currentUser.id, _token: _writeToken
      })
    }).catch(e => console.warn('[vac] deleteVacationEntry error:', e));
  }

  deleteVacationUsage(empNo, idx);
  renderVacationDetail();
}

function _showVacCalMsg(msg) {
  const el = document.getElementById('vac-cal-inline-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'flex';
  clearTimeout(_showVacCalMsg._t);
  _showVacCalMsg._t = setTimeout(() => { el.style.display = 'none'; }, 2500);
}

function showVacationModal(empNo, prefillDate) {
  _vacModalEmpNo = empNo;
  const jp  = LANG === 'JP';
  const today = jstToday();
  const key = _vacKey(empNo);
  const dateEl = document.getElementById('vac-modal-date');
  const isEmployee = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'employee';

  // employee: date picker min을 오늘로 설정
  if (dateEl) {
    if (isEmployee) dateEl.min = today;
    else dateEl.removeAttribute('min');
  }

  if (prefillDate) {
    // employee: 과거 날짜 클릭 시 모달 열지 않고 달력 상단 인라인 메시지
    if (isEmployee && prefillDate < today) {
      _showVacCalMsg(jp ? '過去の日付は登録できません' : '오늘 이전 날짜는 등록할 수 없습니다');
      return;
    }
    // 캘린더 날짜 클릭: 이미 등록된 날짜면 모달 열지 않고 toast
    const dup = (vacationData[key] || []).find(r => r.used > 0 && r.date === prefillDate);
    if (dup) {
      showToast(jp ? '既に登録済みの日付です' : '이미 등록된 날짜입니다', 'w');
      return;
    }
    if (dateEl) dateEl.value = prefillDate;
  } else {
    if (dateEl) dateEl.value = today;
  }

  const r1 = document.getElementById('vac-modal-r1');
  if (r1) r1.checked = true;
  const reasonEl = document.getElementById('vac-modal-reason');
  if (reasonEl) reasonEl.value = '';
  openModal('modal-vacation');
  setTimeout(() => { if (reasonEl) reasonEl.focus(); }, 50);
}

function closeVacationModal() { closeModal('modal-vacation'); }

function saveVacationUsage() {
  const jp   = LANG === 'JP';
  const date = document.getElementById('vac-modal-date')?.value || '';
  if (!date) { showToast(jp ? '日付を入力してください' : '날짜를 입력해 주세요', 'e'); return; }

  const isEmployee = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'employee';
  // employee: 오늘 이전 날짜 등록 차단 (이중 검증)
  if (isEmployee && date < jstToday()) {
    showToast(jp ? '過去の日付は登録できません' : '오늘 이전 날짜는 등록할 수 없습니다', 'e');
    return;
  }

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

  // employee: GAS addVacationEntry 직접 호출 (saveVacation은 admin-only)
  const grantYear = isEmployee ? _resolveGrantYear(_vacModalEmpNo) : null;
  addVacationUsage(_vacModalEmpNo, date, used, reason);
  if (isEmployee && grantYear !== null && gasUrl && typeof _writeToken !== 'undefined' && _writeToken) {
    fetch(gasUrl, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        type: 'addVacationEntry', emp_no: _vacModalEmpNo,
        date, used, reason, grant_year: grantYear,
        _uid: currentUser.id, _token: _writeToken
      })
    }).catch(e => console.warn('[vac] addVacationEntry error:', e));
  }
  console.log('[vac] saved', _vacModalEmpNo, date, used,
    '→ records:', (vacationData[key] || []).length,
    'summary:', calcVacationSummary(_vacModalEmpNo));

  // 모달 닫기 전에 empNo·탭 상태를 캡처해 rAF 시점 변경 방지
  const savedEmpNo   = _vacModalEmpNo;
  const savedTab     = _vacTab;
  const savedDetailNo = _vacDetailEmpNo;

  closeVacationModal();
  showToast(jp ? '有給取得を記録しました' : '유급휴가 사용을 기록했습니다', 's');

  // 렌더링은 모달 닫기 애니메이션 후 실행해 DOM 상태 충돌 방지
  requestAnimationFrame(() => {
    console.log('[vac] render start — tab:', savedTab, 'detail:', savedDetailNo, 'emp:', savedEmpNo);
    if (savedTab === 'detail' && savedDetailNo === savedEmpNo) renderVacationDetail();
    renderVacationCards();
    console.log('[vac] render done — summary:', calcVacationSummary(savedEmpNo));
  });
}

document.addEventListener('click', e => {
  const wrap = document.getElementById('vacEmpDropWrap');
  if (wrap && !wrap.contains(e.target)) closeVacEmpDrop();
});
