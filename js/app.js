// 수정: 2026-07-04 10:30 — 사이드바 접기/펼치기 토글 추가
'use strict';

// ── 사이드바 접기/펼치기 ────────────────────────────────────────────────────
function toggleSidebar() {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  sb.classList.toggle('collapsed');
  localStorage.setItem('wisepay_sb_collapsed', sb.classList.contains('collapsed') ? '1' : '0');
}

function initSidebarToggle() {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  if (localStorage.getItem('wisepay_sb_collapsed') === '1') sb.classList.add('collapsed');

  const tip = document.getElementById('sidebar-nav-tip');
  if (!tip) return;

  sb.addEventListener('mouseover', e => {
    if (!sb.classList.contains('collapsed')) { tip.style.display = 'none'; return; }
    const item = e.target.closest('.nav-item');
    if (!item) { tip.style.display = 'none'; return; }
    const label = item.querySelector('span')?.textContent?.trim();
    if (!label) return;
    const rect = item.getBoundingClientRect();
    tip.textContent = label;
    tip.style.display = 'block';
    tip.style.top  = Math.round(rect.top + rect.height / 2 - 14) + 'px';
    tip.style.left = Math.round(rect.right + 8) + 'px';
  });

  sb.addEventListener('mouseout', e => {
    if (!e.relatedTarget || !e.relatedTarget.closest('.nav-item')) tip.style.display = 'none';
  });
}

// families(16세 이상) 기반으로 employees의 fuyouCount를 재계산하여 저장
function syncFuyouFromFamilies() {
  let changed = false;
  employees.forEach(emp => {
    const cnt = Math.min((emp.families||[]).filter(f=>{
      if(!f.birth) return false;
      return calcAgeByYear(f.birth) >= 16;
    }).length, 7);
    if((emp.fuyouCount||0) !== cnt) { emp.fuyouCount = cnt; changed = true; }
  });
  if(changed) localStorage.setItem(LS.emp, JSON.stringify(employees));
  return changed;
}
// ══ INIT ══
window.addEventListener('DOMContentLoaded', () => {
  LANG = localStorage.getItem(LS.lang) || 'KR';
  applyLang();
  initSidebarToggle();
  if (!checkAuth()) return;
  initApp();
});

// GAS 다운로드 후에도 실행 가능한 요율 이력 마이그레이션 함수
// 반환값: GAS 역업로드가 필요한 경우 true
function migrateRateHistory() {
  let migrated = false;
  // 잘못된 항목 제거: 2026-01은 실제 보험료율 변경이 없는 달 (구버전 기본값 잔재)
  const invalidEntries = ['2026-01'];
  const beforeLen = rateHistory.length;
  rateHistory = rateHistory.filter(r => !invalidEntries.includes(r.from));
  if(rateHistory.length !== beforeLen) migrated = true;
  // 오류 값 수정
  rateHistory.forEach(r => {
    if(r.from < '2026-04' && r.kodomo > 0)                      { r.kodomo = 0.00; migrated = true; }
    if(r.from < '2026-04' && Math.abs(r.koyo  - 0.50) < 0.001) { r.koyo   = 0.55; migrated = true; }
    // 2024년도(R6) 건강·개호보험 요율: 이전 버전에서 잘못 보정된 값 복구
    if((r.from === '2024-03' || r.from === '2024-04') && Math.abs(r.kenko - 9.98) > 0.001) { r.kenko = 9.98; migrated = true; }
    if((r.from === '2024-03' || r.from === '2024-04') && Math.abs(r.kaigo - 1.60) > 0.001) { r.kaigo = 1.60; migrated = true; }
    // 2025년도(R7) 건강·개호보험 요율 보정
    if((r.from === '2025-03' || r.from === '2025-04') && Math.abs(r.kenko - 9.91) > 0.001) { r.kenko = 9.91; migrated = true; }
    if((r.from === '2025-03' || r.from === '2025-04') && Math.abs(r.kaigo - 1.59) > 0.001) { r.kaigo = 1.59; migrated = true; }
  });
  // 누락 항목 추가 (변경 시점 기준 전체 이력)
  const defaults = [
    { from:'2024-03', kenko:9.98, kaigo:1.60, kodomo:0.00, nenkin:18.30, koyo:0.60 },
    { from:'2024-04', kenko:9.98, kaigo:1.60, kodomo:0.00, nenkin:18.30, koyo:0.60 },
    { from:'2025-03', kenko:9.91, kaigo:1.59, kodomo:0.00, nenkin:18.30, koyo:0.60 },
    { from:'2025-04', kenko:9.91, kaigo:1.59, kodomo:0.00, nenkin:18.30, koyo:0.55 },
    { from:'2026-03', kenko:9.85, kaigo:1.62, kodomo:0.00, nenkin:18.30, koyo:0.55 },
    { from:'2026-04', kenko:9.85, kaigo:1.62, kodomo:0.23, nenkin:18.30, koyo:0.50 },
  ];
  defaults.forEach(def => {
    if(!rateHistory.find(r => r.from === def.from)) {
      rateHistory.push({...def}); migrated = true;
    }
  });
  // 중복 제거 + 정렬
  const seenFrom = new Set();
  const deduped = [];
  [...rateHistory].sort((a,b)=>a.from>b.from?1:-1).reverse().forEach(r => {
    if(!r.from || !/^\d{4}-\d{2}$/.test(r.from) || seenFrom.has(r.from)) return;
    seenFrom.add(r.from); deduped.unshift(r);
  });
  if(deduped.length !== rateHistory.length) { rateHistory = deduped; migrated = true; }
  else rateHistory.sort((a,b) => a.from > b.from ? 1 : -1);
  if(migrated) localStorage.setItem(LS.rateHistory, JSON.stringify(rateHistory));
  return migrated;
}

