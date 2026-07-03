// 수정: 2026-07-03 17:30 — 申告済概算保険料額 자동연계 추가 (전년도 概算額 auto-load, 수동 우선)
// 수정: 2026-07-03 16:41 — 労働保険 年度更新（概算・確定保険料申告書）作成補助 화면 신규 구현
// ─────────────────────────────────────────────────────────────────────────────
// 【집계 기준】 신고연도 Y(서기, 概算 대상 = 令和(Y-2018)年度)
//   ■ 確定 산정기간: 지급일 (Y-1).4 ~ Y.3  → WisePay 귀속월 (Y-1).3月分 ~ Y.2月分 (12개월)
//   ■ 概算 산정기간: Y.4 ~ (Y+1).3        → 기본값은 확정과 동일 임금총액, 수동 조정 가능
//   ■ 지급확정(paidYMs) 스냅샷만 집계. 통근수당 포함 totalPay = 労働保険 賃金総額
//   ■ 対象者: config「roudou_exclude_nos」에 등록된 사번(지점장=役員扱い) 제외한 전원
//             労災対象 = 除外사번 뺀 전원 / 雇用対象 = 그중 koyo!=='no'
//   ■ 同額케이스(記入例4): 労災기초액==雇用기초액이면 労働保険料 행에만 합산요율 1회 곱셈
// 【요율】 config 연도 접미사 키에서 로드 (確定=前年度키, 概算=当年度키)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

let _roudouConfig = {};                       // GAS config 시트 로드값
let _roudouYear   = new Date().getFullYear();  // 신고연도 Y (概算 대상 연도)
let _roudouState  = null;                      // 집계·수동조정 상태

// 요율 기본값 (config에 없을 때 초기값) — per mille(1/1000)
const ROUDOU_RATE_DEFAULT = {
  total:  { kakutei: 17.5, gaisan: 16.5 },   // 労働保険料 합산요율
  rousai: { kakutei: 3.0,  gaisan: 3.0  },   // 労災分
  koyo:   { kakutei: 14.5, gaisan: 13.5 },   // 雇用分
  ippan:  0.02,                              // 一般拠出金
};

// ── 유틸 ─────────────────────────────────────────────────────────────────────
function warekiYM(year, month) { return `令和${year - 2018}年${month}月`; }
function roudouParseNum(v) { return parseInt(String(v == null ? '' : v).replace(/[^\d-]/g, '')) || 0; }
function roudouParseFloat(v) { const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n; }
function senKiri(yen) { return Math.floor(yen / 1000); }          // 千円 미만 절사 → 千円 단위
function hokenryo(senYen, rate) { return Math.floor(senYen * rate); } // 千円 × per-mille = 円 (1엔 미만 절사)

// ── config 요율 로드 (연도 접미사, 당년도 없으면 전년도 복사) ─────────────────
function roudouRate(kind, kbn, forYear) {
  // kind: total/rousai/koyo, kbn: kakutei/gaisan, forYear: 該当 보험연도(서기)
  const c = _roudouConfig;
  const key = `roudou_rate_${forYear}_${kind}`;
  if (c[key] !== undefined && c[key] !== '') return roudouParseFloat(c[key]);
  // 전년도 값 폴백
  const prevKey = `roudou_rate_${forYear - 1}_${kind}`;
  if (c[prevKey] !== undefined && c[prevKey] !== '') return roudouParseFloat(c[prevKey]);
  return ROUDOU_RATE_DEFAULT[kind][kbn];
}
function roudouIppanRate(forYear) {
  const c = _roudouConfig;
  const key = `roudou_ippan_kyoshutsu_${forYear}`;
  if (c[key] !== undefined && c[key] !== '') return roudouParseFloat(c[key]);
  const prev = c[`roudou_ippan_kyoshutsu_${forYear - 1}`];
  if (prev !== undefined && prev !== '') return roudouParseFloat(prev);
  return ROUDOU_RATE_DEFAULT.ippan;
}
function roudouExcludeSet() {
  const raw = _roudouConfig.roudou_exclude_nos || '';
  return new Set(String(raw).split(/[,\s]+/).map(s => s.trim()).filter(Boolean).map(s => String(parseInt(s)).padStart(4, '0')));
}

