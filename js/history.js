// 수정: 2026-06-19 15:45 — 임금대장 기간 지정 기능 추가 (기간 모드: 시작 연월 선택 → 12개월 자동 산출)
'use strict';
let _histEmpSelCache  = 'none'; // 직전 선택값 기억 (페이지 내 이동 시 복원)
let _annualInclLeft   = false;  // false = 재직자만 표시 (기본), true = 퇴사자 포함
let _annualCustomMode = false;  // false = 연도 모드(기본), true = 기간 지정 모드

function getAvailableAnnualYears() {
  const years = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const m = key.match(/^kyuyo_p_\d{4}_(\d{4})_(\d{1,2})$/);
    if (!m) continue;
    const y = parseInt(m[1]);
    const mo = parseInt(m[2]);
    years.add(mo === 12 ? y + 1 : y);
  }
  return Array.from(years).sort((a, b) => b - a);
}

function buildAnnualYearSel() {
  const sel = document.getElementById('annualYearSel');
  if(!sel) return;
  const jp = LANG === 'JP';
  const prev = sel.value;
  const years = getAvailableAnnualYears();
  sel.innerHTML = '';
  years.forEach(y => {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = jp ? `${y}年度` : `${y}년도`;
    sel.appendChild(o);
  });
  if(years.map(String).includes(prev)) sel.value = prev;
  else if(years.length) sel.value = String(years[0]);
  _buildAnnualCustomStartSel();
}

// 기간 지정 모드 시작 연월 셀렉터 초기화 (admin 전용)
function _buildAnnualCustomStartSel() {
  const ySel = document.getElementById('annualCustomStartYear');
  const mSel = document.getElementById('annualCustomStartMonth');
  if (!ySel || !mSel) return;
  const jp = LANG === 'JP';

  // 연도: localStorage 급여 데이터 기준 최소~최대 연도
  const allYears = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const m = k && k.match(/^kyuyo_p_\d{4}_(\d{4})_\d{1,2}$/);
    if (m) allYears.add(parseInt(m[1]));
  }
  const years = Array.from(allYears).sort((a, b) => b - a);

  const prevY = ySel.value;
  ySel.innerHTML = '';
  years.forEach(y => {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = jp ? `${y}年` : `${y}년`;
    ySel.appendChild(o);
  });
  if (years.map(String).includes(prevY)) ySel.value = prevY;
  else if (years.length) ySel.value = String(years[0]);

  // 월: 1~12
  const prevM = mSel.value;
  mSel.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = jp ? `${m}月` : `${m}월`;
    mSel.appendChild(o);
  }
  // 기본값: 7월 (후생연금 제출용 7~6월 기준)
  if (prevM && parseInt(prevM) >= 1 && parseInt(prevM) <= 12) mSel.value = prevM;
  else mSel.value = '7';

  _updateAnnualCustomEndLabel();
}

// 종료 연월 라벨 업데이트 (시작 +11개월)
function _updateAnnualCustomEndLabel() {
  const ySel = document.getElementById('annualCustomStartYear');
  const mSel = document.getElementById('annualCustomStartMonth');
  const label = document.getElementById('annualCustomEndLabel');
  if (!ySel || !mSel || !label) return;
  const jp = LANG === 'JP';
  const sy = parseInt(ySel.value), sm = parseInt(mSel.value);
  if (isNaN(sy) || isNaN(sm)) { label.textContent = ''; return; }
  // 시작 연월부터 12개월 → 종료 = +11개월
  const totalM = (sy - 1) * 12 + sm + 11;
  const ey = Math.floor((totalM - 1) / 12) + 1;
  const em = ((totalM - 1) % 12) + 1;
  label.textContent = jp ? `〜 ${ey}年${em}月（12ヶ月）` : `~ ${ey}년 ${em}월 (12개월)`;
}

