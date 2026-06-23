// 수정: 2026-06-23 17:20 — 오늘 날짜 표시: 앰버 라운딩 사각 + 오늘/今日 레이블 (기존 밑줄 제거)
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
// ─ 발생분(초기발생·연간발생)과 사용분을 날짜순 FIFO로 시뮬레이션해 잔여·소멸예정 산출
// ─ 규칙(oldest-first): 사용은 그 시점에 살아있는(발생됨 & 미소멸) 가장 오래된 발생분부터 차감
// ─ 발생분 소멸일 = grant_year+2년의 1/1 (예: 2024 발생분 → 2026-01-01 00:00 소멸)
// ─ grant_year는 발생행에서만 읽음(소멸연도 산출용). 사용행 grant_year는 계산에 미사용.
function calcVacationSummary(empNo) {
  const today    = jstToday();
  const thisYear = parseInt(today.substring(0, 4));
  const prevYear = thisYear - 1;
  const jan1Str  = `${thisYear}-01-01`;
  const prevYearEnd = `${prevYear}-12-31`;
  const yearEnd     = `${thisYear}-12-31`;

  const key     = _vacKey(empNo);
  const records = vacationData[key] || [];

  // 발생분: 발생행(used=0, days>0) — 발생일(issue) + 소멸일(expire = grant_year+2의 1/1)
  const grants = [];
  records.forEach(r => {
    const used = parseFloat(r.used) || 0;
    const days = parseFloat(r.days) || 0;
    const gy   = parseInt(r.grant_year);
    if (used === 0 && days > 0 && !isNaN(gy) && r.date) {
      grants.push({ gy, days, issue: r.date, expire: `${gy + 2}-01-01` });
    }
  });
  // 사용분: 사용행(used>0) — 날짜 오름차순
  const usages = records
    .filter(r => (parseFloat(r.used) || 0) > 0 && r.date)
    .map(r => ({ date: r.date, used: parseFloat(r.used) || 0 }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // 날짜순 FIFO 시뮬레이션
  //   grantCutoff: 이 날짜까지 발생한 발생분만 풀에 포함 (미래 발생분 제외)
  //   usageCutoff: 이 날짜까지의 사용만 차감 (미래 예정 사용 제외)
  //   각 사용은 그 사용일에 유효한(발생됨 & 미소멸) 최古 발생분부터 차감
  function _simulate(grantCutoff, usageCutoff) {
    const pool = grants
      .filter(g => g.issue <= grantCutoff)
      .map(g => ({ gy: g.gy, issue: g.issue, expire: g.expire, rem: g.days }))
      .sort((a, b) => a.gy - b.gy);
    let over = 0;
    usages.forEach(u => {
      if (u.date > usageCutoff) return;
      let need = u.used;
      for (const p of pool) {
        if (need <= 0) break;
        if (p.rem <= 0) continue;
        if (u.date < p.issue) continue;   // 아직 발생 전
        if (u.date >= p.expire) continue; // 이미 소멸
        const take = Math.min(need, p.rem);
        p.rem -= take;
        need  -= take;
      }
      if (need > 0) over += need;          // 어느 발생분으로도 못 막음(권한 초과)
    });
    return { pool, over };
  }

  // asOf 시점 잔여 = 미소멸 발생분 잔여 합 - 초과사용량(음수 허용)
  function _remainingAt(grantCutoff, usageCutoff, expiryAsOf) {
    const { pool, over } = _simulate(grantCutoff, usageCutoff);
    let s = 0;
    pool.forEach(p => { if (expiryAsOf < p.expire) s += p.rem; });
    return parseFloat((s - over).toFixed(1));
  }

  // 올해 1/1 00:00 기준 잔여 (참고용): 올해 발생분까지 포함, 사용은 작년말까지, 소멸 판정 1/1 기준
  const jan1Remaining = _remainingAt(jan1Str, prevYearEnd, jan1Str);

  // 총 유급 = 올해 사용 빼기 전 잔여 (기존자=1/1잔여값, 중도입사자=초기발생). 모든 사원 통일.
  const startBalance = _remainingAt(today, prevYearEnd, today);

  // 현재 잔여(남은 연차): 오늘까지 발생, 미래 예정 사용은 올해(12/31)까지만 반영(내년분 제외), 소멸 판정 오늘 기준
  const remaining = _remainingAt(today, yearEnd, today);

  // 사용 완료 = 올해 1/1 ~ 오늘(오늘 포함)
  let usedDone = 0;
  usages.forEach(u => { if (u.date >= jan1Str && u.date <= today) usedDone += u.used; });
  usedDone = parseFloat(usedDone.toFixed(1));

  // 사용 예정 = 내일 ~ 올해 12/31 (오늘 미포함)
  let futureUsed = 0;
  usages.forEach(u => { if (u.date > today && u.date <= yearEnd) futureUsed += u.used; });
  futureUsed = parseFloat(futureUsed.toFixed(1));

  // (호환) 올해 사용 합계 = 사용 완료 + 사용 예정
  const usedSinceJan1 = parseFloat((usedDone + futureUsed).toFixed(1));

  // 내년 1/1 소멸 예정 = 작년(prevYear) 발생분의 잔여 (미래 예정 사용은 올해 12/31까지만 반영)
  const { pool: poolNow } = _simulate(today, yearEnd);
  let expiringNextYear = 0;
  poolNow.forEach(p => { if (p.gy === prevYear && today < p.expire) expiringNextYear += p.rem; });
  expiringNextYear = parseFloat(Math.max(0, expiringNextYear).toFixed(1));

  // 전체 이력
  let totalGranted = 0, totalUsed = 0;
  records.forEach(r => {
    const u = parseFloat(r.used) || 0;
    const d = parseFloat(r.days) || 0;
    if (u === 0 && d > 0) totalGranted += d;
    else if (u > 0) totalUsed += u;
  });
  totalGranted = parseFloat(totalGranted.toFixed(1));
  totalUsed    = parseFloat(totalUsed.toFixed(1));

  // 3개월 이내 소멸 예정 알림
  let expiringInfo = null;
  if (expiringNextYear > 0) {
    const expireDate = `${thisYear + 1}-01-01`;
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
    startBalance,   // 총 유급 (올해 사용 빼기 전 잔여)
    usedDone,       // 사용 완료 (1/1~오늘)
    futureUsed,     // 사용 예정 (내일~12/31)
    usedSinceJan1,  // 올해 사용 합계 (= usedDone + futureUsed)
    expiringNextYear,
    mustUseByYearEnd: expiringNextYear,
  };
}

// 유급휴가 요약을 "총유급 − 사용완료 − 사용예정 = 남은연차 │ 소멸예정" 수식형 HTML로 생성 (PC·모바일 공용)
// 인라인 스타일 사용 — 외부 CSS 로딩과 무관하게 동작
function _vacEqHtml(sum, jp) {
  const unit = jp ? '日' : '일';
  const f = v => (v || 0).toFixed(1);
  const remColor = sum.remaining < 0 ? 'var(--red)' : sum.remaining <= 5.0 ? 'var(--orange,#e67e22)' : '';
  const expColor = sum.expiringNextYear > 0 ? 'var(--red)' : '';
  const L = jp
    ? { tot: '総有給', done: '使用済', plan: '使用予定', rem: '残年次', exp: '消滅予定' }
    : { tot: '총 유급', done: '사용 완료', plan: '사용 예정', rem: '남은 연차', exp: '소멸 예정' };
  const wrapS = 'display:flex;align-items:flex-start;justify-content:space-between;gap:2px;';
  const itemS = 'display:flex;flex-direction:column;align-items:center;flex:1 1 0;min-width:0;text-align:center;';
  const valS  = 'font-size:16px;font-weight:700;line-height:1.15;white-space:nowrap;';
  const lblS  = 'font-size:9px;color:var(--text3);line-height:1.2;margin-top:3px;';
  const opS   = 'font-size:20px;color:var(--text2);font-weight:700;line-height:1;padding-top:1px;flex:0 0 auto;';
  const sepS  = 'width:1px;background:var(--border);align-self:stretch;margin:1px 4px;flex:0 0 auto;';
  const item  = (val, lbl, color) =>
    `<div style="${itemS}"><div style="${valS}${color ? `color:${color};` : ''}">${val}${unit}</div><div style="${lblS}">${lbl}</div></div>`;
  return `<div style="${wrapS}">`
    + item(f(sum.startBalance), L.tot, '')
    + `<div style="${opS}">−</div>`
    + item(f(sum.usedDone), L.done, '')
    + `<div style="${opS}">−</div>`
    + item(f(sum.futureUsed), L.plan, '')
    + `<div style="${opS}">=</div>`
    + item(f(sum.remaining), L.rem, remColor)
    + `<div style="${sepS}"></div>`
    + item(f(sum.expiringNextYear), L.exp, expColor)
    + `</div>`;
}

// 유급휴가 요약을 세로 나열형 HTML로 생성 (카드용, PC·모바일 공용). 소멸 예정은 연한 배경으로 구분.
function _vacRowsHtml(sum, jp) {
  const unit = jp ? '日' : '일';
  const f = v => (v || 0).toFixed(1);
  const remColor = sum.remaining < 0 ? 'color:var(--red);' : sum.remaining <= 5.0 ? 'color:var(--orange,#d97706);' : '';
  const expColor = sum.expiringNextYear > 0 ? 'color:var(--red);' : '';
  const L = jp
    ? { tot: '総有給', done: '使用済', plan: '使用予定', rem: '残年次', exp: '消滅予定' }
    : { tot: '총 유급', done: '사용 완료', plan: '사용 예정', rem: '남은 연차', exp: '소멸 예정' };
  const lblS = 'font-size:12px;color:var(--text2);';
  const valS = 'font-size:15px;font-weight:700;';
  const row = (lbl, val, valC, rowExtra) =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 2px;border-bottom:1px solid var(--border2);${rowExtra || ''}">`
    + `<span style="${lblS}">${lbl}</span><span style="${valS}${valC || ''}">${val}${unit}</span></div>`;
  return row(L.tot, f(sum.startBalance), '', '')
    + row(L.done, f(sum.usedDone), '', '')
    + row(L.plan, f(sum.futureUsed), '', '')
    + row(L.rem, f(sum.remaining), remColor, 'border-bottom:none;')
    + row(L.exp, f(sum.expiringNextYear), expColor, 'border-bottom:none;margin-top:6px;background:var(--surface2,#f6f7f9);border-radius:8px;padding:7px 9px;');
}

// 정보 팝업 (확인 버튼 1개 + "오늘 하루 보지 않기" 체크). type별로 오늘 하루 표시 억제. (PC·모바일 공용)
function _vacInfoPopup(type, msgKo, msgJp) {
  const jp = (typeof LANG !== 'undefined' && LANG === 'JP');
  const todayStr = jstToday();
  const key = `vacInfoSuppress_${type}`;
  try { if (localStorage.getItem(key) === todayStr) return; } catch (e) {}
  if (document.getElementById('vacInfoPopupOv')) return; // 중복 표시 방지
  const msg = jp ? msgJp : msgKo;
  const ov = document.createElement('div');
  ov.id = 'vacInfoPopupOv';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;';
  ov.innerHTML =
    `<div style="background:var(--card,#fff);border-radius:14px;padding:20px 20px 16px;max-width:340px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.25);">`
    + `<div style="font-size:14px;line-height:1.65;color:var(--text1,#222);white-space:pre-line;">${msg}</div>`
    + `<label style="display:flex;align-items:center;gap:7px;margin-top:16px;font-size:12px;color:var(--text3);cursor:pointer;user-select:none;">`
    +   `<input type="checkbox" id="vacInfoSuppressChk" style="width:15px;height:15px;"> ${jp ? '今日は表示しない' : '오늘 하루 보지 않기'}`
    + `</label>`
    + `<div style="text-align:right;margin-top:14px;">`
    +   `<button id="vacInfoOkBtn" style="padding:8px 22px;border:none;border-radius:8px;background:var(--accent,#2563eb);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">${jp ? '確認' : '확인'}</button>`
    + `</div></div>`;
  document.body.appendChild(ov);
  const close = () => {
    try { if (ov.querySelector('#vacInfoSuppressChk').checked) localStorage.setItem(key, todayStr); } catch (e) {}
    ov.remove();
  };
  ov.querySelector('#vacInfoOkBtn').onclick = close;
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
}

// 유급휴가 등록 후 안내 팝업 트리거 — 내년분(모두) / 미래 삭제불가(사원만)
function _vacRegisterNotice(date, isEmployee) {
  if (!date) return;
  const todayStr = jstToday();
  const thisYr = parseInt(todayStr.substring(0, 4));
  const dYr = parseInt(date.substring(0, 4));
  if (dYr > thisYr) {
    _vacInfoPopup('nextYear',
      "이 휴가는 내년분이라\n올해 '남은 연차'에는 반영되지 않습니다.",
      'この休暇は翌年分のため、\n今年の「残年次」には反映されません。');
  } else if (date > todayStr && isEmployee) {
    _vacInfoPopup('futureDel',
      '미래 날짜의 휴가는\n해당 날짜가 지나면 삭제할 수 없습니다.',
      '未来の日付の休暇は、\nその日付を過ぎると削除できません。');
  }
}

// 사용 시 차감할 grant_year 자동 결정 (현재 유효 발생분 중 오래된 것부터, FIFO)
// 유효 범위: grant_year >= 올해-1 (발생연도+2 = 소멸연도이므로 2년 전 이전은 소멸)
// (deprecated·미사용) FIFO 시뮬레이션 전환으로 사용행 grant_year 태깅 불필요 — 호출처 없음
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
  // 사용행 grant_year는 계산에 미사용 → 빈값 (발생연도는 FIFO가 발생행으로 직접 산출)
  vacationData[key].push({ date, used, reason, grant_year: '' });
  _rebuildRemainingForEmp(empNo);
  _vacDirtyVersion++; // GAS 동기화가 로컬 변경분을 덮어쓰는 것 방지
  localStorage.setItem(LS.vacation, JSON.stringify(vacationData));
  if (typeof saveVacationToGas === 'function') saveVacationToGas(vacationData);
}

// 유급휴가 발생 추가 (초기발생·연간발생)
// saveVacationToGas(전체 시트 덮어쓰기) 대신 appendRow 방식 핸들러만 사용 — 기존 데이터 보호
// date: 발생 기준일 (초기발생=입사일, 연간발생=해당 1/1) — 생략 시 오늘
function addVacationGrant(empNo, days, grantYear, reason, date) {
  const key = _vacKey(empNo);
  if (!vacationData[key]) vacationData[key] = [];
  const grantDate = date || jstToday();
  vacationData[key].push({ date: grantDate, used: 0, reason, grant_year: grantYear, days });
  _rebuildRemainingForEmp(empNo);
  _vacDirtyVersion++;
  localStorage.setItem(LS.vacation, JSON.stringify(vacationData));
  if (typeof gasUrl !== 'undefined' && gasUrl &&
      typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin' &&
      typeof _writeToken !== 'undefined' && _writeToken) {
    fetch(gasUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        type: 'addVacationGrantEntry',
        emp_no: String(empNo).padStart(4, '0'),
        days, grant_year: grantYear, reason, date: grantDate,
        _uid: currentUser.id, _token: _writeToken
      })
    }).then(r => r.json()).then(result => {
      if (!result.ok) console.warn('[vac] addVacationGrantEntry failed:', result.error);
    }).catch(e => console.warn('[vac] addVacationGrantEntry error:', e));
  }
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
// ─ 초기발생 date = 입사일 (emp.join)
// ─ 입사 다음 해 ~ 올해 사이의 지나간 1월 1일마다 연간발생 자동 추가
function initEmployeeVacation(emp) {
  if (!emp || !emp.join) return;
  const joinMonth = parseInt(emp.join.substring(5, 7));
  if (isNaN(joinMonth)) return;

  const joinYear = parseInt(emp.join.substring(0, 4));
  const days = calcInitialDays(joinMonth);
  const empNo = String(emp.no).padStart(4, '0');

  addVacationGrant(empNo, days, joinYear, '초기발생', emp.join);

  const today = jstToday();
  const thisYear = parseInt(today.substring(0, 4));
  for (let y = joinYear + 1; y <= thisYear; y++) {
    const jan1 = `${y}-01-01`;
    if (jan1 <= today) addVacationGrant(empNo, 15, y, '연간발생', jan1);
  }
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
        ${_vacRowsHtml(sum, jp)}
        <div class="vac-card-foot" style="margin-top:12px;">
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
      <div style="margin-bottom:10px;padding-bottom:12px;border-bottom:1px solid var(--border);">${_vacEqHtml(sum, jp)}</div>
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

  const holidays = JSON.parse(localStorage.getItem('holidayCache') || '[]');
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
    const isFuture = dateStr > today;
    let cls = 'vac-cal-day';
    if (dow_idx === 0) cls += ' sun';
    if (dow_idx === 6) cls += ' sat';
    if (holidays.includes(dateStr)) cls += ' holiday';
    if (info) cls += ' used';
    if (isToday) cls += ' today-mark';
    let spanCls = '';
    if (info) spanCls = (info.used < 1 ? 'vac-day-half' : 'vac-day-used') + (isFuture ? ' future' : '');
    const numSpan = spanCls ? `<span class="${spanCls}">${d}</span>` : `<span class="vac-day-num">${d}</span>`;
    const todayLbl = isToday ? `<span class="vac-today-lbl">${jp ? '今日' : '오늘'}</span>` : '';
    // 모든 날짜 클릭 시 해당 날짜로 등록 팝업 열기
    cells += `<div class="${cls}" style="cursor:pointer;" onclick="showVacationModal('${no}','${dateStr}')">${todayLbl}${numSpan}</div>`;
  }

  cal.innerHTML = `
    <div style="position:relative;">
      <div class="vac-cal-month-hdr">${year}${jp ? '年' : '년'} ${month}${jp ? '月' : '월'}</div>
      <div id="vac-cal-inline-msg" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:fit-content;white-space:nowrap;background:var(--orange);color:#fff;padding:9px 14px;border-radius:var(--r);font-size:calc(13px + var(--fs-delta));font-weight:600;box-shadow:var(--sh2);z-index:5;pointer-events:none;"></div>
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
    const futureCls = (r.date && r.date > _today) ? ' future' : '';
    return `<div class="vac-list-item${futureCls}" id="vac-li-${r._idx}" onclick="_highlightVacListItem(${r._idx})">
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
  const _todayStr = jstToday();
  const usedMonths = new Set();
  const pastMonths = new Set(); // 오늘까지 사용이 있는 달(과거/오늘 포함)
  records.forEach(r => {
    if (!r.date || !r.date.startsWith(`${year}-`) || !(parseFloat(r.used) > 0)) return;
    const mm = parseInt(r.date.substring(5, 7));
    usedMonths.add(mm);
    if (r.date <= _todayStr) pastMonths.add(mm);
  });
  const monthTabs = Array.from({length:12},(_,i)=>{
    const m = i+1;
    const isActive = m === month;
    const hasUsage = usedMonths.has(m);
    const isFutureMon = hasUsage && !pastMonths.has(m); // 그 달 사용이 전부 미래
    let style = '';
    if (!isActive && hasUsage) {
      style = isFutureMon
        ? ' style="background:#ddd6fe;color:#5b21b6;"'   // 미래(연보라)
        : ' style="background:#bfdbfe;color:#1e40af;"';  // 과거(파랑)
    }
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

async function deleteVacUsage(empNo, idx) {
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

  // employee: GAS 응답 확인 후 로컬 삭제 (no-cors → cors, 낙관적 갱신 금지)
  if (isEmployee && r && gasUrl && typeof _writeToken !== 'undefined' && _writeToken) {
    try {
      const resp = await fetch(gasUrl, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          type: 'deleteVacationEntry', emp_no: empNo,
          date: r.date, reason: r.reason || '',
          _uid: currentUser.id, _token: _writeToken
        })
      });
      const result = await resp.json();
      if (!result.ok) {
        showToast(result.error || (jp ? '削除に失敗しました' : '삭제에 실패했습니다'), 'e');
        return;
      }
    } catch(e) {
      showToast(jp ? 'サーバーエラーが発生しました' : '서버 오류가 발생했습니다', 'e');
      console.warn('[vac] deleteVacationEntry error:', e);
      return;
    }
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
    // 캘린더 날짜 클릭: 이미 등록된 날짜면 모달 열지 않고 인라인 메시지
    const dup = (vacationData[key] || []).find(r => r.used > 0 && r.date === prefillDate);
    if (dup) {
      _showVacCalMsg(jp ? '既に登録済みの日付です' : '이미 등록된 날짜입니다');
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
  const grantYear = isEmployee ? '' : null; // 사용행 grant_year 미사용 → 빈값
  addVacationUsage(_vacModalEmpNo, date, used, reason);
  _vacRegisterNotice(date, isEmployee); // 내년분/미래삭제불가 안내 팝업
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