function initApp() {
  // load storage
  try { const s = localStorage.getItem(LS.emp); if(s) { employees = JSON.parse(s).filter(e => e && !e.deleted); employees.forEach(e=>{ if(e.shaho_start) e.shaho_start=normalizeYM(e.shaho_start); if(e.join) e.join=normalizeDate(e.join); if(e.leave) e.leave=normalizeDate(e.leave); if(e.birth) e.birth=normalizeDate(e.birth); }); } } catch(e){}
  try { const s = localStorage.getItem(LS.rateHistory); if(s) rateHistory = JSON.parse(s); } catch(e){}
  try { const s = localStorage.getItem(LS.deletedEmpIds); if(s) deletedEmpIds = JSON.parse(s); } catch(e){}
  try { const s = localStorage.getItem(LS.paidYMs);     if(s) paidYMs     = new Set(JSON.parse(s)); } catch(e){}
  try { const s = localStorage.getItem(LS.paidDetails); if(s) paidDetails = JSON.parse(s);           } catch(e){}
  try { const s = localStorage.getItem(LS.vacation);    if(s) vacationData = JSON.parse(s);            } catch(e){}
  // 마이그레이션
  syncFuyouFromFamilies();
  migrateRateHistory();
  // 구버전 단일 rates 호환
  try { const s = localStorage.getItem(LS.rates); if(s) { const r=JSON.parse(s); rates={...rates,...r}; } } catch(e){}
  // 구버전 급여 키 마이그레이션: 비패딩 사원번호(kyuyo_p_1_...) → 4자리(kyuyo_p_0001_...)
  migratePayrollKeys();
  // GAS URL은 state.js에서 하드코딩 — localStorage에 동기화
  localStorage.setItem(LS.gas, gasUrl);

  // (제거) 이전: 급여 입력란 포커스 이탈 시 빈 값 → "0" 복원 — 0 잔류 버그 원인이라 삭제.
  // 빈 칸은 pv()에서 0으로 파싱되므로 계산엔 영향 없음. payroll.js의 blur 리스너가 0 잔류를 방지.

  renderEmpSelect();
  renderMonthTabs();
  applyRatesForYM(currentYear, currentMonth);
  loadPayrollForm();
  renderPaidBtn();
  updateRatesDisplay();
  checkRateBanner();
  updateGasStatus();
  try { buildHistEmpSel(); } catch(e) { console.error('buildHistEmpSel error:', e); }
  try { buildAnnualYearSel(); buildAnnualEmpSel(); } catch(e) { console.error('buildAnnual error:', e); }
  setTimeout(() => onMonthYearChange(), 100);
  // 로그인 후 Google 시트에서 최신 데이터 자동 로드
  autoLoadFromGas();
  // 월요일 접속 시 수동 백업 알림
  checkBackupReminder();
  // 백업 다운로드 후 리로드 시 이전 페이지 복원
  const _rp = sessionStorage.getItem('wisepay_restore_page');
  if (_rp) {
    sessionStorage.removeItem('wisepay_restore_page');
    const _nav = document.querySelector(`.nav-item[data-page="${_rp}"]`);
    setTimeout(() => gotoPage(_rp, _nav), 150);
  }
  if (typeof applyViewerRestrictions  === 'function') applyViewerRestrictions();
  if (typeof applyEmployeeRestrictions === 'function') applyEmployeeRestrictions();
  if (currentUser && currentUser.id === 'wiseadmin') {
    if (typeof initNotifications === 'function') initNotifications();
    // checkAndShowPayrollAlerts は autoLoadFromGas() 완료 후 호출됨 (gas.js)
    // 기간 지정 UI: admin 전용으로 표시
    if (typeof showAnnualCustomWrap === 'function') showAnnualCustomWrap();
  }
}

