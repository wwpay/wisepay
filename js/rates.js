// 수정: 2026-06-03 09:00 — 보험료율 표 overflow-x:auto + colgroup 100% 보정 + 헤더 nowrap
'use strict';
async function openRateModal() {
  const jp = LANG==='JP';
  _pendingScrapedRates = null;

  // 모달을 로딩 상태로 먼저 열기
  const applyBtn = document.getElementById('t-mr-apply');
  const titleEl  = document.getElementById('t-mr-title');
  const descEl   = document.getElementById('t-mr-desc');
  const srcEl    = document.getElementById('t-mr-src');
  const area     = document.getElementById('rateModalRows');

  if (titleEl) titleEl.textContent = jp ? '協会けんぽ 最新保険料率を取得中' : '협회건포 최신 요율 가져오는 중';
  if (descEl)  descEl.textContent  = '';
  if (srcEl)   srcEl.textContent   = '';
  if (applyBtn) applyBtn.style.display = 'none';
  area.innerHTML = `<div style="text-align:center;padding:28px 0;color:var(--text2);">
    <div style="font-size:24px;margin-bottom:10px;">⏳</div>
    <div style="font-size:13px;">${jp ? '協会けんぽ 東京都 公式サイトから取得中...' : '협회건포 도쿄도 공식 사이트에서 가져오는 중...'}</div>
  </div>`;

  openModal('modal-rates');

  try {
    const result = await gasRequest({ action: 'scrapeRates' }, 30000);
    console.log('[WisePay] GAS scrapeRates raw response:', JSON.stringify(result));
    if (!result.ok) throw new Error(result.error || (jp ? '取得失敗' : '가져오기 실패'));

    _pendingScrapedRates = result;

    const defs = [
      { key:'kenko',  jp:'健康保険料率（東京都）',      kr:'건강보험료율（도쿄도）' },
      { key:'kaigo',  jp:'介護保険料率（全国一律）',      kr:'개호보험료율（전국）' },
      { key:'kodomo', jp:'子ども・子育て支援金率',        kr:'자녀・육아지원금율' },
      { key:'nenkin', jp:'厚生年金保険料率',              kr:'후생연금보험료율' },
      { key:'koyo',   jp:'雇用保険料率（労働者負担）',    kr:'고용보험료율（근로자）' },
    ];

    if (titleEl) titleEl.textContent = jp ? '✅ 最新保険料率（協会けんぽ）' : '✅ 최신 보험료율（협회건포）';
    if (descEl)  descEl.textContent  = jp
      ? `${result.from} 適用分　取得日時: ${result.scraped_at}`
      : `${result.from} 적용분　취득일시: ${result.scraped_at}`;
    if (srcEl)   srcEl.innerHTML = `<a href="${result.source}" target="_blank" style="color:var(--accent);font-size:11px;">${jp ? '出典：協会けんぽ公式サイト' : '출처: 협회건포 공식 사이트'}</a>`;

    area.innerHTML = defs.map(d => `
      <div class="rate-row" style="background:var(--surface2);border-radius:var(--r2);margin-bottom:6px;">
        <span style="font-size:12px;">${jp ? d.jp : d.kr}</span>
        <div class="rate-row-r" style="gap:4px;">
          <span style="font-size:15px;font-weight:600;color:var(--accent);">${result[d.key] != null ? Number(result[d.key]).toFixed(2) : '—'}</span>
          <span style="font-size:12px;color:var(--text3);">%</span>
        </div>
      </div>`).join('');

    if (applyBtn) applyBtn.style.display = '';

  } catch(err) {
    if (titleEl) titleEl.textContent = jp ? '❌ 取得失敗' : '❌ 가져오기 실패';
    area.innerHTML = `<div style="padding:16px;background:#fee2e2;border-radius:var(--r2);color:var(--red);font-size:12px;white-space:pre-wrap;">${err.message}</div>`;
  }
}