// 기간 지정 모드 토글 (admin 전용)
function toggleAnnualCustomMode() {
  _annualCustomMode = !_annualCustomMode;
  const btn     = document.getElementById('annualCustomModeBtn');
  const sels    = document.getElementById('annualCustomSels');
  const yearSel = document.getElementById('annualYearSel');
  const jp      = LANG === 'JP';
  if (_annualCustomMode) {
    if (btn) {
      btn.style.background   = 'var(--accent2)';
      btn.style.color        = 'var(--accent)';
      btn.style.borderColor  = 'var(--accent)';
      btn.textContent        = jp ? '期間指定中' : '기간 지정 중';
    }
    if (sels)    sels.style.display    = 'flex';
    if (yearSel) yearSel.style.display = 'none';
    _updateAnnualCustomEndLabel();
  } else {
    if (btn) {
      btn.style.background   = 'transparent';
      btn.style.color        = 'var(--text2)';
      btn.style.borderColor  = 'var(--border)';
      btn.textContent        = jp ? '期間指定' : '기간 지정';
    }
    if (sels)    sels.style.display    = 'none';
    if (yearSel) yearSel.style.display = '';
  }
  renderAnnual();
}

// 현재 모드에 따른 fiscalMonths 배열 반환 (항상 12개월)
function getAnnualFiscalMonths() {
  if (_annualCustomMode) {
    const sy = parseInt(document.getElementById('annualCustomStartYear')?.value);
    const sm = parseInt(document.getElementById('annualCustomStartMonth')?.value);
    if (!isNaN(sy) && !isNaN(sm)) {
      return Array.from({ length: 12 }, (_, i) => {
        const totalM = (sy - 1) * 12 + sm + i;
        return { year: Math.floor((totalM - 1) / 12) + 1, month: ((totalM - 1) % 12) + 1 };
      });
    }
  }
  // 기본: 연도 모드 (전년12 + 당해1~11)
  const year = parseInt(document.getElementById('annualYearSel')?.value) || new Date().getFullYear();
  return [
    { year: year - 1, month: 12 },
    ...Array.from({ length: 11 }, (_, i) => ({ year, month: i + 1 }))
  ];
}

// admin 전용 기간 지정 UI 표시 (initApp에서 호출)
function showAnnualCustomWrap() {
  const wrap = document.getElementById('annualCustomWrap');
  if (wrap) wrap.style.display = 'flex';
}

// 체크리스트 빌드 — 이전 선택 유지 (첫 빌드 시 첫 번째 활성 사원 선택)
function buildAnnualEmpSel() {
  const list = document.getElementById('annualEmpCheckList');
  if (!list) return;
  const isFirstBuild = list.children.length === 0;
  const prevNos = new Set(getSelectedAnnualNos().map(String));
  list.innerHTML = '';
  const today = new Date().toISOString().slice(0, 10);
  employees.forEach(e => {
    if (!e || e.no == null) return;
    if (!_annualInclLeft && e.leave && e.leave < today) return;
    const noStr = String(e.no);
    // 최초 진입 시 아무도 선택하지 않음 (이전 선택 상태 유지)
    const checked = isFirstBuild ? false : prevNos.has(noStr);
    const label = document.createElement('label');
    label.dataset.no = noStr;
    label.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 6px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;user-select:none;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = noStr;
    cb.checked = checked;
    cb.style.cssText = 'width:15px;height:15px;flex-shrink:0;cursor:pointer;accent-color:var(--accent);';
    cb.addEventListener('change', updateAnnualSelSummary);
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    const _jp = LANG === 'JP';
    nameSpan.textContent = _jp && e.kana ? `${e.name}（${e.kana}）` : e.name;
    const noSpan = document.createElement('span');
    noSpan.style.cssText = 'color:var(--text3);font-size:12px;font-variant-numeric:tabular-nums;';
    noSpan.textContent = String(e.no).padStart(4, '0');
    label.appendChild(cb);
    label.appendChild(nameSpan);
    label.appendChild(noSpan);
    list.appendChild(label);
  });
  updateAnnualSelSummary();
}

// 현재 체크된 사원번호 배열 반환
function getSelectedAnnualNos() {
  return Array.from(
    document.querySelectorAll('#annualEmpCheckList input[type="checkbox"]:checked')
  ).map(cb => parseInt(cb.value));
}

