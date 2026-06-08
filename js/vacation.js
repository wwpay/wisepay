// 수정: 2026-06-08 09:35 — 유급휴가 관리 기능 신규 생성 (vacation.js)
'use strict';

// 입사월 → 초기 발생일수
function calcInitialDays(joinMonth) {
  if (joinMonth >= 1 && joinMonth <= 9) {
    return 15 - (joinMonth - 1);
  }
  return 1; // 10~12월 입사
}

// grant_year별 부여/사용 집계 맵 생성
function _buildGrantMap(empNo) {
  const records = vacationData[String(empNo)] || [];
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

  return {
    totalGranted,
    totalUsed,
    remaining: parseFloat(remaining.toFixed(1)),
    expiringInfo
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
  const key = String(empNo);
  if (!vacationData[key]) vacationData[key] = [];

  const grantYear = _resolveGrantYear(empNo);
  vacationData[key].push({ date, used, reason, grant_year: grantYear });

  localStorage.setItem('kyuyo_vacation', JSON.stringify(vacationData));
  if (typeof saveVacationToGas === 'function') saveVacationToGas(vacationData);
}

// 유급휴가 발생 추가 (초기발생·연간발생)
function addVacationGrant(empNo, days, grantYear, reason) {
  const key = String(empNo);
  if (!vacationData[key]) vacationData[key] = [];

  const today = jstToday();
  vacationData[key].push({ date: today, used: 0, reason, grant_year: grantYear, days });

  localStorage.setItem('kyuyo_vacation', JSON.stringify(vacationData));
  if (typeof saveVacationToGas === 'function') saveVacationToGas(vacationData);
}

// 사용 기록 삭제 (index: vacationData[empNo] 배열 인덱스)
function deleteVacationUsage(empNo, index) {
  const key = String(empNo);
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