// ── 申告済概算保険料額 조회 (수동 우선 → 전년도 概算 자동연계 → 미설정) ──────
// 반환: { val: 円, source: 'manual'|'auto'|'none' }
function getShinkokuZumi(Y) {
  const manual = _roudouConfig[`roudou_shinkoku_zumi_gaisan_${Y}`];
  if (manual !== undefined && String(manual).trim() !== '') return { val: roudouParseNum(manual), source: 'manual' };
  const auto = _roudouConfig[`roudou_gaisan_ryo_${Y - 1}`]; // 전년도 화면에서 저장된 概算保険料額
  if (auto !== undefined && String(auto).trim() !== '') return { val: roudouParseNum(auto), source: 'auto' };
  return { val: 0, source: 'none' };
}

// ── 올해 概算保険料額을 config에 자동 영속화 (내년 申告済概算 자동연계용) ─────
// 값 변동 시에만, 디바운스 후 GAS 저장 (렌더 폭주 방지)
let _roudouGaisanSaveTimer = null;
function persistGaisanRyo(Y, gaisanRyo) {
  const key = `roudou_gaisan_ryo_${Y}`;
  if (String(_roudouConfig[key] || '') === String(gaisanRyo)) return; // 변동 없음
  _roudouConfig[key] = String(gaisanRyo); // 로컬 캐시 즉시 갱신
  clearTimeout(_roudouGaisanSaveTimer);
  _roudouGaisanSaveTimer = setTimeout(() => {
    if (typeof saveConfigToGas === 'function') {
      saveConfigToGas({ [key]: String(gaisanRyo) }).catch(() => {});
    }
  }, 1500);
}

// ── 귀속월 총지급액 (지급확정 스냅샷만) ───────────────────────────────────────
function getRoudouPay(empNo, year, month) {
  const pNo = String(empNo).padStart(4, '0');
  const ymKey = `${year}-${String(month).padStart(2, '0')}`;
  if (typeof paidYMs !== 'undefined' && paidYMs && !paidYMs.has(ymKey)) return null; // 미확정 제외
  const raw = localStorage.getItem(`kyuyo_p_${pNo}_${year}_${month}`);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    const emp = (typeof employees !== 'undefined')
      ? employees.find(e => String(e.no).padStart(4, '0') === pNo) : null;
    const c = calcPayrollData(d, emp || null, year, month);
    return c.totalPay != null ? c.totalPay : null;
  } catch (e) { return null; }
}

// ── 確定 12귀속월 목록 ────────────────────────────────────────────────────────
function roudouKakuteiMonths(Y) {
  // 귀속월 (Y-1).3 ~ Y.2, 지급월 = 익월
  const arr = [];
  for (let i = 0; i < 12; i++) {
    const idx = (Y - 1) * 12 + (3 - 1) + i;   // 0-based month index
    const ataY = Math.floor(idx / 12), ataM = (idx % 12) + 1;
    const pIdx = idx + 1;
    const payY = Math.floor(pIdx / 12), payM = (pIdx % 12) + 1;
    arr.push({ ataYear: ataY, ataMonth: ataM, payYear: payY, payMonth: payM });
  }
  return arr;
}

// ── 페이지 초기화 ──────────────────────────────────────────────────────────────
async function initRoudou() {
  const yr = new Date().getFullYear();
  _roudouYear = yr;
  const sel = document.getElementById('roudou-year');
  if (sel) {
    sel.innerHTML = '';
    for (let y = yr + 1; y >= yr - 3; y--) {
      const o = document.createElement('option');
      o.value = y; o.textContent = `令和${y - 2018}年度（${y}年）`;
      sel.appendChild(o);
    }
    sel.value = yr;
    sel.onchange = () => { _roudouYear = parseInt(sel.value); buildRoudouState(); renderRoudou(); };
  }

  const loadEl = document.getElementById('roudou-loading');
  if (loadEl) loadEl.style.display = '';
  try { _roudouConfig = await fetchConfig(); } catch (e) { _roudouConfig = {}; }
  if (loadEl) loadEl.style.display = 'none';

  buildRoudouState();
  renderRoudou();
}