// 드롭다운 버튼 텍스트·뱃지 갱신
function updateAnnualSelSummary() {
  const nos = getSelectedAnnualNos();
  const jp = LANG === 'JP';
  const labelEl = document.getElementById('annualEmpSelLabel');
  const countEl = document.getElementById('annualEmpSelCount');
  if (!labelEl) return;
  if (nos.length === 0) {
    labelEl.textContent = jp ? '従業員選択' : '사원 선택';
    if (countEl) countEl.style.display = 'none';
  } else if (nos.length === 1) {
    const emp = employees.find(e => parseInt(e.no) === nos[0]);
    labelEl.textContent = emp ? emp.name : (jp ? '1名' : '1명');
    if (countEl) { countEl.textContent = '1'; countEl.style.display = ''; }
  } else {
    labelEl.textContent = jp ? '従業員選択' : '사원 선택';
    if (countEl) { countEl.textContent = nos.length; countEl.style.display = ''; }
  }
}

// 드롭다운 열기/닫기
function toggleAnnualEmpDrop(e) {
  e.stopPropagation();
  const drop = document.getElementById('annualEmpDrop');
  if (!drop) return;
  const opening = drop.style.display === 'none' || drop.style.display === '';
  drop.style.display = opening ? 'block' : 'none';
  if (opening) {
    const inp = document.getElementById('annualEmpSearch');
    if (inp) { inp.value = ''; inp.focus(); }
    filterAnnualEmpList();
  } else {
    renderAnnual();
  }
}

function closeAnnualEmpDrop() {
  const drop = document.getElementById('annualEmpDrop');
  if (!drop || drop.style.display === 'none') return;
  drop.style.display = 'none';
  renderAnnual();
}

// 이름·사번 검색 필터
function filterAnnualEmpList() {
  const q = (document.getElementById('annualEmpSearch')?.value || '').toLowerCase().trim();
  document.querySelectorAll('#annualEmpCheckList label').forEach(label => {
    const no = label.dataset.no || '';
    const emp = employees.find(e => String(e.no) === no);
    if (!emp) { label.style.display = 'none'; return; }
    const match = !q || emp.name.toLowerCase().includes(q) || String(emp.no).padStart(4,'0').includes(q);
    label.style.display = match ? 'flex' : 'none';
  });
}

// 전체 선택 / 해제 / 재직자만
function selectAllAnnualEmps() {
  document.querySelectorAll('#annualEmpCheckList label[style*="display: none"]').forEach(() => {});
  document.querySelectorAll('#annualEmpCheckList label:not([style*="display: none"]) input[type="checkbox"]').forEach(cb => cb.checked = true);
  updateAnnualSelSummary();
}
function clearAllAnnualEmps() {
  document.querySelectorAll('#annualEmpCheckList input[type="checkbox"]').forEach(cb => cb.checked = false);
  updateAnnualSelSummary();
}
function selectActiveOnlyAnnual() {
  const today = new Date().toISOString().slice(0, 10);
  document.querySelectorAll('#annualEmpCheckList label').forEach(label => {
    const no = label.dataset.no || '';
    const emp = employees.find(e => String(e.no) === no);
    const cb = label.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = !!emp && (!emp.leave || emp.leave >= today);
  });
  updateAnnualSelSummary();
}

function toggleAnnualInclLeft() {
  _annualInclLeft = !_annualInclLeft;
  const btn = document.getElementById('annualInclLeftBtn');
  if (btn) {
    btn.style.background  = _annualInclLeft ? 'var(--accent2)' : 'transparent';
    btn.style.color       = _annualInclLeft ? 'var(--accent)'  : 'var(--text2)';
    btn.style.borderColor = _annualInclLeft ? 'var(--accent)'  : 'var(--border)';
  }
  buildAnnualEmpSel();
}

// 외부 클릭 시 드롭다운 닫기
document.addEventListener('click', e => {
  const wrap = document.getElementById('annualEmpDropWrap');
  if (wrap && !wrap.contains(e.target)) closeAnnualEmpDrop();
});

