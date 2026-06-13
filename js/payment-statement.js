// 수정: 2026-06-13 18:43 — 원천세 납부서 집계 기능 추가
'use strict';

let _psYear = null;
let _psHalf = null;
let _psInitialized = false;

function _getDefaultPsHalf() {
  const now = new Date();
  const m = now.getMonth() + 1;
  if (m <= 6) return { year: now.getFullYear() - 1, half: 2 };
  return { year: now.getFullYear(), half: 1 };
}

function initPaymentStatement() {
  if (!_psInitialized) {
    const def = _getDefaultPsHalf();
    _psYear = def.year;
    _psHalf = def.half;
    _psInitialized = true;
  }
  buildPsYearSel();
  _setPsHalfRadio(_psHalf);
  renderPaymentStatement();
}

function buildPsYearSel() {
  const sel = document.getElementById('psYearSel');
  if (!sel) return;
  const jp = LANG === 'JP';
  const years = (typeof getAvailableAnnualYears === 'function') ? getAvailableAnnualYears() : [];
  if (!years.length) {
    const cur = new Date().getFullYear();
    for (let y = cur; y >= cur - 2; y--) years.push(y);
  }
  const prev = _psYear;
  sel.innerHTML = '';
  years.forEach(y => {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = `${y}${jp ? '年' : '년'}`;
    sel.appendChild(o);
  });
  if (years.includes(prev)) { sel.value = String(prev); }
  else if (years.length) { _psYear = years[0]; sel.value = String(years[0]); }
}

function _setPsHalfRadio(half) {
  const r = document.querySelector(`input[name="ps-half"][value="${half}"]`);
  if (r) r.checked = true;
}

function onPsYearChange() {
  _psYear = parseInt(document.getElementById('psYearSel')?.value) || _psYear;
  renderPaymentStatement();
}

function onPsHalfChange() {
  const checked = document.querySelector('input[name="ps-half"]:checked');
  _psHalf = checked ? parseInt(checked.value) : 1;
  renderPaymentStatement();
}

function _psNumInput(id) {
  const el = document.getElementById(id);
  if (!el || el.value === '') return 0;
  return parseInt(el.value.replace(/,/g, '')) || 0;
}

function calcPsTotals() {
  const kyuyo_zei = parseInt(
    (document.getElementById('ps-kyuyo-zei')?.textContent || '0').replace(/,/g, '')
  ) || 0;
  const shoyo_zei    = _psNumInput('ps-shoyo-zei');
  const hiyatoi_zei  = _psNumInput('ps-hiyatoi-zei');
  const taisyoku_zei = _psNumInput('ps-taisyoku-zei');
  const yakuin_zei   = _psNumInput('ps-yakuin-zei');
  const nencho_fusoku = _psNumInput('ps-nencho-fusoku');
  const nencho_choka  = _psNumInput('ps-nencho-choka');
  const entai         = _psNumInput('ps-entai');

  const honzei = kyuyo_zei + shoyo_zei + hiyatoi_zei + taisyoku_zei + yakuin_zei + nencho_fusoku - nencho_choka;
  const goukei = honzei + entai;

  const honzeiEl = document.getElementById('ps-honzei');
  const goukeiEl = document.getElementById('ps-goukei');
  if (honzeiEl) honzeiEl.textContent = honzei.toLocaleString();
  if (goukeiEl) goukeiEl.textContent = goukei.toLocaleString();
}

function renderPaymentStatement() {
  const year = _psYear;
  const half = _psHalf;
  if (!year || !half) return;

  const months = half === 1 ? [1,2,3,4,5,6] : [7,8,9,10,11,12];
  const startM  = months[0];
  const endM    = months[months.length - 1];

  let ninzuu   = 0;
  let shiharai = 0;
  let zeiGaku  = 0;

  employees.forEach(emp => {
    months.forEach(month => {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      if (!paidYMs.has(ym)) return;
      const data = calcMonthData(emp, year, month);
      if (!data) return;
      ninzuu++;
      shiharai += (data.totalPay - data.commute);
      zeiGaku  += data.shotoku;
    });
  });

  const wr    = year - 2018; // 令和
  const wrStr = String(wr).padStart(2, '0');
  const smStr = String(startM).padStart(2, '0');
  const emStr = String(endM).padStart(2, '0');
  const dateStr = `令和${wrStr}年${smStr}月10日〜${emStr}月10日`;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setEl('ps-shiharai-date',   dateStr);
  setEl('ps-kyuyo-ninzuu',    ninzuu.toLocaleString());
  setEl('ps-kyuyo-shiharai',  shiharai.toLocaleString());
  setEl('ps-kyuyo-zei',       zeiGaku.toLocaleString());
  setEl('ps-jiku-from',       `令和${wrStr}年${smStr}月`);
  setEl('ps-jiku-to',         `令和${wrStr}年${emStr}月`);

  calcPsTotals();
}
