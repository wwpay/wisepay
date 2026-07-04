// 귀속월→지급월 매핑: 3월분→4월지급, 4월분→5월지급, 5월분→6월지급
'use strict';

let _santeiConfig = {};   // GAS config 시트에서 로드한 事業所情報
let _santeiYear   = new Date().getFullYear();

// ── 元号 변환 (生年月日 표기) ─────────────────────────────────────────────
// 형식: {元号コード}-{年度2자리}{月2자리}{日2자리}  예) 5-500307 = 昭和50年3月7日
// 元号코드: 昭和=5, 平成=7, 令和=9
function toWareki(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  let code, eraYear;
  if (dt >= new Date(2019, 4, 1))   { code = 9; eraYear = y - 2018; }
  else if (dt >= new Date(1989, 0, 8)) { code = 7; eraYear = y - 1988; }
  else if (dt >= new Date(1926, 11, 25)) { code = 5; eraYear = y - 1925; }
  else return dateStr;
  return `${code}-${eraYear}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`;
}

// ── 月의 역일수 ─────────────────────────────────────────────────────────────
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// ── localStorage에서 귀속월 총지급액 계산 ──────────────────────────────────
// 귀속월 year/month 기준 (예: 3월분 데이터로 4월지급분 계산)
function getSanteiTotalPay(empNo, year, month) {
  const pNo = String(empNo).padStart(4, '0');
  const key = `kyuyo_p_${pNo}_${year}_${month}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    const emp = (typeof employees !== 'undefined')
      ? employees.find(e => String(e.no).padStart(4,'0') === pNo) : null;
    const c = calcPayrollData(d, emp || null, year, month);
    return c.totalPay != null ? c.totalPay : null;
  } catch(e) { return null; }
}

// ── 판정: 健保/厚年 標準報酬月額 ──────────────────────────────────────────
function judgeHyojun(avgYen) {
  const kenko  = getHyoKenko(avgYen);                       // 健保 (1~50等級)
  const nenkin = Math.min(getHyo(avgYen), 650000);          // 厚年 (上限650千円)
  return { kenko, nenkin };
}

// ── 페이지 초기화 ──────────────────────────────────────────────────────────
async function initSantei() {
  // 연도 셀렉터 설정
  const yr = new Date().getFullYear();
  _santeiYear = yr;
  const sel = document.getElementById('santei-year');
  if (sel) {
    sel.innerHTML = '';
    for (let y = yr; y >= yr - 3; y--) {
      const o = document.createElement('option');
      o.value = y; o.textContent = `${y}年（令和${y-2018}年）`;
      sel.appendChild(o);
    }
    sel.value = yr;
    sel.onchange = () => { _santeiYear = parseInt(sel.value); renderSantei(); };
  }

  // 事業所情報を GAS から読み込む
  const loadEl = document.getElementById('santei-loading');
  if (loadEl) loadEl.style.display = '';
  try {
    _santeiConfig = await fetchConfig();
  } catch(e) { _santeiConfig = {}; }
  if (loadEl) loadEl.style.display = 'none';

  renderSanteiOfficeInfo();
  renderSantei();
}

// ── 事業所情報 表示 ────────────────────────────────────────────────────────
function renderSanteiOfficeInfo() {
  const c = _santeiConfig;
  const el = document.getElementById('santei-office-info');
  if (!el) return;
  const seiri   = c.jigyosho_seiri   || '—';
  const address = c.jigyosho_address || '—';
  const name    = c.jigyosho_name    || '—';
  const owner   = c.jigyosho_owner   || '—';
  el.innerHTML =
    `<span>整理記号: <b>${seiri}</b></span>` +
    `<span style="margin-left:16px;">所在地: <b>${address}</b></span>` +
    `<span style="margin-left:16px;">名称: <b>${name}</b></span>` +
    `<span style="margin-left:16px;">事業主: <b>${owner}</b></span>`;
}

// ── 全員分レンダリング ─────────────────────────────────────────────────────
function renderSantei() {
  const year = _santeiYear;
  const container = document.getElementById('santei-rows');
  if (!container) return;
  container.innerHTML = '';

  // 재직 중인 직원만 (퇴직자 제외)
  const targets = (typeof employees !== 'undefined' ? employees : [])
    .filter(emp => !emp.leave || !emp.leave.trim())
    .sort((a, b) => {
      const an = parseInt(String(a.seiri_no || a.no || 0));
      const bn = parseInt(String(b.seiri_no || b.no || 0));
      return an - bn;
    });

  if (!targets.length) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);">従業員データがありません</div>';
    return;
  }

  targets.forEach(emp => {
    const block = buildSanteiBlock(emp, year);
    container.appendChild(block);
  });
}

// ── 1人分ブロック生成 ──────────────────────────────────────────────────────
function buildSanteiBlock(emp, year) {
  const pNo = String(emp.no).padStart(4, '0');

  // 귀속월 3·4·5월분 데이터 (지급월 4·5·6월에 대응)
  // [지급월표시, 귀속월, 역일수 기본값]
  const months = [
    { payMonth: 4, ataMonth: 3, defaultDays: daysInMonth(year, 3) },
    { payMonth: 5, ataMonth: 4, defaultDays: daysInMonth(year, 4) },
    { payMonth: 6, ataMonth: 5, defaultDays: daysInMonth(year, 5) },
  ];

  // 総지급액 미리 계산
  const pays = months.map(m => getSanteiTotalPay(emp.no, year, m.ataMonth));

  // 判定: 平均額(역일수17일 이상 달만) → 健保/厚年 등급
  const wrap = document.createElement('div');
  wrap.className = 'santei-block';
  wrap.dataset.empNo = pNo;

  // ── 상단: 기본정보 ───────────────────────────────────────────
  const tekiyo = `令和${year - 2018}年9月`; // ④適用年月は固定
  wrap.innerHTML = `
<div class="sb-head">
  <div class="sb-cell sb-seiri">
    <div class="sb-label">①整理番号</div>
    <div class="sb-value">${emp.seiri_no || '—'}</div>
  </div>
  <div class="sb-cell sb-name" style="flex:2;">
    <div class="sb-label">②氏名</div>
    <div class="sb-value">${emp.name || ''}</div>
  </div>
  <div class="sb-cell sb-birth">
    <div class="sb-label">③生年月日</div>
    <div class="sb-value">${toWareki(emp.birth)}</div>
  </div>
  <div class="sb-cell sb-tekiyo">
    <div class="sb-label">④適用年月</div>
    <div class="sb-value">${tekiyo}</div>
  </div>
</div>

<div class="sb-mid">
  <div class="sb-cell" style="flex:2;">
    <div class="sb-label">⑤従前の標準報酬月額</div>
    <div class="sb-value">健保 <b>${emp.hyojun_kenko ?? '—'}</b>千円 ／ 厚年 <b>${emp.hyojun_nenkin ?? '—'}</b>千円</div>
  </div>
  <div class="sb-cell">
    <div class="sb-label">⑦昇(降)給</div>
    <input class="sb-input" data-field="shoko" placeholder="—" oninput="recalcSanteiBlock(this)">
  </div>
  <div class="sb-cell">
    <div class="sb-label">⑧遡及支払額</div>
    <input class="sb-input" data-field="sokyu" placeholder="0" oninput="recalcSanteiBlock(this)">
  </div>
</div>

<div class="sb-body">
  <div class="sb-month-table">
    <div class="sb-month-header">
      <div class="sbm-label">支給月（귀속월）</div>
      <div class="sbm-col">⑩支払基礎日数</div>
      <div class="sbm-col">⑪通貨によるもの</div>
      <div class="sbm-col">⑫現物</div>
      <div class="sbm-col">⑬合計</div>
    </div>
    ${months.map((m, i) => {
      const pay = pays[i];
      const noData = pay === null;
      return `
    <div class="sb-month-row${noData ? ' sb-nodata' : ''}" data-pay-month="${m.payMonth}" data-ata-month="${m.ataMonth}">
      <div class="sbm-label">
        <span class="sbm-pay">${m.payMonth}月支給</span>
        <span class="sbm-ata">（${m.ataMonth}月分）</span>
      </div>
      <div class="sbm-col">
        <input class="sb-input sb-days" data-field="days" value="${m.defaultDays}" oninput="recalcSanteiBlock(this);markSanteiModified(this)">
      </div>
      <div class="sbm-col">
        <input class="sb-input sb-pay" data-field="tsuka" value="${noData ? '' : pay.toLocaleString()}" ${noData ? 'placeholder="データなし"' : ''} oninput="recalcSanteiBlock(this);markSanteiModified(this)">
      </div>
      <div class="sbm-col">
        <input class="sb-input sb-genbutsu" data-field="genbutsu" value="0" oninput="recalcSanteiBlock(this);markSanteiModified(this)">
      </div>
      <div class="sbm-col sb-gokei" data-field="gokei">
        ${noData ? '—' : (pay).toLocaleString()}
      </div>
    </div>`;
    }).join('')}
  </div>

  <div class="sb-right">
    <div class="sb-cell">
      <div class="sb-label">⑭総計（対象月合計）</div>
      <div class="sb-total" data-field="total">—</div>
    </div>
    <div class="sb-cell">
      <div class="sb-label">⑮平均額（円未満切捨）</div>
      <div class="sb-avg" data-field="avg">—</div>
    </div>
    <div class="sb-cell">
      <div class="sb-label">⑯修正平均額</div>
      <input class="sb-input sb-corrected" data-field="corrected" placeholder="—" oninput="recalcSanteiBlock(this)">
    </div>
    <div class="sb-cell sb-hantei" data-field="hantei">
      <div class="sb-label">新標準報酬月額 判定</div>
      <div class="sb-hantei-val">—</div>
    </div>
  </div>
</div>

<div class="sb-biko">
  <div class="sb-label">⑱備考</div>
  <input class="sb-input sb-biko-input" data-field="biko" placeholder="—">
</div>`;

  // 초기 계산 실행
  recalcSanteiBlock(wrap.querySelector('[data-field="days"]'));
  return wrap;
}

// ── 再計算 ─────────────────────────────────────────────────────────────────
function recalcSanteiBlock(trigger) {
  const block = trigger ? trigger.closest('.santei-block') : null;
  if (!block) return;

  const rows = block.querySelectorAll('.sb-month-row');
  let totalYen = 0, countMonths = 0;

  rows.forEach(row => {
    const daysEl  = row.querySelector('[data-field="days"]');
    const tsukaEl = row.querySelector('[data-field="tsuka"]');
    const genEl   = row.querySelector('[data-field="genbutsu"]');
    const gokeiEl = row.querySelector('[data-field="gokei"]');

    const days   = parseInt(daysEl?.value) || 0;
    const tsuka  = parseInt((tsukaEl?.value || '0').replace(/,/g, '')) || 0;
    const gen    = parseInt((genEl?.value  || '0').replace(/,/g, '')) || 0;
    const gokei  = tsuka + gen;

    if (gokeiEl) gokeiEl.textContent = tsuka === 0 && gen === 0 ? '—' : gokei.toLocaleString();

    // 支払基礎日数 17日以上のみ算入
    if (days >= 17 && (tsuka > 0 || gen > 0)) {
      totalYen += gokei;
      countMonths++;
    }

    // 算入対象月を視覚的に強調
    row.classList.toggle('sb-included', days >= 17 && (tsuka > 0 || gen > 0));
  });

  const totalEl  = block.querySelector('[data-field="total"]');
  const avgEl    = block.querySelector('[data-field="avg"]');
  const hanteiEl = block.querySelector('.sb-hantei-val');

  const avg = countMonths > 0 ? Math.floor(totalYen / countMonths) : 0;

  if (totalEl)  totalEl.textContent  = countMonths > 0 ? totalYen.toLocaleString() + ' 円' : '—';
  if (avgEl)    avgEl.textContent    = countMonths > 0 ? avg.toLocaleString() + ' 円' : '—';

  // ⑯修正平均額 があれば、そちらで판定
  const corrEl = block.querySelector('[data-field="corrected"]');
  const corrVal = parseInt((corrEl?.value || '').replace(/,/g, '')) || 0;
  const judgeBase = corrVal > 0 ? corrVal : avg;

  if (hanteiEl) {
    if (judgeBase > 0) {
      const j = judgeHyojun(judgeBase);
      hanteiEl.textContent =
        `健 ${(j.kenko/1000).toFixed(0)}千円 ／ 厚 ${(j.nenkin/1000).toFixed(0)}千円`;
      hanteiEl.style.color = 'var(--accent)';
    } else {
      hanteiEl.textContent = '—';
      hanteiEl.style.color = '';
    }
  }
}

// ── 수동 수정 셀 배경색 표시 ──────────────────────────────────────────────
function markSanteiModified(el) {
  el.dataset.modified = '1';
  el.style.background = '#fef9c3'; // 연노랑: 수동 수정 구분
}

// ── 事業所情報 편집 모달 ───────────────────────────────────────────────────
function openSanteiConfigModal() {
  const c = _santeiConfig;
  document.getElementById('sc-seiri').value   = c.jigyosho_seiri   || '';
  document.getElementById('sc-address').value = c.jigyosho_address || '';
  document.getElementById('sc-name').value    = c.jigyosho_name    || '';
  document.getElementById('sc-owner').value   = c.jigyosho_owner   || '';
  const modal = document.getElementById('modal-santei-config');
  if (modal) modal.style.display = 'flex';
}

function closeSanteiConfigModal() {
  const modal = document.getElementById('modal-santei-config');
  if (modal) modal.style.display = 'none';
}

async function saveSanteiConfig() {
  const entries = {
    jigyosho_seiri:   document.getElementById('sc-seiri').value.trim(),
    jigyosho_address: document.getElementById('sc-address').value.trim(),
    jigyosho_name:    document.getElementById('sc-name').value.trim(),
    jigyosho_owner:   document.getElementById('sc-owner').value.trim(),
  };
  const btn = document.getElementById('sc-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
  try {
    await saveConfigToGas(entries);
    _santeiConfig = { ..._santeiConfig, ...entries };
    renderSanteiOfficeInfo();
    closeSanteiConfigModal();
    showToast('事業所情報を保存しました ✓', 's');
  } catch(e) {
    showToast('保存に失敗しました: ' + e.message, 'e');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '保存'; }
  }
}