// 페이지 닫기/새로고침 시 미저장 경고
window.addEventListener('beforeunload', e => {
  if(payrollDirty || empFormDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function savePdf() {
  const jp = LANG === 'JP';
  const activePage = document.querySelector('.page.active')?.id || '';
  let filename = 'WisePay';

  if (activePage === 'page-payroll' && currentEmpIdx >= 0) {
    const emp = employees[currentEmpIdx];
    if (emp) {
      const no = String(emp.no).padStart(4, '0');
      filename = jp
        ? `${no}_${emp.name}_給与明細_${currentYear}年${currentMonth}月`
        : `${no}_${emp.name}_급여명세_${currentYear}년${currentMonth}월`;
    }
  } else if (activePage === 'page-annual') {
    const year = parseInt(document.getElementById('annualYearSel')?.value) || currentYear;
    const nos = (typeof getSelectedAnnualNos === 'function') ? getSelectedAnnualNos() : [];
    if (nos.length === 1) {
      const emp = employees.find(e => parseInt(e.no) === nos[0]);
      if (emp) {
        const no = String(emp.no).padStart(4, '0');
        filename = jp
          ? `${no}_${emp.name}_賃金台帳_${year}年度`
          : `${no}_${emp.name}_임금 대장_${year}년도`;
      }
    } else if (nos.length > 1) {
      const isAll = nos.length === employees.length;
      const prefix = isAll ? (jp ? '全従業員' : '전사원') : '';
      filename = jp
        ? `${prefix ? prefix + '_' : ''}賃金台帳_${year}年度`
        : `${prefix ? prefix + '_' : ''}임금 대장_${year}년도`;
    }
  } else if (activePage === 'page-employees' && editingEmpIdx >= 0) {
    const emp = employees[editingEmpIdx];
    if (emp) {
      const no = String(emp.no).padStart(4, '0');
      filename = jp
        ? `${no}_${emp.name}_従業員情報`
        : `${no}_${emp.name}_사원정보`;
    }
  }

  const origTitle = document.title;
  document.title = filename;
  window.addEventListener('afterprint', () => { document.title = origTitle; }, { once: true });
  window.print();
}

// 인쇄 시 스크롤바 제거 + overflow:hidden 해제 (page-break 동작 보장)
window.addEventListener('beforeprint', () => {
  document.querySelectorAll('.annual-scroll-wrap, .annual-wrap').forEach(el => {
    el.style.overflow = 'visible';
    el.style.minWidth = '0';
  });
  // flex 컨테이너 해제: min-height:100vh가 content 높이를 1페이지로 제한 → 마지막 표 잘림
  const layout = document.querySelector('.layout');
  if (layout) { layout.style.display = 'block'; layout.style.minHeight = '0'; layout.style.height = 'auto'; }
  const content = document.querySelector('.content');
  if (content) { content.style.overflow = 'visible'; content.style.height = 'auto'; }
});
window.addEventListener('afterprint', () => {
  document.querySelectorAll('.annual-scroll-wrap, .annual-wrap').forEach(el => {
    el.style.overflow = '';
    el.style.minWidth = '';
  });
  const layout = document.querySelector('.layout');
  if (layout) { layout.style.display = ''; layout.style.minHeight = ''; layout.style.height = ''; }
  const content = document.querySelector('.content');
  if (content) { content.style.overflow = ''; content.style.height = ''; }
});

function gotoPage(id, el) {
  if (typeof canAccessPage === 'function' && !canAccessPage(id)) {
    showAccessDenied();
    return;
  }
  const currentPage = document.querySelector('.page.active')?.id;
  // 사원 편집 중 다른 페이지로 이동 시 경고
  if(currentPage === 'page-employees' && id !== 'employees' && empFormDirty) {
    const jp = LANG==='JP';
    if(!confirm(jp?'保存されていない従業員情報があります。このまま移動しますか？':'저장되지 않은 사원 정보가 있습니다. 이동하시겠습니까?')) return;
    empFormDirty = false;
  }
  // 급여명세에서 이동(동일 페이지 재클릭 포함) 시 미저장 경고
  if(currentPage === 'page-payroll' && payrollDirty) {
    const jp = LANG==='JP';
    const msg = jp
      ? '保存されていない入力内容があります。破棄して移動しますか？'
      : '저장하지 않은 입력 내용이 있습니다. 취소하고 이동하시겠습니까?';
    if(!confirm(msg)) return;
    payrollDirty = false;
    const saveBtn = document.getElementById('btn-save');
    if(saveBtn) { saveBtn.style.background = ''; saveBtn.style.borderColor = ''; }
    const discardBtn = document.getElementById('btn-discard');
    if(discardBtn) discardBtn.disabled = true;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if(el) el.classList.add('active');
  else {
    const sideNav = document.querySelector(`.nav-item[data-page="${id}"]`);
    if(sideNav) sideNav.classList.add('active');
  }
  const titles = {payroll:{JP:'給与明細',KR:'급여 명세'},history:{JP:'支給履歴',KR:'지급 이력'},employees:{JP:'従業員管理',KR:'사원 관리'},rates:{JP:'保険料率設定',KR:'보험료율 설정'},annual:{JP:'賃金台帳',KR:'임금 대장'},gas:{JP:'データ管理',KR:'데이터 관리'},notifications:{JP:'通知',KR:'알림'},vacation:{JP:'有給休暇',KR:'유급 휴가'},'payment-statement':{JP:'源泉所得税納付書',KR:'원천세 납부서'},'change-password':{JP:'パスワード変更',KR:'비밀번호 변경'},santei:{JP:'算定基礎届',KR:'算定基礎届'},roudou:{JP:'労働保険 年度更新',KR:'労働保険 年度更新'}};
  const t = titles[id];
  if(t) document.getElementById('topbar-title').textContent = t[LANG];
  const isPayroll = id === 'payroll';
  document.getElementById('btn-save').style.display = isPayroll ? '' : 'none';
  const _paidBtn = document.getElementById('btn-mark-paid');
  if (_paidBtn) _paidBtn.style.display = isPayroll ? '' : 'none';
  const _discardBtn = document.getElementById('btn-discard');
  if (_discardBtn) _discardBtn.style.display = isPayroll ? '' : 'none';
  if(id==='payroll') { loadPayrollForm(); renderPaidBtn(); }
  if(id==='history') { try { buildHistEmpSel(); renderHistory(); } catch(e) { console.error('history render error:', e); } }
  if(id==='employees') renderEmpList();
  if(id==='rates') renderRatesPage();
  if(id==='annual') { try { buildAnnualYearSel(); buildAnnualEmpSel(); renderAnnual(); } catch(e) { console.error('annual render error:', e); } }
  if(id==='gas') openGasModal();
  if(id==='notifications') renderNotificationsPage();
  if(id==='vacation') { try { renderVacationPage(); } catch(e) { console.error('vacation render error:', e); } }
  if(id==='payment-statement') { try { initPaymentStatement(); } catch(e) { console.error('payment-statement render error:', e); } }
  if(id==='change-password')   { try { initChangePwPage(); } catch(e) { console.error('change-password init error:', e); } }
  if(id==='santei')            { try { initSantei(); } catch(e) { console.error('santei init error:', e); } }
  if(id==='roudou')            { try { initRoudou(); } catch(e) { console.error('roudou init error:', e); } }
}

function resetLocalData() {
  const jp = LANG === 'JP';
  const msg1 = jp
    ? 'ローカルデータを初期化しますか？\nこの操作は元に戻せません。'
    : '로컬 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.';
  const msg2 = jp
    ? '本当に初期化しますか？\nブラウザのすべてのキャッシュデータが削除されます。'
    : '정말로 초기화하시겠습니까?\n브라우저의 모든 캐시 데이터가 삭제됩니다.';
  if (!confirm(msg1)) return;
  if (!confirm(msg2)) return;

  // kyuyo_ 접두사 키 전체 삭제 (lang, auth 제외)
  const keepKeys = new Set([LS.lang, AUTH_SESS_KEY, AUTH_ID_KEY]);
  Object.keys(localStorage)
    .filter(k => k.startsWith('kyuyo_') && !keepKeys.has(k))
    .forEach(k => localStorage.removeItem(k));

  // 사원 편집 폼 초기화 (이전 데이터가 화면에 남지 않도록)
  empFormDirty = false;
  cancelEmpForm();

  // 상태 변수 초기화
  employees = [];
  deletedEmpIds = [];
  gasDeletedEmpIds = [];
  showResigned = false;
  rateHistory = [
    { from:'2024-03', kenko:9.98, kaigo:1.60, kodomo:0.00, nenkin:18.30, koyo:0.60 },
    { from:'2024-04', kenko:9.98, kaigo:1.60, kodomo:0.00, nenkin:18.30, koyo:0.60 },
    { from:'2025-03', kenko:9.91, kaigo:1.59, kodomo:0.00, nenkin:18.30, koyo:0.60 },
    { from:'2025-04', kenko:9.91, kaigo:1.59, kodomo:0.00, nenkin:18.30, koyo:0.55 },
    { from:'2026-03', kenko:9.85, kaigo:1.62, kodomo:0.00, nenkin:18.30, koyo:0.55 },
    { from:'2026-04', kenko:9.85, kaigo:1.62, kodomo:0.23, nenkin:18.30, koyo:0.50 },
  ];
  currentEmpIdx = -1;

  saveRateHistory();
  rerenderAll();
  showToast(jp ? 'ローカルデータを初期化しました' : '로컬 데이터를 초기화했습니다', 's');
}

// 전체 화면 갱신 — 언어 전환·데이터 초기화 등 전역 상태 변경 후 호출
function rerenderAll() {
  renderEmpSelect();
  renderEmpList();
  renderMonthTabs();
  applyRatesForYM(currentYear, currentMonth);
  loadPayrollForm();
  updateRatesDisplay();
  renderRatesPage();
  checkRateBanner();
  try { buildHistEmpSel(); renderHistory(); } catch(e) {}
  try { buildAnnualYearSel(); buildAnnualEmpSel(); renderAnnual(); } catch(e) {}
  try { renderVacationPage(); } catch(e) {}
  try { if (_psInitialized) { buildPsYearSel(); renderPaymentStatement(); } } catch(e) {}
  updateGasStatus();
  recalc();
}

// 구버전 급여 localStorage 키 마이그레이션
// kyuyo_p_1_2026_5 → kyuyo_p_0001_2026_5 형태로 일괄 변환
function migratePayrollKeys() {
  try {
    employees.forEach(emp => {
      const paddedNo = String(emp.no).padStart(4, '0');
      const numericNo = String(parseInt(paddedNo, 10)); // "0001" → "1"
      if(paddedNo === numericNo) return; // 패딩이 이미 같으면 스킵
      const oldPrefix = `kyuyo_p_${numericNo}_`;
      const newPrefix = `kyuyo_p_${paddedNo}_`;
      // 하드코딩된 연도 범위 대신 실제 존재하는 키를 스캔
      const toMigrate = [];
      for(let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if(k && k.startsWith(oldPrefix)) toMigrate.push(k);
      }
      toMigrate.forEach(oldKey => {
        const newKey = newPrefix + oldKey.slice(oldPrefix.length);
        if(!localStorage.getItem(newKey)) localStorage.setItem(newKey, localStorage.getItem(oldKey));
        localStorage.removeItem(oldKey);
      });
    });
  } catch(e) {}
}