// ── 집계 → state 구축 ─────────────────────────────────────────────────────────
function buildRoudouState(preserveManual) {
  const Y = _roudouYear;
  const excl = roudouExcludeSet();
  const targets = (typeof employees !== 'undefined' ? employees : [])
    .filter(e => e && e.no != null && !excl.has(String(e.no).padStart(4, '0')));

  const months = roudouKakuteiMonths(Y).map(m => {
    let rousaiCount = 0, rousaiYen = 0, koyoCount = 0, koyoYen = 0;
    const ymKey = `${m.ataYear}-${String(m.ataMonth).padStart(2, '0')}`;
    const paid = (typeof paidYMs === 'undefined' || !paidYMs) ? true : paidYMs.has(ymKey);
    targets.forEach(emp => {
      const pay = getRoudouPay(emp.no, m.ataYear, m.ataMonth);
      if (pay != null) {
        rousaiCount++; rousaiYen += pay;
        if (emp.koyo !== 'no') { koyoCount++; koyoYen += pay; }
      }
    });
    return { ...m, ymKey, paid, rousaiCount, rousaiYen, koyoCount, koyoYen };
  });

  // 상여 3행 (수동): 기존 값 보존
  const prevBonus = (preserveManual && _roudouState) ? _roudouState.bonus : null;
  const bonus = prevBonus || [
    { label: '賞与①', rousaiCount: 0, rousaiYen: 0, koyoCount: 0, koyoYen: 0 },
    { label: '賞与②', rousaiCount: 0, rousaiYen: 0, koyoCount: 0, koyoYen: 0 },
    { label: '賞与③', rousaiCount: 0, rousaiYen: 0, koyoCount: 0, koyoYen: 0 },
  ];

  const prevGaisan = (preserveManual && _roudouState) ? _roudouState.gaisanOverride : null;

  _roudouState = {
    year: Y,
    excludeSet: excl,
    months,
    bonus,
    gaisanOverride: prevGaisan, // {rousaiSen, koyoSen} 또는 null(=확정과 동일)
  };
}

// ── 기초액 집계 (월 + 상여) ───────────────────────────────────────────────────
function roudouTotals() {
  const s = _roudouState;
  let rousaiYen = 0, koyoYen = 0;
  s.months.forEach(m => { rousaiYen += m.rousaiYen; koyoYen += m.koyoYen; });
  s.bonus.forEach(b => { rousaiYen += b.rousaiYen; koyoYen += b.koyoYen; });

  // 월평균 인원 (확정 12개월 스냅샷 기준)
  let rousaiPeople = 0, koyoPeople = 0;
  s.months.forEach(m => { rousaiPeople += m.rousaiCount; koyoPeople += m.koyoCount; });
  const rousaiAvg = Math.max(1, Math.floor(rousaiPeople / 12));
  const koyoAvg   = Math.max(1, Math.floor(koyoPeople / 12));

  return {
    rousaiYen, koyoYen,
    rousaiSen: senKiri(rousaiYen), koyoSen: senKiri(koyoYen),
    doGaku: rousaiYen === koyoYen,   // 同額 여부
    rousaiAvg, koyoAvg,
  };
}

// ── 保険料 계산 (확정/개산 공통) ──────────────────────────────────────────────
// mode: 'kakutei'(確定, 요율연도 Y-1) 또는 'gaisan'(概算, 요율연도 Y)
function calcRoudouHoken(t, mode) {
  const Y = _roudouYear;
  const rateYear = mode === 'kakutei' ? Y - 1 : Y;
  const rTotal  = roudouRate('total',  mode, rateYear);
  const rRousai = roudouRate('rousai', mode, rateYear);
  const rKoyo   = roudouRate('koyo',   mode, rateYear);

  // 개산 기초액: override 있으면 사용, 없으면 확정과 동일
  let rousaiSen = t.rousaiSen, koyoSen = t.koyoSen, doGaku = t.doGaku;
  if (mode === 'gaisan' && _roudouState.gaisanOverride) {
    rousaiSen = _roudouState.gaisanOverride.rousaiSen;
    koyoSen   = _roudouState.gaisanOverride.koyoSen;
    doGaku    = rousaiSen === koyoSen;
  }

  let roudouRyo, rousaiRyo, koyoRyo;
  if (doGaku) {
    // 記入例4: 労働保険料 행에만 합산요율 1회 곱셈 (절사 차이 방지)
    roudouRyo = hokenryo(rousaiSen, rTotal);
    rousaiRyo = null; koyoRyo = null;
  } else {
    rousaiRyo = hokenryo(rousaiSen, rRousai);
    koyoRyo   = hokenryo(koyoSen,   rKoyo);
    roudouRyo = rousaiRyo + koyoRyo;
  }
  return { rateYear, rTotal, rRousai, rKoyo, rousaiSen, koyoSen, doGaku, roudouRyo, rousaiRyo, koyoRyo };
}

