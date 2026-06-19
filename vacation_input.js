// =====================================================================
// vacation_input.js
// WisePay 브라우저 콘솔에서 그대로 붙여넣고 실행하세요.
// (WisePay 페이지가 열린 상태에서 F12 → Console → 붙여넣기 → Enter)
// =====================================================================
(function () {
  'use strict';

  // ── 입력 데이터 ──────────────────────────────────────────────────────

  const newData = {

    // 박수완 emp_no: '0017'
    // 2025 부여 14일 → entries 1-14 (14.0일), 2026 부여 15일 → entries 15-25 (11.0일)
    // 잔여: 2025:0, 2026:4, 2027:15 → 합계 19.0일
    '0017': [
      // ── 발생 기록 ──
      { date: '2025-02-10', used: 0,   reason: '초기발생', grant_year: 2025, days: 14 },
      { date: '2026-01-01', used: 0,   reason: '연간발생', grant_year: 2026, days: 15 },
      { date: '2027-01-01', used: 0,   reason: '연간발생', grant_year: 2027, days: 15 },
      // ── 사용 기록 (2025 grant 소진: 14일) ──
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
      { date: '2026-01-16', used: 1.0, reason: '개인휴무', grant_year: 2025 }, // 2025 소진
      // ── 사용 기록 (2026 grant 사용 중: 11일) ──
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
    ],

    // 정기석 emp_no: '0002'
    // 2024 부여 13일 → entries 1-15 (13.5일·FIFO 오버), 2025 부여 15일 → entries 16-31 (15.5일·FIFO 오버)
    // 2026 부여 15일 → entries 32-39 (8.0일)
    // 잔여: 2024:소멸, 2025:0, 2026:7, 2027:15 → 합계 22.0일
    '0002': [
      // ── 발생 기록 ──
      { date: '2024-01-01', used: 0,   reason: '초기발생', grant_year: 2024, days: 13 },
      { date: '2025-01-01', used: 0,   reason: '연간발생', grant_year: 2025, days: 15 },
      { date: '2026-01-01', used: 0,   reason: '연간발생', grant_year: 2026, days: 15 },
      { date: '2027-01-01', used: 0,   reason: '연간발생', grant_year: 2027, days: 15 },
      // ── 사용 기록 (2024 grant: 13.5일 소진) ──
      { date: '2024-01-23', used: 1.0, reason: '개인사유',             grant_year: 2024 },
      { date: '2024-01-25', used: 1.0, reason: '편도선',               grant_year: 2024 },
      { date: '2024-02-16', used: 1.0, reason: '코로나',               grant_year: 2024 },
      { date: '2024-07-30', used: 0.5, reason: '가슴MRI',              grant_year: 2024 },
      { date: '2024-10-08', used: 0.5, reason: '건강검진 및 오후 반차', grant_year: 2024 },
      { date: '2024-11-15', used: 0.5, reason: '치과',                 grant_year: 2024 },
      { date: '2024-12-30', used: 1.0, reason: '연말연시',             grant_year: 2024 },
      { date: '2024-12-31', used: 1.0, reason: '연말연시',             grant_year: 2024 },
      { date: '2025-01-02', used: 1.0, reason: '연말연시',             grant_year: 2024 },
      { date: '2025-01-03', used: 1.0, reason: '연말연시',             grant_year: 2024 },
      { date: '2025-02-20', used: 1.0, reason: '24년휴가',             grant_year: 2024 },
      { date: '2025-02-21', used: 1.0, reason: '24년휴가',             grant_year: 2024 },
      { date: '2025-02-25', used: 1.0, reason: '24년휴가',             grant_year: 2024 },
      { date: '2025-02-26', used: 1.0, reason: '24년휴가',             grant_year: 2024 },
      { date: '2025-02-27', used: 1.0, reason: '24년휴가',             grant_year: 2024 }, // 2024 소진
      // ── 사용 기록 (2025 grant: 15.5일 소진) ──
      { date: '2025-02-28', used: 1.0, reason: '24년휴가',             grant_year: 2025 },
      { date: '2025-04-30', used: 1.0, reason: 'GW',                   grant_year: 2025 },
      { date: '2025-05-01', used: 1.0, reason: 'GW',                   grant_year: 2025 },
      { date: '2025-05-02', used: 1.0, reason: 'GW',                   grant_year: 2025 },
      { date: '2025-05-14', used: 0.5, reason: '개인사유',             grant_year: 2025 },
      { date: '2025-09-22', used: 1.0, reason: '개인사유',             grant_year: 2025 },
      { date: '2025-12-08', used: 1.0, reason: '건강검진 및 오후 반차', grant_year: 2025 },
      { date: '2025-12-18', used: 1.0, reason: '개인사유',             grant_year: 2025 },
      { date: '2025-12-29', used: 1.0, reason: '연말연시',             grant_year: 2025 },
      { date: '2025-12-30', used: 1.0, reason: '연말연시',             grant_year: 2025 },
      { date: '2025-12-31', used: 1.0, reason: '연말연시',             grant_year: 2025 },
      { date: '2026-01-02', used: 1.0, reason: '연말연시',             grant_year: 2025 },
      { date: '2026-02-05', used: 1.0, reason: '개인사유',             grant_year: 2025 },
      { date: '2026-04-02', used: 1.0, reason: '운전면허 갱신',        grant_year: 2025 },
      { date: '2026-04-08', used: 1.0, reason: '감기',                 grant_year: 2025 },
      { date: '2026-04-30', used: 1.0, reason: 'GW',                   grant_year: 2025 }, // 2025 소진
      // ── 사용 기록 (2026 grant: 8.0일 사용 중) ──
      { date: '2026-05-01', used: 1.0, reason: 'GW',       grant_year: 2026 },
      { date: '2026-06-03', used: 1.0, reason: '태풍',     grant_year: 2026 },
      { date: '2026-09-24', used: 1.0, reason: '추석',     grant_year: 2026 },
      { date: '2026-09-25', used: 1.0, reason: '추석',     grant_year: 2026 },
      { date: '2026-12-28', used: 1.0, reason: '연말연시', grant_year: 2026 },
      { date: '2026-12-29', used: 1.0, reason: '연말연시', grant_year: 2026 },
      { date: '2026-12-30', used: 1.0, reason: '연말연시', grant_year: 2026 },
      { date: '2026-12-31', used: 1.0, reason: '연말연시', grant_year: 2026 },
    ],
  };

  // ── vacationData 갱신 ──────────────────────────────────────────────
  Object.keys(newData).forEach(empNo => {
    vacationData[empNo] = newData[empNo];
  });

  // ── localStorage 저장 ──────────────────────────────────────────────
  const LS_KEY = (typeof LS !== 'undefined' && LS.vacation) ? LS.vacation : 'kyuyo_vacation';
  localStorage.setItem(LS_KEY, JSON.stringify(vacationData));

  // ── GAS 저장 ──────────────────────────────────────────────────────
  if (typeof saveVacationToGas === 'function') {
    saveVacationToGas(vacationData);
    console.log('✅ GAS saveVacationToGas 호출 완료');
  } else {
    console.warn('⚠️ saveVacationToGas 함수가 없습니다. localStorage만 저장됨.');
  }

  // ── 잔여일수 로그 출력 ──────────────────────────────────────────────
  if (typeof calcVacationSummary === 'function') {
    ['0017', '0002'].forEach(no => {
      const sum = calcVacationSummary(no);
      console.log(`[${no}] 부여:${sum.totalGranted} 사용:${sum.totalUsed} 잔여:${sum.remaining}${sum.expiringInfo ? ' ⚠️ 소멸예정' : ''}`);
    });
  }

  // ── 화면 갱신 ──────────────────────────────────────────────────────
  if (typeof renderVacationPage === 'function') renderVacationPage();

  console.log('✅ 유급휴가 데이터 입력 완료');
  if (typeof showToast === 'function') showToast('유급휴가 데이터 입력 완료', 's');
})();