function applyRates() {
  if (!_pendingScrapedRates) return;
  const jp = LANG==='JP';
  const r = _pendingScrapedRates;

  // 스크래핑 결과 from은 항상 'YYYY-03' (건강보험 개정월)
  // 3월 항목: kenko/kaigo만 갱신. kodomo=0.00(자녀지원금은 4월~), koyo는 기존값 유지
  const marchFrom = r.from;
  const [fy] = marchFrom.split('-').map(Number);
  const aprilFrom = `${fy}-04`;

  const existingMarch = rateHistory.find(h => h.from === marchFrom);
  const marchEntry = {
    from: marchFrom,
    kenko:  r.kenko,
    kaigo:  r.kaigo,
    kodomo: 0.00,   // 자녀지원금은 4월부터
    nenkin: r.nenkin,
    koyo:   existingMarch ? existingMarch.koyo : r.koyo,  // 기존 고용보험율 유지
  };

  // 4월 항목: 고용보험·자녀지원금 모두 갱신
  const existingApril = rateHistory.find(h => h.from === aprilFrom);
  const aprilEntry = {
    from: aprilFrom,
    kenko:  r.kenko,
    kaigo:  r.kaigo,
    kodomo: r.kodomo,
    nenkin: r.nenkin,
    koyo:   r.koyo,
  };

  [marchEntry, aprilEntry].forEach(entry => {
    const idx = rateHistory.findIndex(h => h.from === entry.from);
    if(idx >= 0) rateHistory[idx] = entry;
    else rateHistory.push(entry);
  });
  rateHistory.sort((a,b) => a.from > b.from ? 1 : -1);

  saveRateHistory();
  uploadRateHistoryToGas();
  rates = { kenko:r.kenko, kaigo:r.kaigo, kodomo:r.kodomo, nenkin:r.nenkin, koyo:r.koyo };
  updateRatesDisplay(); recalc(); renderRatesPage();
  closeModal('modal-rates');
  _pendingScrapedRates = null;
  document.getElementById('ratesUpdatedTxt').textContent =
    jp ? `協会けんぽ取得 ${marchFrom}・${aprilFrom} ✓` : `협회건포 취득 ${marchFrom}·${aprilFrom} ✓`;
  showToast(jp ? `保険料率を更新しました ✓` : `보험료율 업데이트됨 ✓`, 's');
}

function updateRatesDisplay() {
  ['kenko','kaigo','kodomo','nenkin','koyo'].forEach(k=>{const el=document.getElementById('rt-'+k);if(el)el.textContent=rates[k].toFixed(2)+'%';});
  const ymEl = document.getElementById('ratesAppliedYM');
  if(ymEl) {
    const applied = getRatesForYM(currentYear, currentMonth);
    ymEl.textContent = LANG==='JP' ? `（${fmtYM(applied.from)}適用）` : `（${fmtYM(applied.from)} 적용）`;
  }
}

function renderRatesPage() {
  const jp = LANG==='JP';
  const area=document.getElementById('ratesFormArea');
  area.innerHTML='';

  const keys = ['kenko','kaigo','kodomo','nenkin','koyo'];
  const labels = jp
    ? ['健康保険','介護保険','子育て支援金','厚生年金','雇用保険']
    : ['건강보험','개호보험','자녀지원금','후생연금','고용보험'];

  let html = `<div style="overflow-x:auto;">
  <table style="width:100%;min-width:480px;border-collapse:collapse;font-size:12px;table-layout:fixed;">
    <colgroup>
      <col style="width:22%;">
      ${keys.map(()=>'<col style="width:14%;">').join('')}
      <col style="width:8%;">
    </colgroup>
    <thead>
      <tr style="background:var(--surface2);">
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid var(--border);font-weight:600;color:var(--text2);white-space:nowrap;">${jp?'適用期間':'적용 기간'}</th>
        ${keys.map((k,i)=>`<th style="padding:8px 4px;text-align:center;border-bottom:2px solid var(--border);font-weight:600;color:var(--text2);font-size:11px;white-space:nowrap;">${labels[i]} <span style="font-size:9px;font-weight:400;color:var(--text3);">(${jp?'労働者':'근로자'})</span></th>`).join('')}
        <th style="padding:8px 4px;border-bottom:2px solid var(--border);"></th>
      </tr>
    </thead>
    <tbody id="rateHistoryTbody"></tbody>
  </table>
  </div>
  <div style="margin-top:10px;font-size:11px;color:var(--text3);padding:6px 2px;">
    ${jp?'※ 健康保険・介護保険は「最新料率を取得」ボタンで協会けんぽ公式サイトから取得できます。厚生年金・雇用保険は手動で追加してください。':'※ 건강보험·개호보험은 「최신 요율 가져오기」로 가져올 수 있습니다. 후생연금·고용보험은 직접 추가해 주세요.'}
  </div>`;
  area.innerHTML = html;
  renderRateHistoryRows();
}