// GAS import 시 숫자값으로 저장될 수 있으므로 string/number 모두 처리
function safeInt(v) { return parseInt(String(v == null ? '0' : v).replace(/,/g, '')) || 0; }

function calcMonthData(emp, year, month) {
  const key = `kyuyo_p_${String(emp.no).padStart(4,'0')}_${year}_${month}`;
  const s = localStorage.getItem(key);
  if(!s) return null;
  try {
    const d = JSON.parse(s);
    const base=safeInt(d['r-base']), ot=safeInt(d['r-ot']), kintai=safeInt(d['r-kintai']);
    const commute=safeInt(d['r-commute']), commutetax=safeInt(d['r-commutetax']);
    const kinmu=safeInt(d['r-kinmu']);
    const shokumu=safeInt(d['r-shokumu']), field=safeInt(d['r-field']);
    const jumin=safeInt(d['k-jumin']), nencho=safeInt(d['k-nencho']);
    const totalPay = base+ot-kintai+commute+commutetax+kinmu+shokumu+field;
    const hyo_override = safeInt(d['r-hyo']);
    const hyo = hyo_override > 0 ? hyo_override : getHyo(base-kintai+commute+commutetax+kinmu+shokumu+field);
    const r = getRatesForYM(year, month);
    const shahoParts = emp.shaho_start ? emp.shaho_start.split('-') : null;
    const shahoFrom = shahoParts ? parseInt(shahoParts[0])*100 + parseInt(shahoParts[1]) : 0;
    const shahoExempt = shahoFrom > 0 && (year*100 + month) < shahoFrom;
    const kenko  = shahoExempt ? 0 : Math.floor(hyo*r.kenko/100/2);
    const kaigo2 = shahoExempt ? 0 : (isKaigo(emp)?Math.floor(hyo*r.kaigo/100/2):0);
    const kodomo = shahoExempt ? 0 : Math.floor(hyo*r.kodomo/100/2);
    const nenkin = shahoExempt ? 0 : Math.floor(hyo*r.nenkin/100/2);
    const koyoEnabled = !shahoExempt && emp.koyo !== 'no';
    const koyo   = koyoEnabled ? Math.round(totalPay*r.koyo/100) : 0;
    const shakai=kenko+kaigo2+kodomo+nenkin+koyo;
    const shotokuBase = totalPay-commute-shakai;
    const fuyou = parseInt(emp.fuyouCount)||0;
    const isOtsu = (emp.shotokuKbn||'ko') === 'otsu';
    let shotoku = Math.max(0, calcShotoku(shotokuBase, fuyou, isOtsu, year, month));
    const totalKojo=shakai+shotoku+jumin+nencho;
    const net=totalPay-totalKojo;
    return {base,ot,kintai,commute,commutetax,kinmu,shokumu,field,totalPay,kenko,kaigo:kaigo2,kodomo,nenkin,koyo,shakai,shotoku,jumin,nencho,totalKojo,net};
  } catch(e){ return null; }
}

// 중도입사 주석 반환
function getJoinNote(emp, year, jp) {
  if (!emp.join) return '';
  const parts = emp.join.split('-');
  const jy = parseInt(parts[0]), jm = parseInt(parts[1]);
  if ((jy*100+jm) > (year-1)*100+12) {
    return jp ? `　入社日：${jy}年${jm}月` : `　입사일：${jy}년 ${jm}월`;
  }
  return '';
}

