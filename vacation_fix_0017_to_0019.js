// =====================================================================
// vacation_fix_0017_to_0019.js
// 박수완 emp_no: '0017' → '0019' 수정
// WisePay 페이지 Console에 붙여넣고 실행 (F12 → Console)
// =====================================================================
(function () {
  'use strict';

  const OLD_NO = '0017';
  const NEW_NO = '0019';

  // ── 박수완 전체 데이터 (0019로 확정) ──────────────────────────────
  const park_0019 = [
    // 발생 기록
    { date: '2025-02-10', used: 0,   reason: '초기발생', grant_year: 2025, days: 14 },
    { date: '2026-01-01', used: 0,   reason: '연간발생', grant_year: 2026, days: 15 },
    { date: '2027-01-01', used: 0,   reason: '연간발생', grant_year: 2027, days: 15 },
    // 사용 기록 (2025 grant 14일 소진)
    { date: '2025-02-21', used: 1.0, reason: '이사',     grant_year: 2025 },
    { date: '2025-05-07', used: 1.0, reason: 'GW연차',   grant_year: 2025 },
    { date: '2025-05-08', used: 1.0, reason: 'GW연차',   grant_year: 2025 },
    { date: '2025-05-09', used: 1.0, reason: 'GW연차',   grant_year: 2025 },
    { date: '2025-09-16', used: 1.0, reason: '유급',     grant_year: 2025 },
    { date: '2025-10-16', used: 1.0, reason: '휴가',     grant_year: 2025 },
    { date: '2025-10-17', used: 1.0, reason: '휴가',     grant_year: 2025 },
    { date: '2025-10-20', used: 1.0, reason: '휴가',     grant_year: 2025 },
    { date: '2025-12-29', used: 1.0, reason: '연말연시', grant_year: 2025 },
    { date: '2025-12-30', used: 1.0, reason: '연말연시', grant_year: 2025 },
    { date: '2025-12-31', used: 1.0, reason: '연말연시', grant_year: 2025 },
    { date: '2026-01-02', used: 1.0, reason: '연말연시', grant_year: 2025 },
    { date: '2026-01-15', used: 1.0, reason: '개인휴무', grant_year: 2025 },
    { date: '2026-01-16', used: 1.0, reason: '개인휴무', grant_year: 2025 },
    // 사용 기록 (2026 grant 11일 사용 중)
    { date: '2026-02-16', used: 1.0, reason: '개인휴무', grant_year: 2026 },
    { date: '2026-05-07', used: 1.0, reason: 'GW',       grant_year: 2026 },
    { date: '2026-05-08', used: 1.0, reason: 'GW',       grant_year: 2026 },
    { date: '2026-06-03', used: 1.0, reason: '태풍',     grant_year: 2026 },
    { date: '2026-06-05', used: 1.0, reason: '개인휴무', grant_year: 2026 },
    { date: '2026-09-24', used: 1.0, reason: '추석',     grant_year: 2026 },
    { date: '2026-09-25', used: 1.0, reason: '추석',     grant_year: 2026 },
    { date: '2026-12-28', used: 1.0, reason: '연말연시', grant_year: 2026 },
    { date: '2026-12-29', used: 1.0, reason: '연말연시', grant_year: 2026 },
    { date: '2026-12-30', used: 1.0, reason: '연말연시', grant_year: 2026 },
    { date: '2026-12-31', used: 1.0, reason: '연말연시', grant_year: 2026 },
  ];

  // ── 1. '0017' 키 제거 ────────────────────────────────────────────
  if (vacationData[OLD_NO]) {
    console.log(`ℹ️  기존 '${OLD_NO}' 데이터 ${vacationData[OLD_NO].length}건 제거`);
    delete vacationData[OLD_NO];
  } else {
    console.log(`ℹ️  '${OLD_NO}' 키가 없습니다 (이미 정리됐거나 미입력)`);
  }

  // ── 2. '0019'로 덮어쓰기 ────────────────────────────────────────
  vacationData[NEW_NO] = park_0019;
  console.log(`✅ '${NEW_NO}' 데이터 ${park_0019.length}건 설정 완료`);

  // ── 3. localStorage 저장 ────────────────────────────────────────
  const LS_KEY = (typeof LS !== 'undefined' && LS.vacation) ? LS.vacation : 'kyuyo_vacation';
  localStorage.setItem(LS_KEY, JSON.stringify(vacationData));
  console.log(`✅ localStorage['${LS_KEY}'] 갱신 완료`);

  // ── 4. GAS 저장 (시트 전체 덮어쓰기 → 0017 행 자동 삭제) ────────
  if (typeof saveVacationToGas === 'function') {
    saveVacationToGas(vacationData);
    console.log('✅ GAS saveVacationToGas 호출 완료 (시트 전체 재기록)');
  } else {
    console.warn('⚠️ saveVacationToGas 함수 없음 — localStorage만 저장됨');
  }

  // ── 5. 잔여일수 확인 로그 ─────────────────────────────────────
  if (typeof calcVacationSummary === 'function') {
    [NEW_NO, '0002'].forEach(no => {
      const s = calcVacationSummary(no);
      console.log(`[${no}] 부여:${s.totalGranted} 사용:${s.totalUsed} 잔여:${s.remaining}${s.expiringInfo ? ' ⚠️ ' + s.expiringInfo.days + '일 소멸예정' : ''}`);
    });
  }

  // ── 6. 화면 갱신 ─────────────────────────────────────────────
  if (typeof renderVacationPage === 'function') renderVacationPage();
  if (typeof showToast === 'function') showToast('박수완 사원번호 0017→0019 수정 완료', 's');

  console.log('🎉 수정 완료: 0017 삭제 / 0019 저장 / GAS 반영');
})();