function renderRateHistoryRows() {
  const jp = LANG==='JP';
  const tbody = document.getElementById('rateHistoryTbody');
  if(!tbody) return;
  const keys = ['kenko','kaigo','kodomo','nenkin','koyo'];
  tbody.innerHTML = '';

  // 오래된 순 정렬 → "until" 날짜 계산, 표시는 새로운 순
  const sorted = [...rateHistory].sort((a,b) => a.from > b.from ? 1 : -1);

  // 오늘 날짜 기준 / 선택월 기준 적용 요율 (별도 계산)
  const now = new Date();
  const todayApplied = getRatesForYM(now.getFullYear(), now.getMonth() + 1);
  const selApplied   = getRatesForYM(currentYear, currentMonth);
  const selDiffersFromToday = selApplied.from !== todayApplied.from;

  // 새로운 순으로 표시
  [...sorted].reverse().forEach((r, revIdx) => {
    const origIdx  = sorted.length - 1 - revIdx;
    const nextEntry = sorted[origIdx + 1];
    const prevEntry = origIdx > 0 ? sorted[origIdx - 1] : null;

    const isToday = todayApplied.from === r.from;
    const isSel   = selDiffersFromToday && selApplied.from === r.from;

    // 적용 기간 "from ~ until"
    let untilStr;
    if (!nextEntry) {
      untilStr = jp ? '現在' : '현재';
    } else {
      let [ny, nm] = nextEntry.from.split('-').map(Number);
      nm -= 1; if (nm === 0) { nm = 12; ny -= 1; }
      const untilYM = `${ny}-${String(nm).padStart(2,'0')}`;
      untilStr = untilYM === r.from ? '' : (jp ? `${ny}年${nm}月` : `${ny}.${nm}`);
    }
    const fromFmt = jp
      ? `${r.from.split('-')[0]}年${parseInt(r.from.split('-')[1])}月`
      : `${r.from.split('-')[0]}.${parseInt(r.from.split('-')[1])}`;
    const periodLabel = untilStr ? `${fromFmt} ~ ${untilStr}` : fromFmt;

    // 이전 항목 대비 변경된 요율 키
    const changed = prevEntry
      ? keys.filter(k => Math.abs((r[k]||0) - (prevEntry[k]||0)) > 0.0001)
      : keys;

    const rowBg = isToday
      ? 'background:var(--accent2);'
      : isSel
        ? 'background:#fffbe6;'
        : (revIdx % 2 === 0 ? '' : 'background:var(--surface2);');

    const badge = isToday
      ? `<div style="font-size:10px;color:var(--accent);margin-top:1px;">${jp?'▶ 本日適用中':'▶ 오늘 기준 적용 중'}</div>`
      : isSel
        ? `<div style="font-size:10px;color:var(--orange);margin-top:1px;">${jp?`▶ 選択月(${currentYear}/${currentMonth})適用`:`▶ 선택월(${currentYear}/${currentMonth}) 적용`}</div>`
        : '';

    const tr = document.createElement('tr');
    tr.style.cssText = rowBg;
    tr.innerHTML = `
      <td style="padding:7px 10px;border-bottom:1px solid var(--border2);">
        <div style="font-size:12px;font-weight:${isToday?'700':'500'};color:${isToday?'var(--accent)':isSel?'var(--orange)':'var(--text)'};">${periodLabel}</div>
        ${badge}
      </td>
      ${keys.map(k => {
        const isChanged = changed.includes(k);
        const val = Number(r[k]).toFixed(2);
        return `<td style="padding:7px 4px;border-bottom:1px solid var(--border2);text-align:right;">
          <span style="font-size:13px;font-weight:${isToday||isChanged?'700':'400'};color:${isToday?'var(--accent)':isChanged?'var(--orange)':'var(--text)'};${isChanged&&!isToday?'border-bottom:2px solid var(--orange);padding-bottom:1px;':''}">${val}</span>
          <span style="font-size:10px;color:var(--text3);">%</span>
        </td>`;
      }).join('')}
      <td style="padding:7px 4px;border-bottom:1px solid var(--border2);text-align:center;">
        <button class="btn btn-sm" onclick="deleteRateHistoryRow(${rateHistory.indexOf(r)})" style="color:var(--red);padding:2px 6px;font-size:11px;">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // 범례
  const legend = document.createElement('tr');
  legend.innerHTML = `<td colspan="${keys.length+2}" style="padding:6px 10px;font-size:10px;color:var(--text3);">
    <span style="color:var(--accent);font-weight:700;">■</span> ${jp?'本日適用中':'오늘 기준 적용 중'}
    &nbsp;
    <span style="color:var(--orange);font-weight:700;">■</span> ${jp?'選択月適用':'선택월 적용'}
    &nbsp;
    <span style="color:var(--orange);text-decoration:underline;">0.00</span> ${jp?'前期比変更':'이전 대비 변경'}
  </td>`;
  tbody.appendChild(legend);
}

function addRateHistoryRow() {
  // 가장 최근 항목을 복사해서 다음 달로 추가
  const last = [...rateHistory].sort((a,b)=>a.from>b.from?-1:1)[0];
  const nextYM = last ? (() => {
    const [y,m] = last.from.split('-').map(Number);
    const nm = m===12?1:m+1, ny = m===12?y+1:y;
    return `${ny}-${String(nm).padStart(2,'0')}`;
  })() : `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
  if(rateHistory.find(r=>r.from===nextYM)) { showToast(LANG==='JP'?'その月は既に登録済みです':'이미 등록된 월입니다','w'); return; }
  const base = last || { kenko:9.85,kaigo:1.62,kodomo:0.23,nenkin:18.30,koyo:0.50 };
  rateHistory.push({ from:nextYM, kenko:base.kenko, kaigo:base.kaigo, kodomo:base.kodomo, nenkin:base.nenkin, koyo:base.koyo });
  rateHistory.sort((a,b)=>a.from>b.from?1:-1);
  saveRateHistory();
  renderRateHistoryRows();
}

function updateRateHistoryFrom(idx, newFrom) {
  if(!newFrom) { renderRateHistoryRows(); return; }
  if(rateHistory.find((r,i)=>i!==idx&&r.from===newFrom)) { showToast(LANG==='JP'?'その月は既に登録済みです':'이미 등록된 월입니다','w'); renderRateHistoryRows(); return; }
  rateHistory[idx].from = newFrom;
  rateHistory.sort((a,b)=>a.from>b.from?1:-1);
  saveRateHistory();
  renderRateHistoryRows();
  applyRatesForYM(currentYear, currentMonth);
  updateRatesDisplay(); recalc();
}

function updateRateHistoryVal(idx, key, val) {
  const v = parseFloat(val);
  if(isNaN(v)) return;
  rateHistory[idx][key] = v;
  saveRateHistory();
  applyRatesForYM(currentYear, currentMonth);
  updateRatesDisplay(); recalc();
  showToast(LANG==='JP'?'保険料率を更新しました':'요율 업데이트됨','s');
}

function deleteRateHistoryRow(idx) {
  if(rateHistory.length <= 1) { showToast(LANG==='JP'?'最低1件は必要です':'최소 1개는 필요합니다','w'); return; }
  const jp = LANG==='JP';
  if(!confirm(jp?`${rateHistory[idx].from}の料率を削除しますか？`:`${rateHistory[idx].from} 요율을 삭제하시겠습니까?`)) return;
  rateHistory.splice(idx,1);
  saveRateHistory();
  renderRateHistoryRows();
  applyRatesForYM(currentYear, currentMonth);
  updateRatesDisplay(); recalc();
}

function saveRatesPage() {
  saveRateHistory();
  showToast(LANG==='JP'?'保険料率履歴を保存しました ✓':'보험료율 이력을 저장했습니다 ✓','s');
}

// ══ RATES HISTORY ══
// 해당 연월에 적용할 요율 반환
function getRatesForYM(year, month) {
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  // 해당 월 이하 중 가장 최근 항목 찾기
  const sorted = [...rateHistory].sort((a,b) => a.from > b.from ? -1 : 1);
  const found = sorted.find(r => r.from <= ym);
  if(found) return {...found};
  // 없으면 가장 오래된 것 반환
  const oldest = [...rateHistory].sort((a,b) => a.from > b.from ? 1 : -1)[0];
  return oldest ? {...oldest} : { kenko:9.85, kaigo:1.62, kodomo:0.23, nenkin:18.30, koyo:0.50 };
}

// 해당 연월의 요율로 rates 업데이트
function applyRatesForYM(year, month) {
  const r = getRatesForYM(year, month);
  rates = { kenko:r.kenko, kaigo:r.kaigo, kodomo:r.kodomo, nenkin:r.nenkin, koyo:r.koyo };
  updateRatesDisplay();
  // 해당 월 요율이 등록되어 있는지 확인 (정확히 from이 일치하는 항목)
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  const exact = rateHistory.find(r => r.from === ym);
  return !!exact;
}

function saveRateHistory() {
  localStorage.setItem(LS.rateHistory, JSON.stringify(rateHistory));
}
function checkRateBanner() {
  const has2026 = rateHistory.some(r => r.from >= '2026-03');
  addNotification('rate-update-2026-04', 'info',
    '【보험료율 업데이트】2026년도 협회건포（도쿄도）보험료율이 개정되었습니다.',
    '【保険料率更新】2026年度 協会けんぽ（東京都）の保険料率が改定されました。'
  );
  if(!has2026) {
    addNotification('rate-alarm-2026-03', 'warn',
      '【요율 등록 필요】2026년도 보험료율이 미등록 상태입니다. 「최신 요율 가져오기」를 실행해 주세요.',
      '【要率登録が必要】2026年度の保険料率が未登録です。「最新要率を取得」を実行してください。'
    );
  }
  updateNotifBadge();
}