// 한 사원의 임금대장 표 + 요약바 HTML 반환 (지급완료 달 없으면 null)
// fiscalMonths: [{ year, month }, ...] 12개월 배열 (getAnnualFiscalMonths() 반환값)
function buildEmpTableHtml(emp, fiscalMonths, jp) {
  const mu = jp ? '月分' : '월분';
  const fmt = n => n.toLocaleString();
  const monthData = fiscalMonths.map(({year:y, month:m}) => calcMonthData(emp, y, m));

  // 각 달의 지급완료 여부
  const isPaid = fiscalMonths.map(({year:y, month:m}) =>
    paidYMs.has(`${y}-${String(m).padStart(2,'0')}`)
  );

  // 지급완료된 달에 데이터가 하나도 없으면 테이블 미표시
  if (!monthData.some((d, i) => d !== null && isPaid[i])) return null;

  // 항상 12열 전체 표시 (미확정·무데이터 달도 자리 유지)
  const showCount = fiscalMonths.length; // 12
  const cols = `grid-template-columns:110px repeat(${showCount},1fr) 86px;`;

  // 합계열은 지급완료된 달만 합산
  const sumKey = k => monthData.reduce((s,d,i) => s + (d && isPaid[i] ? d[k] : 0), 0);

  const payItems = [
    {key:'base',    label:jp?'基本給':'기본급'},
    {key:'kinmu',   label:jp?'勤務手当':'근무수당'},
    {key:'shokumu', label:jp?'職務手当':'직무수당'},
    {key:'field',   label:jp?'現場手当':'현장수당'},
    {key:'ot',      label:jp?'残業手当':'잔업수당'},
    {key:'commute', label:jp?'非課税通勤手当':'비과세 교통비'},
  ];
  const deductItems = [
    {key:'kenko',   label:jp?'健康保険料':'건강보험료'},
    {key:'kaigo',   label:jp?'介護保険料':'개호보험료'},
    {key:'kodomo',  label:jp?'子育て支援金':'아동육성지원금'},
    {key:'nenkin',  label:jp?'厚生年金':'후생연금'},
    {key:'koyo',    label:jp?'雇用保険':'고용보험'},
    {key:'shotoku', label:jp?'所得税':'소득세'},
    {key:'jumin',   label:jp?'住民税':'주민세'},
    {key:'nencho',  label:jp?'年末調整':'연말정산'},
  ];

  // 지급완료 + 데이터 있음 → 값 표시, 그 외 → 진짜 빈칸
  const blank = `<div></div>`;
  const valCell = val => val === 0
    ? `<div style="color:var(--text3)">0</div>`
    : `<div>${fmt(val)}</div>`;
  const cell = (i, key) => (monthData[i] && isPaid[i]) ? valCell(monthData[i][key]) : blank;
  const sumCell = k => `<div style="font-weight:600;">${fmt(sumKey(k))}</div>`;

  let html = `<div class="annual-scroll-wrap"><div class="annual-wrap">`;

  // 기간 지정 모드: 연도도 함께 표시 (다년도 걸칠 수 있으므로)
  const multiYear = fiscalMonths.some(f => f.year !== fiscalMonths[0].year);
  html += `<div class="annual-head-row" style="${cols}"><div>${jp?'項目':'항목'}</div>`;
  for(let i=0;i<showCount;i++) {
    const {year:y,month:m}=fiscalMonths[i];
    const lbl = multiYear
      ? (jp ? `${y}<br>${m}${mu}` : `${y}<br>${m}${mu}`)
      : (i===0 && m===12 && y===fiscalMonths[1]?.year-1)
        ? (jp?`前年<br>12${mu}`:`전년<br>12${mu}`)
        : `${m}${mu}`;
    html += `<div>${lbl}</div>`;
  }
  html += `<div>${jp?'合計':'합계'}</div></div>`;

  payItems.forEach(r => {
    html += `<div class="annual-data-row" style="${cols}"><div>${r.label}</div>`;
    for(let i=0;i<showCount;i++) html += cell(i, r.key);
    html += sumCell(r.key) + `</div>`;
  });
  html += `<div class="annual-data-row annual-subtotal-pay" style="${cols}"><div>${jp?'支給合計':'지급합계'}</div>`;
  for(let i=0;i<showCount;i++) html += (monthData[i] && isPaid[i]) ? `<div>${fmt(monthData[i].totalPay)}</div>` : blank;
  html += `<div style="font-weight:700;">${fmt(sumKey('totalPay'))}</div></div>`;

  deductItems.forEach(r => {
    html += `<div class="annual-data-row" style="${cols}"><div>${r.label}</div>`;
    for(let i=0;i<showCount;i++) html += cell(i, r.key);
    html += sumCell(r.key) + `</div>`;
  });
  html += `<div class="annual-data-row annual-subtotal-deduct" style="${cols}"><div>${jp?'控除合計':'공제합계'}</div>`;
  for(let i=0;i<showCount;i++) html += (monthData[i] && isPaid[i]) ? `<div>${fmt(monthData[i].totalKojo)}</div>` : blank;
  html += `<div style="font-weight:700;">${fmt(sumKey('totalKojo'))}</div></div>`;

  html += `<div class="annual-data-row annual-net-row" style="${cols}"><div>${jp?'差引支給額':'차인지급액'}</div>`;
  for(let i=0;i<showCount;i++) html += (monthData[i] && isPaid[i]) ? `<div>¥${fmt(monthData[i].net)}</div>` : blank;
  html += `<div>¥${fmt(sumKey('net'))}</div></div>`;
  html += `</div></div>`;

  html += `<div style="margin-top:12px;background:var(--accent2);border:1px solid var(--accent3);border-radius:var(--r);padding:12px 16px;display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px;">`;
  html += `<span><strong>${jp?'年間支給合計':'연간 지급 합계'}:</strong> ¥${fmt(sumKey('totalPay'))}</span>`;
  html += `<span><strong>${jp?'年間控除合計':'연간 공제 합계'}:</strong> ¥${fmt(sumKey('totalKojo'))}</span>`;
  html += `<span style="font-size:14px;font-weight:700;color:var(--accent);"><strong>${jp?'年間手取り合計':'연간 실수령 합계'}:</strong> ¥${fmt(sumKey('net'))}</span>`;
  html += `</div>`;
  return html;
}