// ── 렌더링 ─────────────────────────────────────────────────────────────────────
function renderRoudou() {
  if (!_roudouState) return;
  const Y = _roudouYear;
  const t = roudouTotals();
  const kakutei = calcRoudouHoken(t, 'kakutei');
  const gaisan  = calcRoudouHoken(t, 'gaisan');

  // 一般拠出金 (労災대상 기초액 × 요율, 확정연도 기준)
  const ippanRate = roudouIppanRate(Y - 1);
  const ippanRyo  = hokenryo(t.rousaiSen, ippanRate);

  // 申告済概算保険料額 (수동 우선 → 전년도 概算 자동연계)
  const shinkoku = getShinkokuZumi(Y);
  const shinkokuZumi = shinkoku.val;
  const shinkokuNote = shinkoku.source === 'manual'
    ? '<span style="font-size:11px;color:#d97706;margin-left:6px;">手動入力</span>'
    : shinkoku.source === 'auto'
      ? `<span style="font-size:11px;color:#16a34a;margin-left:6px;">自動連携（令和${Y - 1 - 2018}年度概算より）</span>`
      : '<span style="font-size:11px;color:#dc2626;margin-left:6px;">未設定</span>';

  // 올해 概算保険料額을 config에 자동 저장 → 내년 申告済概算 자동연계
  persistGaisanRyo(Y, gaisan.roudouRyo);

  // 정산
  const sabiki = kakutei.roudouRyo - shinkokuZumi;  // 差引 = 確定 - 申告済概算
  const fusoku = sabiki > 0 ? sabiki : 0;           // (ハ)不足額
  const juto   = sabiki < 0 ? -sabiki : 0;          // (イ)充当額

  // (ニ)今期労働保険料 = 概算労働保険料 + 差引 (부호 자동: 不足 가산 / 充当 차감)
  const niKonki   = gaisan.roudouRyo + sabiki;
  const heIppan   = ippanRyo;                       // (ヘ)一般拠出金額
  const toKonki   = niKonki + heIppan;              // (ト)今期納付額

  renderRoudouOfficeInfo();
  const wrap = document.getElementById('roudou-body');
  if (!wrap) return;

  const excludeLabel = [...(_roudouState.excludeSet || [])].join('・');
  const doGakuBadge = t.doGaku
    ? '<span style="display:inline-block;padding:2px 10px;background:#dbeafe;color:#1e40af;border-radius:12px;font-size:12px;font-weight:600;">同額モード（記入例4）</span>'
    : '<span style="display:inline-block;padding:2px 10px;background:#fef3c7;color:#92400e;border-radius:12px;font-size:12px;font-weight:600;">労災≠雇用（分割記入）</span>';

  wrap.innerHTML = `
${excludeLabel ? `<div style="margin:0 0 12px;padding:9px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e;">
  ※支店長（社番${excludeLabel}）は役員扱いのため労災・雇用保険の対象外につき集計から除外しています。</div>` : ''}

<div style="margin-bottom:10px;">${doGakuBadge}
  <span style="margin-left:10px;font-size:12px;color:#6b7280;">賃金総額：労災 ${t.rousaiYen.toLocaleString()}円 ／ 雇用 ${t.koyoYen.toLocaleString()}円</span></div>

<!-- ══ 確定保険料 ══ -->
${roudouBlockHtml('確定保険料', `算定期間　令和${Y - 1 - 2018}年4月1日 ～ 令和${Y - 2018}年3月31日`, kakutei, ippanRate, ippanRyo, true)}

<!-- ══ 概算保険料 ══ -->
${roudouBlockHtml('概算保険料（見込）', `算定期間　令和${Y - 2018}年4月1日 ～ 令和${Y + 1 - 2018}年3月31日`, gaisan, null, null, false)}

<!-- ══ 인원수 ══ -->
<div style="display:flex;gap:14px;margin:16px 0;flex-wrap:wrap;">
  <div style="flex:1;min-width:180px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
    <div style="font-size:12px;color:#64748b;">④常時使用労働者数（労災）</div>
    <div style="font-size:22px;font-weight:700;color:#0f172a;">${t.rousaiAvg}<span style="font-size:13px;font-weight:400;">人</span></div>
  </div>
  <div style="flex:1;min-width:180px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
    <div style="font-size:12px;color:#64748b;">⑤雇用保険被保険者数</div>
    <div style="font-size:22px;font-weight:700;color:#0f172a;">${t.koyoAvg}<span style="font-size:13px;font-weight:400;">人</span></div>
  </div>
</div>

<!-- ══ 精算 ══ -->
<div style="margin:16px 0;padding:16px 18px;background:#fff;border:2px solid #1d4ed8;border-radius:12px;">
  <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:12px;">📋 納付額精算</div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr><td style="padding:5px 0;color:#475569;">確定保険料</td><td style="text-align:right;font-weight:600;">${kakutei.roudouRyo.toLocaleString()}円</td></tr>
    <tr><td style="padding:5px 0;color:#475569;">申告済概算保険料額${shinkokuNote}</td><td style="text-align:right;font-weight:600;">${shinkokuZumi.toLocaleString()}円</td></tr>
    <tr><td style="padding:5px 0;color:#475569;">差引</td><td style="text-align:right;font-weight:600;color:${sabiki >= 0 ? '#dc2626' : '#16a34a'};">
      ${sabiki >= 0 ? '(ハ)不足額 ' : '(イ)充当額 '}${Math.abs(sabiki).toLocaleString()}円</td></tr>
    <tr><td style="padding:5px 0;color:#475569;">概算保険料</td><td style="text-align:right;font-weight:600;">${gaisan.roudouRyo.toLocaleString()}円</td></tr>
  </table>
  <div style="border-top:1px dashed #cbd5e1;margin:12px 0;"></div>
  <div style="display:flex;gap:12px;flex-wrap:wrap;">
    <div style="flex:1;min-width:150px;"><div style="font-size:11px;color:#64748b;">(ニ)今期労働保険料</div>
      <div style="font-size:20px;font-weight:700;color:#0f172a;">${niKonki.toLocaleString()}<span style="font-size:12px;font-weight:400;">円</span></div></div>
    <div style="flex:1;min-width:150px;"><div style="font-size:11px;color:#64748b;">(ヘ)一般拠出金額</div>
      <div style="font-size:20px;font-weight:700;color:#0f172a;">${heIppan.toLocaleString()}<span style="font-size:12px;font-weight:400;">円</span></div></div>
    <div style="flex:1;min-width:150px;"><div style="font-size:11px;color:#64748b;">(ト)今期納付額</div>
      <div style="font-size:24px;font-weight:800;color:#1d4ed8;">${toKonki.toLocaleString()}<span style="font-size:13px;font-weight:400;">円</span></div></div>
  </div>
  <div style="margin-top:12px;padding:8px 12px;background:#eff6ff;border-radius:7px;font-size:12px;color:#1e40af;">
    💳 この金額をOCRカードに記入してください（40万円未満のため一括納付・延納なし）</div>
</div>

<!-- ══ 注意 ══ -->
<div style="margin:12px 0;padding:9px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12px;color:#991b1b;">
  ⚠️ 実際の申告時はOCRカードに印字された料率を確認してください。（本画面の料率は設定値に基づく参考値です）</div>

<!-- ══ 賃金集計表 (접이식) ══ -->
<details style="margin-top:16px;" ${_roudouDetailsOpen ? 'open' : ''} ontoggle="_roudouDetailsOpen=this.open">
  <summary style="cursor:pointer;font-size:13px;font-weight:700;color:#1e293b;padding:8px 0;">▸ 賃金集計表（月別内訳・手動修正可）</summary>
  ${roudouShukeiHtml(t)}
</details>`;
}

