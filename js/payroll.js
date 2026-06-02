// 수정: 2026-06-03 08:08 — renderPaidBtn 버튼 문구 일본어 미전환 버그 수정
'use strict';

let _payrollDataStatus = 'none';
let _paidLocked = false; // 지급완료 달 잠금 여부

// 입력란 잠금/해제 + 저장↔수정 버튼 전환
function _applyPaidLock(locked) {
  _paidLocked = locked;
  const isViewer = typeof isWriteAuthorized === 'function' && !isWriteAuthorized();
  if (!isViewer) {
    document.querySelectorAll('#page-payroll .row-input').forEach(inp => {
      inp.readOnly          = locked;
      inp.style.background  = locked ? 'var(--surface2)' : '';
      inp.style.cursor      = locked ? 'default' : '';
      inp.style.borderColor = locked ? 'transparent' : '';
    });
  }
  const saveBtn  = document.getElementById('btn-save');
  const saveIcon = document.getElementById('span-save-icon');
  const saveTxt  = document.getElementById('t-save-btn');
  if (!saveBtn) return;
  if (locked) {
    saveBtn.onclick           = unlockPaidMonth;
    saveBtn.style.background  = '#475569';
    saveBtn.style.borderColor = '#475569';
    saveBtn.style.color       = '#fff';
    if (saveIcon) saveIcon.style.display = 'none';
    if (saveTxt)  saveTxt.textContent    = LANG === 'JP' ? '🔓 修正' : '🔓 수정';
  } else {
    saveBtn.onclick           = saveCurrent;
    saveBtn.style.background  = '';
    saveBtn.style.borderColor = '';
    saveBtn.style.color       = '';
    if (saveIcon) saveIcon.style.display = '';
    if (saveTxt)  saveTxt.textContent    = LANG === 'JP' ? '保存' : '저장';
  }
}

function unlockPaidMonth() {
  const jp = LANG === 'JP';
  const msg = jp
    ? `${currentYear}年${currentMonth}月分は支払済み給与です。\n既に支払われた記録を修正すると、実際の支払額と異なる場合があります。\n修正しますか？`
    : `${currentYear}년 ${currentMonth}월분은 이미 지급완료된 급여입니다.\n이미 지급된 기록을 수정하면 실제 지급액과 달라질 수 있습니다.\n수정하시겠습니까?`;
  if (!confirm(msg)) return;
  _applyPaidLock(false);
}