function renderAnnual() {
  const jp = LANG==='JP';
  const ph = document.getElementById('annualPrintHeader');
  const placeholder = document.getElementById('annualPlaceholder');
  const content = document.getElementById('annualContent');

  const showPlaceholder = () => {
    if(placeholder) placeholder.style.display = 'flex';
    if(content) content.style.display = 'none';
    ph.style.display = 'none';
  };
  const showContent = () => {
    if(placeholder) placeholder.style.display = 'none';
    if(content) content.style.display = '';
  };

  if (!employees.length) {
    showPlaceholder();
    return;
  }

  const selectedNos = getSelectedAnnualNos();
  const fiscalMonths = getAnnualFiscalMonths();
  const today = jp ? new Date().toLocaleDateString('ja-JP') : new Date().toLocaleDateString('ko-KR');
  const noDataMsg = `<div style="padding:40px;text-align:center;color:var(--text3);">${jp?'この期間のデータがありません':'이 기간의 데이터가 없습니다'}</div>`;

  // 타이틀용 기간 문자열
  const _fm0 = fiscalMonths[0], _fmL = fiscalMonths[fiscalMonths.length - 1];
  const periodLabel = _annualCustomMode
    ? (jp ? `${_fm0.year}年${_fm0.month}月〜${_fmL.year}年${_fmL.month}月` : `${_fm0.year}년 ${_fm0.month}월~${_fmL.year}년 ${_fmL.month}월`)
    : (jp ? `${parseInt(document.getElementById('annualYearSel')?.value)||''}年度` : `${parseInt(document.getElementById('annualYearSel')?.value)||''}년도`);

  if (selectedNos.length === 0) {
    showPlaceholder();
    return;
  }
  showContent();

  // 단일 사원: 고정 헤더 방식
  if (selectedNos.length === 1) {
    const emp = employees.find(e => parseInt(e.no) === selectedNos[0]);
    if (!emp) { ph.style.display='none'; document.getElementById('annualContent').innerHTML=noDataMsg; return; }
    ph.style.display = 'block';
    const _nameKana1 = jp && emp.kana ? `${emp.name}（${emp.kana}）` : emp.name;
    document.getElementById('annualPrintTitle').textContent =
      `${_nameKana1}（${String(emp.no).padStart(4,'0')}） ${periodLabel} ${jp?'賃金台帳':'임금 대장'}`;
    document.getElementById('annualPrintSub').textContent =
      (jp?`出力日：${today}`:`출력일：${today}`);
    document.getElementById('annualContent').innerHTML = buildEmpTableHtml(emp, fiscalMonths, jp) || noDataMsg;
    return;
  }

  // 복수 사원: 인라인 헤더 + 페이지 구분
  ph.style.display = 'none';
  let allHtml = '';
  let count = 0;
  selectedNos.forEach(no => {
    const emp = employees.find(e => parseInt(e.no) === no);
    if (!emp) return;
    const tableHtml = buildEmpTableHtml(emp, fiscalMonths, jp);
    if (!tableHtml) return;
    const _nameKana2 = jp && emp.kana ? `${emp.name}（${emp.kana}）` : emp.name;
    const title = `${_nameKana2}（${String(emp.no).padStart(4,'0')}） ${periodLabel} ${jp?'賃金台帳':'임금 대장'}`;
    const sub = jp?`出力日：${today}`:`출력일：${today}`;
    allHtml += `<div class="annual-emp-block${count>0?' annual-page-break':''}">` +
      `<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px;margin-bottom:10px;">` +
      `<div style="font-size:16px;font-weight:700;">${title}</div>` +
      `<div style="font-size:12px;color:#666;">${sub}</div></div>` +
      tableHtml + `</div>`;
    count++;
  });
  document.getElementById('annualContent').innerHTML = allHtml || noDataMsg;
}