// ── 신고서 블록 HTML ─────────────────────────────────────────────────────────
function roudouBlockHtml(title, period, h, ippanRate, ippanRyo, showIppan) {
  const senCell = v => v.toLocaleString();
  const yenCell = v => v == null ? '<span style="color:#cbd5e1;">記入しない</span>' : v.toLocaleString() + '円';
  const shasen = h.doGaku
    ? 'background:repeating-linear-gradient(-45deg,#f1f5f9,#f1f5f9 6px,#e2e8f0 6px,#e2e8f0 12px);'
    : '';
  const gaisanNote = (!showIppan && _roudouState.gaisanOverride)
    ? '<span style="margin-left:8px;font-size:11px;color:#d97706;">※手動調整済</span>' : '';
  const editBtn = showIppan
    ? `<button onclick="openRoudouConfigModal()" style="margin-left:auto;padding:4px 10px;font-size:12px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:6px;cursor:pointer;">料率・申告済額を編集</button>`
    : `<button onclick="openRoudouGaisanModal()" style="margin-left:auto;padding:4px 10px;font-size:12px;background:#fefce8;color:#854d0e;border:1px solid #fde68a;border-radius:6px;cursor:pointer;">概算基礎額を調整</button>`;

  return `
<div style="margin:14px 0;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;">
  <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f1f5f9;border-bottom:1px solid #cbd5e1;">
    <span style="font-size:14px;font-weight:700;color:#0f172a;">${title}</span>
    <span style="font-size:12px;color:#64748b;">${period}</span>${gaisanNote}${editBtn}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="background:#f8fafc;color:#475569;font-size:12px;">
      <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">区分</th>
      <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;">算定基礎額（千円）</th>
      <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;">保険料率（1/1000）</th>
      <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;">保険料額（円）</th>
    </tr></thead>
    <tbody>
      <tr style="font-weight:700;">
        <td style="padding:9px 10px;border-bottom:1px solid #f1f5f9;">労働保険料</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid #f1f5f9;">${senCell(h.rousaiSen)}</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid #f1f5f9;">${h.rTotal.toFixed(2)}</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid #f1f5f9;color:#1d4ed8;">${h.roudouRyo.toLocaleString()}</td>
      </tr>
      <tr style="${shasen}">
        <td style="padding:9px 10px;border-bottom:1px solid #f1f5f9;padding-left:24px;color:#64748b;">労災保険分</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid #f1f5f9;">${h.doGaku ? '<span style="color:#cbd5e1;">—</span>' : senCell(h.rousaiSen)}</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid #f1f5f9;">${h.rRousai.toFixed(2)}</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid #f1f5f9;">${yenCell(h.rousaiRyo)}</td>
      </tr>
      <tr style="${shasen}">
        <td style="padding:9px 10px;border-bottom:1px solid #f1f5f9;padding-left:24px;color:#64748b;">雇用保険分</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid #f1f5f9;">${h.doGaku ? '<span style="color:#cbd5e1;">—</span>' : senCell(h.koyoSen)}</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid #f1f5f9;">${h.rKoyo.toFixed(2)}</td>
        <td style="padding:9px 10px;text-align:right;border-bottom:1px solid #f1f5f9;">${yenCell(h.koyoRyo)}</td>
      </tr>
      ${showIppan ? `
      <tr>
        <td style="padding:9px 10px;">一般拠出金</td>
        <td style="padding:9px 10px;text-align:right;">${senCell(h.rousaiSen)}</td>
        <td style="padding:9px 10px;text-align:right;">${ippanRate.toFixed(2)}</td>
        <td style="padding:9px 10px;text-align:right;color:#1d4ed8;">${ippanRyo.toLocaleString()}</td>
      </tr>` : ''}
    </tbody>
  </table>
</div>`;
}