function _updatePayrollStatus(status) {
  const el = document.getElementById('payroll-data-status');
  if (!el) return;
  const jp = LANG === 'JP';
  if (status === 'none') { el.style.display = 'none'; return; }
  // 지급완료 날짜 문자열 (paidDetails에 있으면 표시)
  let paidDateTxt = '';
  if (status === 'paid') {
    const ym = `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
    const iso = paidDetails && paidDetails[ym];
    if (iso) {
      try {
        const d = new Date(iso);
        paidDateTxt = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
      } catch(e) {}
    }
  }
  const cfg = {
    saved:  { bg:'#f0fdf4', color:'#166534', border:'#bbf7d0',
      text: jp ? '✅ この月のデータが保存されています' : '✅ 이 달 저장된 데이터' },
    approx: { bg:'#fffbeb', color:'#92400e', border:'#fde68a',
      text: jp ? '📋 仮入力値（未保存）' : '📋 임시 입력값 (미저장)' },
    empty:  { bg:'var(--surface2)', color:'var(--text3)', border:'var(--border)',
      text: jp ? '— 入力なし' : '— 입력값 없음' },
    paid:   { bg:'#eff6ff', color:'#1e40af', border:'#bfdbfe',
      text: (jp ? '🔒 支払済み' : '🔒 지급완료') + (paidDateTxt ? ` (${paidDateTxt})` : '') },
  }[status] || { bg:'var(--surface2)', color:'var(--text3)', border:'var(--border)', text:'' };
  el.style.cssText = `display:flex;align-items:center;padding:5px 16px;font-size:11px;font-weight:600;background:${cfg.bg};color:${cfg.color};border-top:1px solid ${cfg.border};border-bottom:1px solid ${cfg.border};`;
  el.textContent = cfg.text;
}

function renderMonthTabs() {
  const c = document.getElementById('monthTabs');
  c.innerHTML = '';
  const u = LANG==='JP' ? '月' : '월';
  for(let m=1; m<=12; m++) {
    const b = document.createElement('button');
    b.className = 'month-tab' + (m===currentMonth?' active':'');
    b.textContent = m+u;
    b.onclick = () => {
      if(payrollDirty && m !== currentMonth) {
        const jp = LANG==='JP';
        const msg = jp ? '保存されていない給与データがあります。このまま切り替えますか？' : '저장되지 않은 급여 데이터가 있습니다. 전환하시겠습니까?';
        if(!confirm(msg)) return;
      }
      currentMonth=m; renderMonthTabs(); onMonthYearChange();
    };
    c.appendChild(b);
  }
  document.getElementById('yearTxt').textContent = currentYear + (LANG==='JP'?'年':'년');
}

function changeYear(d) {
  if(payrollDirty) {
    const jp = LANG==='JP';
    const msg = jp ? '保存されていない給与データがあります。このまま切り替えますか？' : '저장되지 않은 급여 데이터가 있습니다. 전환하시겠습니까?';
    if(!confirm(msg)) return;
  }
  currentYear+=d; currentMonth = d < 0 ? 12 : 1; renderMonthTabs(); onMonthYearChange();
}

function gotoToday() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  if (currentYear === y && currentMonth === m) return;
  if (payrollDirty) {
    const jp = LANG === 'JP';
    const msg = jp ? '保存されていない給与データがあります。このまま切り替えますか？' : '저장되지 않은 급여 데이터가 있습니다. 전환하시겠습니까?';
    if (!confirm(msg)) return;
  }
  currentYear = y;
  currentMonth = m;
  renderMonthTabs();
  onMonthYearChange();
}

// 월/연도 변경 시 요율 자동 전환 + 알림
function onMonthYearChange() {
  const ym = `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
  applyRatesForYM(currentYear, currentMonth);
  const sortedHistory = [...rateHistory].sort((a,b) => a.from > b.from ? 1 : -1);
  const lastKnown = sortedHistory[sortedHistory.length - 1];
  const isBeyondKnown = lastKnown && ym > lastKnown.from;
  if(isBeyondKnown) {
    const applied = getRatesForYM(currentYear, currentMonth);
    addNotification(`rate-missing-${ym}`, 'warn',
      `【요율 확인】${currentYear}년 ${currentMonth}월 요율이 미등록이어서 ${applied.from} 이후 요율을 적용 중입니다. 「최신 요율 가져오기」로 확인・등록해 주세요.`,
      `【要率確認】${currentYear}年${currentMonth}月の保険料率は未登録のため、${applied.from}以降の料率を適用中です。「最新要率を取得」で確認・登録してください。`
    );
  }
  loadPayrollForm();
  renderPaidBtn();
}

// ══ EMP SELECT ══
function renderEmpSelect() {
  const sel = document.getElementById('empSelect');
  sel.innerHTML = '';
  const jp = LANG==='JP';
  const blank = document.createElement('option');
  blank.value = '-1';
  blank.textContent = jp ? '── 従業員を選択 ──' : '── 사원 선택 ──';
  sel.appendChild(blank);
  if(!employees.length) return;
  employees.forEach((e,i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${String(e.no).padStart(4,'0')} ${e.name}`;
    sel.appendChild(opt);
  });
  const validIdx = currentEmpIdx >= 0 && currentEmpIdx < employees.length;
  sel.value = validIdx ? currentEmpIdx : '-1';
}
function onEmpChange() {
  const newIdx = parseInt(document.getElementById('empSelect').value);
  if(payrollDirty && newIdx !== currentEmpIdx) {
    const jp = LANG==='JP';
    const msg = jp
      ? '保存されていない給与データがあります。このまま切り替えますか？'
      : '저장되지 않은 급여 데이터가 있습니다. 전환하시겠습니까?';
    if(!confirm(msg)) {
      document.getElementById('empSelect').value = currentEmpIdx;
      return;
    }
  }
  currentEmpIdx = isNaN(newIdx) ? -1 : newIdx;
  loadPayrollForm();
  renderPaidBtn();
}

function loadPayrollForm() {
  const showContent = (show) => {
    const ids = ['payrollContent','payrollBody','rates-wrap-section','calc-info-section'];
    // payrollContent, payrollBody는 id로 직접 제어
    const pc = document.getElementById('payrollContent');
    const pb = document.getElementById('payrollBody');
    const rw = document.querySelector('.rates-wrap');
    const ci = document.querySelector('.calc-info');
    if(pc) pc.style.display = show ? '' : 'none';
    if(pb) pb.style.display = show ? 'grid' : 'none';
    if(rw) rw.style.display = show ? '' : 'none';
    if(ci) ci.style.display = show ? '' : 'none';
  };

  const ph = document.getElementById('payrollPlaceholder');
  // 미선택 상태
  if(currentEmpIdx < 0 || !employees.length) {
    showContent(false);
    if(ph) ph.style.display = '';
    payrollDirty = false;
    const saveBtn = document.getElementById('btn-save');
    if(saveBtn) { saveBtn.style.background = ''; saveBtn.style.borderColor = ''; }
    _updatePayrollStatus('none');
    return;
  }

  if(currentEmpIdx >= employees.length) currentEmpIdx = 0;
  if(ph) ph.style.display = 'none';
  showContent(true);

  const emp = employees[currentEmpIdx];
  const pNo = String(emp.no).padStart(4,'0');
  const key = `kyuyo_p_${pNo}_${currentYear}_${currentMonth}`;
  const savedRaw = localStorage.getItem(key);

  // PFIELD 키가 하나라도 0이 아닌 값으로 존재할 때만 실제 입력 포맷으로 판단
  // '' (GAS 시트 빈셀) 또는 0만 있는 경우는 미입력으로 처리
  const _hasPF = d => PFIELDS.some(f => {
    if (!(f in d)) return false;
    return Number(String(d[f] || '0').replace(/,/g, '')) !== 0;
  });

  const _loadPFields = d => {
    PFIELDS.forEach(f => {
      const el = document.getElementById(f);
      if(!el) return;
      const n = parseInt(String(d[f] !== undefined ? d[f] : 0).replace(/,/g, '')) || 0;
      el.value = n === 0 ? '' : n.toLocaleString();
    });
  };

  // GAS 집계값(totalPay)을 r-base에 근사값으로 설정 — PFIELD 미입력 시 폴백
  const _loadGasApprox = d => {
    PFIELDS.forEach(f => { const el = document.getElementById(f); if(el) el.value = ''; });
    const baseEl = document.getElementById('r-base');
    const tp = parseInt(String(d.totalPay || 0).replace(/,/g, '')) || 0;
    if(baseEl && tp > 0) baseEl.value = tp.toLocaleString();
  };

  // GAS 집계 포맷 여부 판별 (totalPay 또는 kenko 또는 net 키 존재)
  const _isGas = d => !!(d.totalPay || d.kenko || d.net);

  let hasSavedPF = false;
  let savedGasData = null;
  let _dataStatus = 'empty';
  if(savedRaw) {
    try {
      const d = JSON.parse(savedRaw);
      if(_hasPF(d)) { hasSavedPF = true; _dataStatus = 'saved'; _loadPFields(d); }
      else if(_isGas(d)) { savedGasData = d; }
    } catch(e){}
  }

  if(!hasSavedPF) {
    const today = new Date();
    const todayYM = today.getFullYear() * 100 + (today.getMonth() + 1);
    const selectedYM = currentYear * 100 + currentMonth;

    // 한 방향으로 최대 24개월 탐색하는 공통 헬퍼
    // delta: +1=미래 방향, -1=과거 방향
    const _scan = (startY, startM, delta, initGas) => {
      let pf = null, gas = initGas || null;
      let y = startY, m = startM;
      for(let i = 0; i < 24; i++) {
        m += delta;
        if(m > 12) { m = 1; y++; }
        if(m < 1)  { m = 12; y--; }
        const s = localStorage.getItem(`kyuyo_p_${pNo}_${y}_${m}`);
        if(s) {
          try {
            const c = JSON.parse(s);
            if(_hasPF(c))                  { pf  = c; break; }
            else if(!gas && _isGas(c))     { gas = c; }
          } catch(e) {}
        }
      }
      return { pf, gas };
    };

    if(selectedYM < todayYM) {
      // 과거 월: 미래 방향 우선 탐색 → 없으면 과거 방향 fallback
      let { pf, gas } = _scan(currentYear, currentMonth, +1, savedGasData);
      if(!pf && !gas) ({ pf, gas } = _scan(currentYear, currentMonth, -1, null));
      if(pf)       { _dataStatus = 'approx'; _loadPFields(pf); }
      else if(gas) { _dataStatus = 'approx'; _loadGasApprox(gas); }
      else         { _dataStatus = 'empty';  PFIELDS.forEach(f => { const el = document.getElementById(f); if(el) el.value = ''; }); }
    } else {
      // 당월·미래 월: 과거 방향 우선 탐색 → 없으면 미래 방향 fallback
      let { pf, gas } = _scan(currentYear, currentMonth, -1, savedGasData);
      if(!pf && !gas) ({ pf, gas } = _scan(currentYear, currentMonth, +1, null));
      if(pf)       { _dataStatus = 'approx'; _loadPFields(pf); }
      else if(gas) { _dataStatus = 'approx'; _loadGasApprox(gas); }
      else         { _dataStatus = 'empty';  PFIELDS.forEach(f => { const el = document.getElementById(f); if(el) el.value = ''; }); }
    }
  }
  // 지급완료된 달이면 'paid' 상태로 재정의 + 입력 잠금
  const _ymCheck = `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
  const _isPaid   = _dataStatus !== 'none' && paidYMs.has(_ymCheck);
  const _finalStatus = _isPaid ? 'paid' : _dataStatus;
  _payrollDataStatus = _finalStatus;
  _updatePayrollStatus(_finalStatus);
  updateEmpHeader();
  payrollDirty = false;
  const saveBtn = document.getElementById('btn-save');
  if(saveBtn) { saveBtn.style.background = ''; saveBtn.style.borderColor = ''; }
  _applyPaidLock(_isPaid); // background 리셋 이후 호출해야 녹색이 덮이지 않음
  recalc();
}

function updateEmpHeader() {
  if(!employees.length) return;
  const emp = employees[currentEmpIdx];
  if(!emp) return;
  document.getElementById('avatarTxt').textContent = emp.name.charAt(0);
  document.getElementById('empNameTxt').textContent = emp.name;
  document.getElementById('empIdTxt').textContent = String(emp.no).padStart(4,'0');
  const yu = LANG==='JP'?'年':'년', mu = LANG==='JP'?'月分':'월분';
  document.getElementById('empMonthTxt').textContent = `${currentYear}${yu}${currentMonth}${mu}`;
}

// ══ CALC ══
// 쉼표 포맷: 입력 중 세 자리마다 , 추가
function fmtInput(input) {
  const isNeg = input.value.startsWith('-');
  const raw = input.value.replace(/[^0-9]/g, '');
  if(raw === '') { input.value = ''; markPayrollDirty(); return; }
  const num = parseInt(raw, 10);
  const pos = input.selectionStart;
  const prevLen = input.value.length;
  input.value = (isNeg ? '-' : '') + num.toLocaleString();
  const diff = input.value.length - prevLen;
  input.setSelectionRange(pos + diff, pos + diff);
  markPayrollDirty();
}

function markPayrollDirty() {
  payrollDirty = true;
  const saveBtn = document.getElementById('btn-save');
  if(saveBtn) { saveBtn.style.background='#e53e3e'; saveBtn.style.borderColor='#e53e3e'; }
}

function pv(id) {
  const el = document.getElementById(id);
  if(!el) return 0;
  return parseInt((el.value||'0').replace(/,/g,'')) || 0;
}

// 엔터키 → 다음 필드 포커스 / ESC → 원래 값 복원
function focusNext(event, nextId) {
  if(event.key === 'Enter') {
    event.preventDefault();
    const next = document.getElementById(nextId);
    if(next) next.focus();
  } else if(event.key === 'Escape') {
    event.preventDefault();
    const id = event.target.id;
    if(prevValues[id] !== undefined) {
      event.target.value = prevValues[id];
      recalc();
    }
    event.target.blur();
  }
}

// 포커스 시 현재 값 저장 (ESC 복원용) + "0" 표시 중이면 클리어
function savePrevVal(input) {
  prevValues[input.id] = input.value;
  if(input.value === '0') input.value = '';
}

// 반각 스페이스로 변환 (일본어 입력 시 전각 스페이스 → 반각)
function toHalfSpace(str) {
  return str.replace(/　/g, ' ');
}
// ── 나이 계산 유틸 ──────────────────────────────────────
// 연도 기반 (부양가족 16세 판정 등 연도 단위 기준에 사용)
function calcAgeByYear(birthStr) {
  if (!birthStr) return 0;
  return currentYear - parseInt(birthStr.substring(0, 4));
}
// 정확한 날짜 기반 (개호보험 40세 판정 등 월일까지 정확히 봐야 할 때 사용)
function calcAgeExact(birthStr) {
  if (!birthStr || !/^\d{4}-\d{2}-\d{2}$/.test(birthStr)) return 0;
  const today = new Date();
  const birth = new Date(birthStr);
  if (isNaN(birth.getTime())) return 0;
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

// ── 공제 계산 공통 함수 ─────────────────────────────────
// history.js의 renderHistory, payroll.js의 recalc 양쪽에서 공유
function calcPayrollBreakdown(emp, data, year, month) {
  const {base,ot,kintai,commute,commutetax,kinmu,shokumu,field,hyo_override,jumin,nencho} = data;
  const totalPay = base+ot-kintai+commute+commutetax+kinmu+shokumu+field;
  // 전체 0 → getHyo(0)이 최소 등급을 반환해 오계산되므로 조기 반환
  if (totalPay === 0 && !hyo_override && !jumin && !nencho) {
    const r = getRatesForYM(year, month);
    return {totalPay:0,hyo:0,kenko:0,kaigo:0,kodomo:0,nenkin:0,koyo:0,koyoEnabled:false,shakai:0,fuyou:0,isOtsu:false,shotoku:0,totalKojo:0,net:0,r};
  }
  const hyo = hyo_override > 0 ? hyo_override : (emp ? getHyo(base-kintai+commute+commutetax+kinmu+shokumu+field) : 58000);
  const r = getRatesForYM(year, month);
  const shahoParts = emp && emp.shaho_start ? emp.shaho_start.split('-') : null;
  const shahoFrom  = shahoParts ? parseInt(shahoParts[0])*100+parseInt(shahoParts[1]) : 0;
  const shahoExempt = shahoFrom > 0 && (year*100+month) < shahoFrom;
  const kenko  = shahoExempt ? 0 : Math.floor(hyo*r.kenko/100/2);
  const kaigo  = shahoExempt ? 0 : (emp&&isKaigo(emp) ? Math.floor(hyo*r.kaigo/100/2) : 0);
  const kodomo = shahoExempt ? 0 : Math.floor(hyo*r.kodomo/100/2);
  const nenkin = shahoExempt ? 0 : Math.floor(hyo*r.nenkin/100/2);
  const koyoEnabled = !shahoExempt && (!emp || emp.koyo !== 'no');
  const koyo  = koyoEnabled ? Math.round(totalPay*r.koyo/100) : 0;
  const shakai = kenko+kaigo+kodomo+nenkin+koyo;
  const fuyou  = emp ? (parseInt(emp.fuyouCount)||0) : 0;
  const isOtsu = emp ? (emp.shotokuKbn||'ko')==='otsu' : false;
  const shotoku = Math.max(0, calcShotoku(totalPay-commute-shakai, fuyou, isOtsu, year, month));
  const totalKojo = shakai+shotoku+(jumin||0)+(nencho||0);
  const net = totalPay-totalKojo;
  return {totalPay,hyo,kenko,kaigo,kodomo,nenkin,koyo,koyoEnabled,shakai,fuyou,isOtsu,shotoku,totalKojo,net,r};
}

function isKaigo(emp) {
  if(emp.kaigo==='yes') return true;
  if(emp.kaigo==='no') return false;
  if(!emp.birth) return false;
  return calcAgeExact(emp.birth) >= 40;
}

// ── 순수 계산 함수 ─────────────────────────────────────────
// DOM에 의존하지 않음. input 키는 필드 ID 그대로('r-base' 등).
// recalc·saveCurrent·일괄 재저장 모두 이 함수를 공유한다.
function calcPayrollData(input, emp, year, month) {
  const parse = k => parseInt(String(input[k] || '0').replace(/,/g, '')) || 0;
  const base       = parse('r-base');
  const ot         = parse('r-ot');
  const kintai     = parse('r-kintai');
  const commute    = parse('r-commute');
  const commutetax = parse('r-commutetax');
  const kinmu      = parse('r-kinmu');
  const shokumu    = parse('r-shokumu');
  const field      = parse('r-field');
  const hyo_override = parse('r-hyo');
  const jumin      = parse('k-jumin');
  const nencho     = parse('k-nencho');

  const inputVals = {
    'r-base': base, 'r-ot': ot, 'r-kintai': kintai, 'r-commute': commute,
    'r-commutetax': commutetax, 'r-kinmu': kinmu, 'r-shokumu': shokumu, 'r-field': field,
    'r-hyo': hyo_override, 'k-jumin': jumin, 'k-nencho': nencho,
  };

  // 전체 0 조기 반환은 calcPayrollBreakdown 내부에서 처리
  const c = calcPayrollBreakdown(
    emp,
    {base, ot, kintai, commute, commutetax, kinmu, shokumu, field, hyo_override, jumin, nencho},
    year, month
  );

  return {
    ...inputVals,
    hyo: c.hyo, kenko: c.kenko, kaigo: c.kaigo, kodomo: c.kodomo,
    nenkin: c.nenkin, koyo: c.koyo, shotoku: c.shotoku,
    totalPay: c.totalPay, totalKojo: c.totalKojo, net: c.net,
    koyoEnabled: c.koyoEnabled, shakai: c.shakai, fuyou: c.fuyou, isOtsu: c.isOtsu, r: c.r,
  };
}

function recalc() {
  const emp = employees[currentEmpIdx];
  const input = {
    'r-base':pv('r-base'), 'r-ot':pv('r-ot'), 'r-kintai':pv('r-kintai'),
    'r-commute':pv('r-commute'), 'r-commutetax':pv('r-commutetax'),
    'r-kinmu':pv('r-kinmu'), 'r-shokumu':pv('r-shokumu'), 'r-field':pv('r-field'),
    'r-hyo':pv('r-hyo'), 'k-jumin':pv('k-jumin'), 'k-nencho':pv('k-nencho'),
  };
  const c = calcPayrollData(input, emp, currentYear, currentMonth);
  const {totalPay,hyo,kenko,kaigo,kodomo,nenkin,koyo,shotoku,totalKojo,net,
         koyoEnabled,shakai,fuyou,isOtsu,r} = c;
  // 빈 폼 판정: 입력 전체 0
  const isEmpty = totalPay === 0 && !c['r-hyo'] && !c['k-jumin'] && !c['k-nencho'];
  const fmt = n => n.toLocaleString();

  // ── 금액 표시
  document.getElementById('shikyuuTotal').textContent = fmt(totalPay);
  document.getElementById('totalPayTxt').textContent = '¥' + fmt(totalPay);
  document.getElementById('k-kenko').textContent = fmt(kenko);
  document.getElementById('k-kaigo').textContent = fmt(kaigo);
  document.getElementById('k-kaigo').className = 'row-val' + (kaigo === 0 ? ' zero' : ' hi');
  document.getElementById('k-kodomo').textContent = fmt(kodomo);
  document.getElementById('k-nenkin').textContent = fmt(nenkin);
  document.getElementById('k-koyo').textContent = fmt(koyo);
  document.getElementById('k-shotoku').textContent = fmt(shotoku);
  document.getElementById('kojoTotal').textContent = fmt(totalKojo);
  document.getElementById('totalKojoTxt').textContent = '¥' + fmt(totalKojo);
  document.getElementById('netAmountTxt').textContent = '¥' + fmt(net);

  const koyoEl = document.getElementById('k-koyo');
  const de = document.getElementById('netDiffTxt');

  if (isEmpty) {
    // 빈 폼: 고용보험 스타일 초기화, 계산 정보·전월 대비 공백
    if(koyoEl) { koyoEl.style.color = ''; koyoEl.style.textDecoration = ''; }
    ['ci-kenko','ci-nenkin','ci-koyo','ci-shotoku'].forEach(id => {
      const el = document.getElementById(id); if(el) el.textContent = '-';
    });
    if(de) { de.textContent = ' '; de.className = 'net-diff'; }
  } else {
    // ── 고용보험 취소선 (미가입 시)
    if(koyoEl) {
      koyoEl.style.color = koyoEnabled ? '' : 'var(--text3)';
      koyoEl.style.textDecoration = koyoEnabled ? '' : 'line-through';
    }
    // ── 급여 계산 정보
    if(emp) {
      const shotokuBase = totalPay - c['r-commute'] - shakai;
      const shotokuKbn = isOtsu ? 'otsu' : 'ko';
      const fuyouTxt = fuyou > 0 ? `、${LANG==='JP'?'扶養':'부양'}${fuyou}${LANG==='JP'?'人':'명'}(-${fmt(fuyou*1610)}円)` : '';
      document.getElementById('ci-kenko').textContent = `標準報酬月額：${fmt(hyo)}円、労働者：${(r.kenko/2).toFixed(4)}%`;
      document.getElementById('ci-nenkin').textContent = `標準報酬月額：${fmt(hyo)}円、労働者：${(r.nenkin/2).toFixed(2)}%`;
      document.getElementById('ci-koyo').textContent = koyoEnabled ? `労働者：${r.koyo.toFixed(2)}%、賃金総額：${fmt(totalPay)}円` : (LANG==='JP'?'未加入':'미가입');
      document.getElementById('ci-shotoku').textContent = `${shotokuKbn==='otsu'?(LANG==='JP'?'乙欄':'을란'):(LANG==='JP'?'甲欄':'갑란')}、課税対象：${fmt(shotokuBase)}円${fuyouTxt}`;
    }
    // ── 전월 대비 (1월이면 전년 12월과 비교)
    if(emp && de) {
      const prevY = currentMonth===1 ? currentYear-1 : currentYear;
      const prevM = currentMonth===1 ? 12 : currentMonth-1;
      const pk = `kyuyo_p_${String(emp.no).padStart(4,'0')}_${prevY}_${prevM}`;
      const ps = localStorage.getItem(pk);
      if(ps) { try { const pd=JSON.parse(ps); const diff=net-(pd._net||0); const u=LANG==='JP'?'前月比':'전월 대비';
        if(diff>0){de.textContent=u+'  ▲ +'+fmt(diff);de.className='net-diff up';}
        else if(diff<0){de.textContent=u+'  ▼ '+fmt(diff);de.className='net-diff dn';}
        else{de.textContent=u+'  ─ ±0';de.className='net-diff nc';}
      } catch(e){ de.textContent=' '; de.className='net-diff'; } }
      else { de.textContent = ' '; de.className = 'net-diff'; }
    }
  }

  // window._calc: 입력값 + 계산값 저장 (display-only 필드 koyoEnabled/shakai/fuyou/isOtsu/r 제외)
  const { koyoEnabled:_ke, shakai:_sh, fuyou:_fu, isOtsu:_ot, r:_r, ...storeFields } = c;
  window._calc = storeFields;
}

// ══ SAVE PAYROLL ══
function saveCurrent() {
  if (typeof isWriteAuthorized === 'function' && !isWriteAuthorized()) {
    showToast(LANG === 'JP' ? '閲覧専用のため保存できません' : '열람 전용 계정입니다', 'w');
    return;
  }
  if(!employees.length) { showToast(LANG==='JP'?'従業員を先に登録してください':'사원을 먼저 등록해 주세요','w'); return; }
  const emp=employees[currentEmpIdx];
  if(!emp) return;
  recalc();
  const key=`kyuyo_p_${String(emp.no).padStart(4,'0')}_${currentYear}_${currentMonth}`;
  const isNewPayroll = !localStorage.getItem(key);
  const d={}; PFIELDS.forEach(f=>{d[f]=document.getElementById(f)?.value||0;}); d._net=window._calc?.net||0;
  localStorage.setItem(key,JSON.stringify(d));

  // dirty 리셋 + 버튼 색 복구
  payrollDirty = false;
  const saveBtn = document.getElementById('btn-save');
  if(saveBtn) { saveBtn.style.background = ''; saveBtn.style.borderColor = ''; }

  // 저장 직후 띠·지급완료 버튼 즉시 갱신 (GAS 응답 대기 불필요)
  _payrollDataStatus = 'saved';
  _updatePayrollStatus('saved');
  renderPaidBtn();

  const logTarget = `${emp.name} (${currentYear}/${String(currentMonth).padStart(2,'0')})`;
  if(gasUrl && window._calc) {
    // window._calc: 입력값(PFIELD 11개) + 계산값(10개) 전체 포함 (recalc()가 보장)
    fetch(gasUrl,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({type:'payroll',year:currentYear,month:currentMonth,no:emp.no,name:emp.name,...window._calc,...(typeof gasWriteAuth==='function'?gasWriteAuth():{})}),mode:'no-cors'})
      .then(()=>{
        showToast(LANG==='JP'?'Google スプレッドシートに保存しました ✓':'Google 스프레드시트에 저장됨 ✓','s');
        gasAppendLog(isNewPayroll ? '급여추가' : '급여수정', logTarget, '성공', '');
      })
      .catch(()=>{
        showToast(LANG==='JP'?'ローカルのみ保存しました':'로컬만 저장됨','w');
        gasAppendLog(isNewPayroll ? '급여추가' : '급여수정', logTarget, '실패', 'GAS 전송 오류');
      });
  } else {
    showToast(LANG==='JP'?`${emp.name} ${currentMonth}月分を保存しました ✓`:`${emp.name} ${currentMonth}월분 저장됨 ✓`,'s');
    gasAppendLog(isNewPayroll ? '급여추가' : '급여수정', logTarget, '성공', '로컬만 저장');
  }
}

// ══ PAID STATUS ══
function renderPaidBtn() {
  const btn = document.getElementById('btn-mark-paid');
  if (!btn) return;
  const ym = `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
  const isPaid = paidYMs.has(ym);
  const span = document.getElementById('t-mark-paid-btn');
  const jp = LANG === 'JP';
  const isSaved = _payrollDataStatus === 'saved'; // 저장 완료 상태에서만 지급완료 가능
  if (isPaid) {
    // 이미 지급완료 — 재처리 방지
    if (span) span.textContent = jp ? '✓ 支払い完了' : '✓ 지급 완료';
    btn.disabled = true;
    btn.style.opacity = '0.55';
    btn.style.cursor = 'default';
  } else if (isSaved) {
    // 저장 완료 — 지급완료 가능
    if (span) span.textContent = jp ? '🔒 支払い確定' : '🔒 지급 확정';
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.cursor = '';
  } else {
    // 임시값·미저장·미선택 — 비활성
    if (span) span.textContent = jp ? '🔒 支払い確定' : '🔒 지급 확정';
    btn.disabled = true;
    btn.style.opacity = '0.4';
    btn.style.cursor = 'not-allowed';
  }
  // 상태 띠 + 입력 잠금 동기화 (markMonthAsPaid 직후 호출 시 즉시 반영)
  if (_payrollDataStatus !== 'none') {
    _updatePayrollStatus(isPaid ? 'paid' : _payrollDataStatus);
    _applyPaidLock(isPaid);
  }
}

async function markMonthAsPaid() {
  if (typeof isWriteAuthorized === 'function' && !isWriteAuthorized()) {
    showToast(LANG === 'JP' ? '管理者のみ操作できます' : '관리자만 사용 가능합니다', 'w');
    return;
  }
  const ym = `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
  if (paidYMs.has(ym)) {
    showToast(LANG === 'JP' ? '既に支払済みです' : '이미 지급완료된 달입니다', 'w');
    return;
  }
  const jp = LANG === 'JP';
  const msg = jp
    ? `${currentYear}年${currentMonth}月分の給与を支払済み処理します。全従業員が対象で、この時点のデータがスナップショットとして保存されます。続けますか？`
    : `${currentYear}년 ${currentMonth}월분 급여를 지급완료 처리합니다. 전 직원이 대상이며, 이 시점의 데이터가 스냅샷으로 보존됩니다. 계속하시겠습니까？`;
  if (!confirm(msg)) return;

  // 이 달 전 사원의 급여 데이터 수집 + 계산값 포함
  const paidAt = new Date().toISOString();
  const snapPayrolls = [];
  employees.forEach(emp => {
    const pNo = String(emp.no).padStart(4, '0');
    const key = `kyuyo_p_${pNo}_${currentYear}_${currentMonth}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      const c = calcPayrollData(saved, emp, currentYear, currentMonth);
      const { koyoEnabled: _ke, r: _r, ...fields } = c;
      snapPayrolls.push({ no: emp.no, name: emp.name, year: currentYear, month: currentMonth, ...fields });
    } catch(e) {}
  });

  if (snapPayrolls.length === 0) {
    showToast(jp ? 'この月の給与データがありません' : '이 달 저장된 급여 데이터가 없습니다', 'w');
    return;
  }

  // GAS 전송
  if (gasUrl) {
    const auth = typeof gasWriteAuth === 'function' ? gasWriteAuth() : {};
    try {
      await fetch(gasUrl, {
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          type: 'markPaid',
          year: currentYear, month: currentMonth,
          paidAt,
          paidBy: (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.name || currentUser.id || '') : '',
          payrolls: snapPayrolls,
          ...auth
        })
      });
    } catch(e) {
      showToast(jp ? 'GAS送信失敗。ローカルのみ更新します' : 'GAS 전송 실패. 로컬만 업데이트합니다', 'w');
    }
  }

  // 로컬 상태 업데이트
  paidYMs.add(ym);
  localStorage.setItem(LS.paidYMs, JSON.stringify([...paidYMs]));
  paidDetails[ym] = paidAt;
  localStorage.setItem(LS.paidDetails, JSON.stringify(paidDetails));
  renderPaidBtn();
  showToast(jp ? `${currentYear}年${currentMonth}月分 支払済み処理完了 ✓` : `${currentYear}년 ${currentMonth}월분 지급완료 처리됨 ✓`, 's');
  gasAppendLog('지급완료', `${currentYear}/${String(currentMonth).padStart(2,'0')} (${snapPayrolls.length}명)`, '성공', '');
}