// ══ HISTORY ══
function buildHistEmpSel() {
  const sel=document.getElementById('histEmpSel');
  if(!sel) return;
  const _jp = LANG==='JP';
  sel.innerHTML=`<option value="none">${_jp?'── 従業員選択 ──':'── 사원 선택 ──'}</option><option value="all">${_jp?'全員':'전체'}</option>`;
  employees.forEach((e,i)=>{ if(!e||e.no==null) return; const o=document.createElement('option'); o.value=i; const _jp=LANG==='JP'; o.textContent=_jp&&e.kana?`${String(e.no).padStart(4,'0')} ${e.name}（${e.kana}）`:`${String(e.no).padStart(4,'0')} ${e.name}`; sel.appendChild(o); });
  if (_histEmpSelCache !== 'none') sel.value = _histEmpSelCache;
}

function renderHistory() {
  const container = document.getElementById('historyContainer');
  if (!container) return;
  const empSel = document.getElementById('histEmpSel').value;
  _histEmpSelCache = empSel;

  const ph   = document.getElementById('historyPlaceholder');
  const card = document.getElementById('historyCard');

  if (empSel === 'none') {
    if (ph)   ph.style.display = 'flex';
    if (card) card.style.display = 'none';
    return;
  }
  if (ph)   ph.style.display = 'none';
  if (card) card.style.display = '';

  const year = parseInt(document.getElementById('histYearSel').value);
  container.innerHTML = '';
  const rows = [];
  employees.forEach((emp, ei) => {
    if (empSel !== 'all' && empSel !== 'none' && parseInt(empSel) !== ei) return;
    for (let m = 1; m <= 12; m++) {
      const s = localStorage.getItem(`kyuyo_p_${String(emp.no).padStart(4,'0')}_${year}_${m}`);
      if (!s) continue;
      try { rows.push({m, emp, d: JSON.parse(s)}); } catch(e) {}
    }
  });

  const jp = LANG === 'JP';
  const mu = jp ? '月分' : '월분';

  if (!rows.length) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:25px;color:var(--text3);">${jp ? 'データがありません' : '데이터 없음'}</div>`;
    return;
  }

  const v = n => n === 0 ? '' : n.toLocaleString();

  // 사원별 그룹핑 (순서 유지)
  const empMap = new Map();
  const empOrder = [];
  rows.forEach(row => {
    if (!empMap.has(row.emp.no)) {
      empMap.set(row.emp.no, {emp: row.emp, months: []});
      empOrder.push(row.emp.no);
    }
    empMap.get(row.emp.no).months.push(row);
  });

  const theadHtml =
    `<thead><tr>` +
    `<th>${jp?'月':'월'}</th>` +
    `<th>${jp?'支給合計':'지급총액'}</th><th>${jp?'基本給':'기본급'}</th><th>${jp?'勤務手当':'근무수당'}</th><th>${jp?'職務手当':'직무수당'}</th><th>${jp?'現場手当':'현장수당'}</th><th>${jp?'残業手当':'잔업수당'}</th><th>${jp?'非課税通勤手当':'비과세교통비'}</th>` +
    `<th>${jp?'控除合計':'공제총액'}</th><th>${jp?'健康保険':'건강보험'}</th><th>${jp?'介護保険':'개호보험'}</th><th>${jp?'子ども':'자녀육아'}</th><th>${jp?'厚生年金':'후생연금'}</th><th>${jp?'雇用保険':'고용보험'}</th><th>${jp?'所得税':'소득세'}</th><th>${jp?'住民税':'주민세'}</th><th>${jp?'年末調整':'연말정산'}</th>` +
    `<th>${jp?'実支給額':'실수령액'}</th>` +
    `</tr></thead>`;

  empOrder.forEach(no => {
    const {emp, months} = empMap.get(no);
    const _nameKana = jp && emp.kana ? `${emp.name}（${emp.kana}）` : emp.name;
    const _no = String(emp.no).padStart(4, '0');

    const section = document.createElement('div');
    section.className = 'hist-emp-section';

    const titleBar = document.createElement('div');
    titleBar.className = 'hist-emp-title-bar';
    titleBar.innerHTML = `<span class="hist-emp-label-no">${_no}</span><span class="hist-emp-label">${_nameKana}</span>`;
    section.appendChild(titleBar);

    const scrollWrap = document.createElement('div');
    scrollWrap.style.overflowX = 'auto';

    const table = document.createElement('table');
    table.className = 'history-table';
    table.innerHTML = theadHtml;

    const tbody = document.createElement('tbody');
    months.forEach(({m, emp: rowEmp, d}) => {
      const base=safeInt(d['r-base']),ot=safeInt(d['r-ot']);
      const kintai=safeInt(d['r-kintai']),commute=safeInt(d['r-commute']),commutetax=safeInt(d['r-commutetax']),kinmu=safeInt(d['r-kinmu']),shokumu=safeInt(d['r-shokumu']),field=safeInt(d['r-field']);
      const jumin=safeInt(d['k-jumin']),nencho=safeInt(d['k-nencho']),hyo_override=safeInt(d['r-hyo']);
      const {totalPay,kenko,kaigo,kodomo,nenkin,koyo,shotoku,totalKojo,net}=calcPayrollBreakdown(rowEmp,{base,ot,kintai,commute,commutetax,kinmu,shokumu,field,hyo_override,jumin,nencho},year,m);
      const tr = document.createElement('tr');
      tr.onclick = () => {
        currentEmpIdx = employees.indexOf(rowEmp); currentMonth = m;
        gotoPage('payroll', document.querySelector('.nav-item'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector('.nav-item').classList.add('active');
        renderMonthTabs(); loadPayrollForm();
      };
      tr.innerHTML =
        `<td>${m}${mu}</td>`+
        `<td>${v(totalPay)}</td>`+`<td>${v(base)}</td>`+`<td>${v(kinmu)}</td>`+`<td>${v(shokumu)}</td>`+`<td>${v(field)}</td>`+`<td>${v(ot)}</td>`+`<td>${v(commute)}</td>`+
        `<td>${v(totalKojo)}</td>`+`<td>${v(kenko)}</td>`+`<td>${v(kaigo)}</td>`+`<td>${v(kodomo)}</td>`+`<td>${v(nenkin)}</td>`+`<td>${v(koyo)}</td>`+`<td>${v(shotoku)}</td>`+`<td>${v(jumin)}</td>`+`<td>${v(nencho)}</td>`+
        `<td>${v(net)}</td>`;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    scrollWrap.appendChild(table);
    section.appendChild(scrollWrap);
    container.appendChild(section);
  });
}