// ── 賃金集計表 HTML ──────────────────────────────────────────────────────────
let _roudouDetailsOpen = false;
function roudouShukeiHtml(t) {
  const s = _roudouState;
  const row = (r, i, isBonus) => `
    <tr${r.paid === false ? ' style="opacity:.5;"' : ''}>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">
        ${isBonus
          ? `<input value="${r.label}" onchange="roudouEditBonus(${i},'label',this.value)" style="width:64px;border:1px solid #e2e8f0;border-radius:4px;padding:2px 4px;font-size:12px;">`
          : `${warekiYM(r.payYear, r.payMonth)}支給<br><span style="font-size:11px;color:#94a3b8;">（${warekiYM(r.ataYear, r.ataMonth)}分）</span>`}
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">
        <input value="${r.rousaiCount}" onchange="${isBonus ? `roudouEditBonus(${i},'rousaiCount',this.value)` : `roudouEditMonth(${i},'rousaiCount',this.value)`}" style="width:48px;text-align:center;border:1px solid #e2e8f0;border-radius:4px;padding:2px;font-size:12px;"></td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">
        <input value="${r.rousaiYen}" onchange="${isBonus ? `roudouEditBonus(${i},'rousaiYen',this.value)` : `roudouEditMonth(${i},'rousaiYen',this.value)`}" style="width:96px;text-align:right;border:1px solid #e2e8f0;border-radius:4px;padding:2px 4px;font-size:12px;"></td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">
        <input value="${r.koyoCount}" onchange="${isBonus ? `roudouEditBonus(${i},'koyoCount',this.value)` : `roudouEditMonth(${i},'koyoCount',this.value)`}" style="width:48px;text-align:center;border:1px solid #e2e8f0;border-radius:4px;padding:2px;font-size:12px;"></td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">
        <input value="${r.koyoYen}" onchange="${isBonus ? `roudouEditBonus(${i},'koyoYen',this.value)` : `roudouEditMonth(${i},'koyoYen',this.value)`}" style="width:96px;text-align:right;border:1px solid #e2e8f0;border-radius:4px;padding:2px 4px;font-size:12px;"></td>
    </tr>`;

  return `
<div style="overflow-x:auto;margin-top:8px;">
<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:560px;">
  <thead><tr style="background:#f8fafc;color:#475569;">
    <th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e2e8f0;">支給月（귀속월）</th>
    <th style="padding:7px 8px;border-bottom:2px solid #e2e8f0;">労災 人員</th>
    <th style="padding:7px 8px;border-bottom:2px solid #e2e8f0;">労災 賃金額(円)</th>
    <th style="padding:7px 8px;border-bottom:2px solid #e2e8f0;">雇用 人員</th>
    <th style="padding:7px 8px;border-bottom:2px solid #e2e8f0;">雇用 賃金額(円)</th>
  </tr></thead>
  <tbody>
    ${s.months.map((m, i) => row(m, i, false)).join('')}
    ${s.bonus.map((b, i) => row(b, i, true)).join('')}
  </tbody>
  <tfoot>
    <tr style="font-weight:700;background:#f1f5f9;">
      <td style="padding:8px;">⑨⑩⑪⑫ 合計</td>
      <td style="padding:8px;text-align:center;">—</td>
      <td style="padding:8px;text-align:right;">${t.rousaiYen.toLocaleString()}</td>
      <td style="padding:8px;text-align:center;">—</td>
      <td style="padding:8px;text-align:right;">${t.koyoYen.toLocaleString()}</td>
    </tr>
    <tr style="font-weight:700;color:#1d4ed8;">
      <td style="padding:8px;">千円未満切捨 転記額（千円）</td>
      <td style="padding:8px;"></td>
      <td style="padding:8px;text-align:right;">${t.rousaiSen.toLocaleString()}</td>
      <td style="padding:8px;"></td>
      <td style="padding:8px;text-align:right;">${t.koyoSen.toLocaleString()}</td>
    </tr>
  </tfoot>
</table>
</div>`;
}

// ── 집계표 셀 편집 ────────────────────────────────────────────────────────────
function roudouEditMonth(i, field, val) {
  const m = _roudouState.months[i]; if (!m) return;
  m[field] = (field === 'rousaiCount' || field === 'koyoCount') ? roudouParseNum(val) : roudouParseNum(val);
  renderRoudou();
}
function roudouEditBonus(i, field, val) {
  const b = _roudouState.bonus[i]; if (!b) return;
  b[field] = field === 'label' ? val : roudouParseNum(val);
  renderRoudou();
}

// ── 事業所情報 표시 (算定基礎届와 공유) ───────────────────────────────────────
function renderRoudouOfficeInfo() {
  const c = _roudouConfig;
  const el = document.getElementById('roudou-office-info');
  if (!el) return;
  el.innerHTML =
    `<span>労働保険番号: <b>${c.roudou_hokenbango || '—'}</b></span>` +
    `<span style="margin-left:16px;">名称: <b>${c.jigyosho_name || '—'}</b></span>` +
    `<span style="margin-left:16px;">所在地: <b>${c.jigyosho_address || '—'}</b></span>`;
}

// ── 料率·申告済額 편집 모달 ───────────────────────────────────────────────────
function openRoudouConfigModal() {
  const Y = _roudouYear, c = _roudouConfig;
  const kY = Y - 1, gY = Y;
  const g = (k, d) => (c[k] !== undefined && c[k] !== '') ? c[k] : d;
  document.getElementById('rc-hokenbango').value = c.roudou_hokenbango || '';
  document.getElementById('rc-exclude').value    = c.roudou_exclude_nos || '';
  // 確定 요율 (前年度 kY)
  document.getElementById('rc-k-total').value  = g(`roudou_rate_${kY}_total`,  ROUDOU_RATE_DEFAULT.total.kakutei);
  document.getElementById('rc-k-rousai').value = g(`roudou_rate_${kY}_rousai`, ROUDOU_RATE_DEFAULT.rousai.kakutei);
  document.getElementById('rc-k-koyo').value   = g(`roudou_rate_${kY}_koyo`,   ROUDOU_RATE_DEFAULT.koyo.kakutei);
  document.getElementById('rc-k-ippan').value  = g(`roudou_ippan_kyoshutsu_${kY}`, ROUDOU_RATE_DEFAULT.ippan);
  // 概算 요율 (当年度 gY)
  document.getElementById('rc-g-total').value  = g(`roudou_rate_${gY}_total`,  ROUDOU_RATE_DEFAULT.total.gaisan);
  document.getElementById('rc-g-rousai').value = g(`roudou_rate_${gY}_rousai`, ROUDOU_RATE_DEFAULT.rousai.gaisan);
  document.getElementById('rc-g-koyo').value   = g(`roudou_rate_${gY}_koyo`,   ROUDOU_RATE_DEFAULT.koyo.gaisan);
  // 申告済概算保険料額 (신고연도 Y) — 수동값 표시, 비었으면 자동연계값을 placeholder 안내
  const shinkokuEl = document.getElementById('rc-shinkoku');
  shinkokuEl.value = c[`roudou_shinkoku_zumi_gaisan_${Y}`] || '';
  const autoPrev = c[`roudou_gaisan_ryo_${Y - 1}`];
  shinkokuEl.placeholder = (autoPrev !== undefined && String(autoPrev).trim() !== '')
    ? `自動連携: ${roudouParseNum(autoPrev).toLocaleString()}（空欄で自動使用）`
    : '例: 143850';
  document.getElementById('rc-year-label').textContent = `令和${Y - 2018}年度（確定=令和${kY - 2018}年度料率／概算=令和${gY - 2018}年度料率）`;
  const modal = document.getElementById('modal-roudou-config');
  if (modal) modal.style.display = 'flex';
}
function closeRoudouConfigModal() {
  const m = document.getElementById('modal-roudou-config');
  if (m) m.style.display = 'none';
}
async function saveRoudouConfig() {
  const Y = _roudouYear, kY = Y - 1, gY = Y;
  const val = id => (document.getElementById(id)?.value || '').trim();
  const entries = {
    roudou_hokenbango: val('rc-hokenbango'),
    roudou_exclude_nos: val('rc-exclude'),
    [`roudou_rate_${kY}_total`]:  val('rc-k-total'),
    [`roudou_rate_${kY}_rousai`]: val('rc-k-rousai'),
    [`roudou_rate_${kY}_koyo`]:   val('rc-k-koyo'),
    [`roudou_ippan_kyoshutsu_${kY}`]: val('rc-k-ippan'),
    [`roudou_rate_${gY}_total`]:  val('rc-g-total'),
    [`roudou_rate_${gY}_rousai`]: val('rc-g-rousai'),
    [`roudou_rate_${gY}_koyo`]:   val('rc-g-koyo'),
    [`roudou_shinkoku_zumi_gaisan_${Y}`]: val('rc-shinkoku'),
  };
  const btn = document.getElementById('rc-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
  try {
    await saveConfigToGas(entries);
    _roudouConfig = { ..._roudouConfig, ...entries };
    closeRoudouConfigModal();
    buildRoudouState(true);
    renderRoudou();
    showToast('設定を保存しました ✓', 's');
  } catch (e) {
    showToast('保存に失敗しました: ' + e.message, 'e');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '保存'; }
  }
}

// ── 概算基礎額 수동조정 모달 ──────────────────────────────────────────────────
function openRoudouGaisanModal() {
  const t = roudouTotals();
  const ov = _roudouState.gaisanOverride;
  document.getElementById('rg-rousai').value = ov ? ov.rousaiSen : t.rousaiSen;
  document.getElementById('rg-koyo').value   = ov ? ov.koyoSen   : t.koyoSen;
  const modal = document.getElementById('modal-roudou-gaisan');
  if (modal) modal.style.display = 'flex';
}
function closeRoudouGaisanModal() {
  const m = document.getElementById('modal-roudou-gaisan');
  if (m) m.style.display = 'none';
}
function applyRoudouGaisan() {
  const rousaiSen = roudouParseNum(document.getElementById('rg-rousai').value);
  const koyoSen   = roudouParseNum(document.getElementById('rg-koyo').value);
  _roudouState.gaisanOverride = { rousaiSen, koyoSen };
  closeRoudouGaisanModal();
  renderRoudou();
}
function resetRoudouGaisan() {
  _roudouState.gaisanOverride = null;
  closeRoudouGaisanModal();
  renderRoudou();
}
