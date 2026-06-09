// 수정: 2026-06-09 15:45 — fetchVacationData: _vacDirtyVersion 가드로 로컬 변경분 보호
'use strict';

// ── 동기화 로그 기록 헬퍼 (fire-and-forget) ──
function gasAppendLog(logType, target, result, memo) {
  if (!gasUrl) return;
  fetch(gasUrl, {
    method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'appendLog', logType, target: target || '', result: result || '성공', memo: memo || '' })
  }).catch(() => {});
}

// ── deleted_emp_ids 시트 기록 (fire-and-forget) ──
function gasAddDeletedEmpId(emp_no, leave_date) {
  if (!gasUrl) return;
  const auth = typeof gasWriteAuth === 'function' ? gasWriteAuth() : {};
  if (!auth._uid) return;
  fetch(gasUrl, {
    method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'addDeletedEmpId', emp_no, deleted_at: leave_date || '', deleted_by: auth._uid, ...auth })
  }).catch(() => {});
}

// ── deleted_emp_ids 시트에서 제거 (재직 복귀 시 사용, fire-and-forget) ──
function gasRemoveDeletedEmpId(emp_no) {
  if (!gasUrl) return;
  const auth = typeof gasWriteAuth === 'function' ? gasWriteAuth() : {};
  if (!auth._uid) return;
  fetch(gasUrl, {
    method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'removeDeletedEmpId', emp_no, ...auth })
  }).catch(() => {});
}

function collectAllPayrolls() {
  const result = [];

  employees.forEach(emp => {
    const pNo = String(emp.no).padStart(4, '0');
    for (let y = 2024; y <= 2030; y++) {
      for (let m = 1; m <= 12; m++) {
        const key = `kyuyo_p_${pNo}_${y}_${m}`;
        const saved = localStorage.getItem(key);

        if (saved) {
          try {
            const { _uid: _u, _token: _t, ...d } = JSON.parse(saved);
            result.push({ no: emp.no, name: emp.name, year: y, month: m, ...d });
          } catch(e){}
        }
      }
    }
  });

  return result;
}


async function testGas() { await testGasConnection(); }

async function testGasConnection() {
  const url = gasUrl;

  if (!url) {
    showToast(LANG === 'JP' ? 'URLを入力してください' : 'URL을 입력해 주세요', 'w');
    return;
  }

  const statusEl = document.getElementById('gas-sync-status');
  if (statusEl) {
    statusEl.textContent = LANG === 'JP' ? '接続テスト中...' : '연결 테스트 중...';
  }

  const callbackName = 'gasTest_' + Date.now();

  const cleanup = () => {
    delete window[callbackName];
    const old = document.getElementById(callbackName);
    if (old) old.remove();
  };

  window[callbackName] = function(res) {
    cleanup();

    if (res && res.ok) {
      if (statusEl) {
        statusEl.innerHTML =
          '<span style="color:var(--green)">✅ ' +
          (LANG === 'JP' ? '接続成功！' : '연결 성공！') +
          '</span>';
      }

      showToast(
        LANG === 'JP'
          ? '接続テスト成功 ✓'
          : '연결 테스트 성공 ✓',
        's'
      );
    } else {
      if (statusEl) {
        statusEl.innerHTML =
          '<span style="color:var(--red)">❌ ' +
          (res?.error || (LANG === 'JP' ? '接続失敗' : '연결 실패')) +
          '</span>';
      }
    }
  };

  const script = document.createElement('script');
  script.id = callbackName;
  script.src =
    url +
    '?action=test&callback=' +
    encodeURIComponent(callbackName) +
    '&t=' +
    Date.now();

  script.onerror = function() {
    cleanup();

    if (statusEl) {
      statusEl.innerHTML =
        '<span style="color:var(--red)">❌ ' +
        (LANG === 'JP'
          ? '接続失敗。URLを確認してください'
          : '연결 실패. URL 확인해 주세요') +
        '</span>';
    }

    showToast(
      LANG === 'JP'
        ? '接続失敗。URLを確認してください'
        : '연결 실패. URL 확인해 주세요',
      'e'
    );
  };

  document.body.appendChild(script);
}

function updateGasStatus() {
  const dot = document.getElementById('gasDot') || document.getElementById('gas-dot');
  const txt = document.getElementById('gasText') || document.getElementById('gas-txt');
  if(!dot||!txt) return;
  if(gasUrl) { dot.className='sdot sdot-ok'; txt.textContent=LANG==='JP'?'Google連携済み':'Google 연동됨'; }
  else { dot.className='sdot sdot-ng'; txt.textContent=LANG==='JP'?'Google未連携':'Google 미연동'; }
}

// GAS 통신 - JSONP 방식 (CORS 완전 우회)
function gasRequest(params, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cbName = 'wisepay_cb_' + Date.now();
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      delete window[cbName];
      if (document.body.contains(script)) document.body.removeChild(script);
      reject(new Error('timeout'));
    }, timeoutMs);

    window[cbName] = (data) => {
      clearTimeout(timeout);
      delete window[cbName];
      document.body.removeChild(script);
      resolve(data);
    };

    const qs = Object.entries(params)
      .map(([k,v]) => k + '=' + encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v))
      .join('&');
    script.src = gasUrl + (gasUrl.includes('?') ? '&' : '?') + qs + '&callback=' + cbName + '&t=' + Date.now();
    script.onerror = (ev) => {
      clearTimeout(timeout);
      delete window[cbName];
      console.error('[WisePay] gasRequest script load error', ev, script.src);
      reject(new Error('script load error'));
    };
    document.body.appendChild(script);
  });
}
const GAS_CODE = '// WisePay GAS 코드는 별도 파일(WisePay_GAS_code.gs)을 사용해 주세요';

// 공휴일 캐시 갱신 (7일마다 GAS에서 fetch → localStorage 저장)
async function fetchHolidayCache() {
  if (!gasUrl) return;
  try {
    const today = jstToday();
    const cacheDate = localStorage.getItem('holidayCacheDate');
    if (cacheDate && daysDiff(today, cacheDate) < 7) return;
    const res = await gasRequest({ action: 'getHolidays' }, 10000);
    if (res && res.ok && Array.isArray(res.data)) {
      localStorage.setItem('holidayCache', JSON.stringify(res.data.map(h => h.date)));
      localStorage.setItem('holidayCacheDate', today);
      try { updateEmpHeader(); } catch(e) {}
    }
  } catch(e) {
    console.log('[WisePay] holiday cache fetch skipped:', e.message);
  }
}

// GAS 페이지 준비
function openGasModal() {
  const preview = document.getElementById('gasCodePreview');
  if (preview) preview.textContent = GAS_CODE;
  renderBackupFolderStatus();
  if (typeof renderUserMgmt === 'function') renderUserMgmt();
}

// 로그인 후 GAS에서 조용히 최신 데이터 가져오기 (confirm 없음)
async function autoLoadFromGas() {
  if (!gasUrl) return;
  // GAS 콜드 스타트(~15초) 대응: 로딩 중 안내 표시
  const dot = document.getElementById('gasDot') || document.getElementById('gas-dot');
  const txt = document.getElementById('gasText') || document.getElementById('gas-txt');
  if (dot && txt) {
    dot.className = 'sdot sdot-wait';
    txt.textContent = LANG === 'JP' ? 'データ読込中…' : '데이터 로드 중…';
  }
  try {
    const result = await gasRequest({ action: 'getAll' }, 25000);
    const d = result.data || result;
    if (d.employees && d.employees.length > 0) {
      employees = d.employees.map(e => ({
        ...e,
        join: normalizeDate(e.join || ''),
        leave: normalizeDate(e.leave || ''),
        birth: normalizeDate(e.birth || ''),
        families: typeof e.families === 'string' ? JSON.parse(e.families || '[]') : (e.families || []),
        fuyouCount: parseInt(e.fuyouCount) || 0,
        commute: parseInt(e.commute) || 0,
        shaho_start: normalizeYM(e.shaho_start || '')
      }));
      localStorage.setItem(LS.emp, JSON.stringify(employees));
      syncFuyouFromFamilies();
    }
    if (d.deletedEmpIds && d.deletedEmpIds.length > 0) {
      gasDeletedEmpIds = d.deletedEmpIds.map(id => String(id).trim().padStart(4, '0')).filter(Boolean);
    }
    // 급여 데이터 전체 동기화: GAS 시트가 소스 오브 트루스
    // d.payrolls가 배열이 아니면 GAS 미지원 버전이므로 정리 로직 건너뜀 (로컬 보호)
    if (Array.isArray(d.payrolls)) {
      const gasPayrollKeys = new Set(
        d.payrolls.map(p => 'kyuyo_p_' + String(p.no).padStart(4, '0') + '_' + p.year + '_' + p.month)
      );
      // 로컬 급여 키 전부 수집 (삭제 전에 스냅샷)
      const localPayrollKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('kyuyo_p_')) localPayrollKeys.push(k);
      }
      // GAS에 없는 로컬 키 삭제
      localPayrollKeys.forEach(k => {
        if (!gasPayrollKeys.has(k)) localStorage.removeItem(k);
      });
      // GAS 데이터로 로컬 덮어쓰기 / 없으면 추가
      d.payrolls.forEach(p => {
        const key = 'kyuyo_p_' + String(p.no).padStart(4, '0') + '_' + p.year + '_' + p.month;
        localStorage.setItem(key, JSON.stringify(p));
      });
    }
    if (d.rateHistory && d.rateHistory.length > 0) {
      rateHistory = d.rateHistory.map(r => ({
        from: normalizeYM(r.from),
        kenko: parseFloat(r.kenko) || 9.85,
        kaigo: parseFloat(r.kaigo) || 1.62,
        kodomo: parseFloat(r.kodomo) || 0,
        nenkin: parseFloat(r.nenkin) || 18.30,
        koyo: parseFloat(r.koyo) || 0.50
      }));
      // GAS 데이터 다운로드 후 누락 항목 보정 — 변경 있으면 GAS에 역업로드해서 동기화
      const needsSync = migrateRateHistory();
      if (needsSync) uploadRateHistoryToGas();
    }
    // 지급완료 연월 동기화 — GAS가 소스 오브 트루스이므로 항상 replace
    if (Array.isArray(d.paidYMs)) {
      paidYMs = new Set(d.paidYMs);
      localStorage.setItem(LS.paidYMs, JSON.stringify([...paidYMs]));
    }
    renderEmpSelect();
    loadPayrollForm();
    renderPaidBtn();
    applyRatesForYM(currentYear, currentMonth);
    buildAnnualYearSel();
    buildAnnualEmpSel();
    renderAnnual();
    buildHistEmpSel();
    renderHistory();
    updateGasStatus();
    gasAppendLog('자동동기화', '전체', '성공', `사원 ${(d.employees||[]).length}명 / 급여 ${(d.payrolls||[]).length}건`);
    // GAS 데이터 완전 동기화 후 알림 재체크 (paidYMs·employees·payroll localStorage 갱신 완료 시점)
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.id === 'wiseadmin') {
      if (typeof checkAndShowPayrollAlerts === 'function') checkAndShowPayrollAlerts([...paidYMs]);
      setTimeout(() => { if (typeof checkVacationAlerts === 'function') checkVacationAlerts(); }, 200);
    }
    fetchHolidayCache().catch(() => {}); // 공휴일 캐시 갱신 (7일마다, fire-and-forget)
    fetchVacationData().catch(() => {}); // 유급휴가 데이터 동기화 (fire-and-forget)
  } catch (err) {
    gasAppendLog('자동동기화', '전체', '실패', err.message);
    console.warn('GAS auto-load failed:', err);
  }
}

// 요율 이력만 조용히 Google 시트에 업로드 (fire-and-forget)
async function uploadRateHistoryToGas() {
  if (!gasUrl) return;
  try {
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'exportAll', rateHistory: rateHistory, ...(typeof gasWriteAuth === 'function' ? gasWriteAuth() : {}) })
    });
  } catch(err) {
    console.warn('uploadRateHistoryToGas error:', err);
  }
}

function normalizePayrollHeader(header) {
  return (header || '').toString().trim().replace(/[\s"'（）()]/g, '').toLowerCase();
}

function parseJapanesePayrollDate(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  text = text.replace(/[　\s]+/g, ' ');
  text = text.replace(/[．。\-\.]/g, '/');
  text = text.replace(/年/g, '/').replace(/月/g, '/').replace(/日/g, '');
  text = text.replace(/令和/gi, 'R');
  text = text.replace(/r/gi, 'R');

  let match = text.match(/^R(\d+)[/](\d{1,2})[/](\d{1,2})$/i);
  if (match) {
    const y = 1988 + parseInt(match[1], 10);
    return { year: y, month: parseInt(match[2], 10), day: parseInt(match[3], 10) };
  }
  match = text.match(/^(\d{4})[/](\d{1,2})[/](\d{1,2})$/);
  if (match) {
    return { year: parseInt(match[1], 10), month: parseInt(match[2], 10), day: parseInt(match[3], 10) };
  }
  return null;
}

function detectPayrollPeriodCell(row) {
  for (let i = 0; i < row.length; i++) {
    const raw = row[i];
    if (!raw && raw !== 0) continue;
    const text = String(raw).trim();
    if (!text) continue;
    const candidate = text.replace(/[　\s]+/g, ' ').replace(/[．。\-\.]/g, '/').replace(/年/g, '/').replace(/月/g, '/').replace(/日/g, '').replace(/令和/gi, 'R').replace(/r/gi, 'R').replace(/分$/, '');
    if (/^R\d+[/]\d{1,2}$/.test(candidate) || /^\d{4}[/]\d{1,2}$/.test(candidate)) {
      return text;
    }
    if (/^\d{1,2}月分$/.test(text) || /^\d{1,2}月$/.test(text)) {
      return text;
    }
  }
  return null;
}

function resolvePayrollYearMonth(periodRaw, payDateRaw) {
  const payDate = parseJapanesePayrollDate(payDateRaw);
  const periodText = String(periodRaw || '').trim();
  if (periodText) {
    let clean = periodText.replace(/[　\s]+/g, ' ').replace(/[．。\-]/g, '/').replace(/年/g, '/').replace(/月/g, '/').replace(/日/g, '').replace(/分/g, '').replace(/令和/gi, 'R').replace(/r/gi, 'R');
    clean = clean.replace(/\/+/g, '/').replace(/\/$/, '');
    let m;
    let y;
    let match = clean.match(/^R(\d+)[/](\d{1,2})$/i);
    if (match) {
      y = 1988 + parseInt(match[1], 10);
      m = parseInt(match[2], 10);
      return { year: y, month: m };
    }
    match = clean.match(/^(\d{4})[/](\d{1,2})$/);
    if (match) {
      return { year: parseInt(match[1], 10), month: parseInt(match[2], 10) };
    }
    match = clean.match(/^(\d{1,2})月分$/);
    if (match) {
      m = parseInt(match[1], 10);
      if (payDate && payDate.year) {
        y = payDate.year;
        if (payDate.month === 1 && m === 12) y -= 1;
        else if (payDate.month < m) y -= 1;
        return { year: y, month: m };
      }
    }
    match = clean.match(/^(\d{1,2})月$/);
    if (match) {
      m = parseInt(match[1], 10);
      if (payDate && payDate.year) {
        y = payDate.year;
        if (payDate.month === 1 && m === 12) y -= 1;
        else if (payDate.month < m) y -= 1;
        return { year: y, month: m };
      }
    }
    match = clean.match(/^(\d{1,2})$/);
    if (match) {
      m = parseInt(match[1], 10);
      if (m === 0) {
        // 0은 유효한 월이 아니므로 건너뜀
      } else if (payDate && payDate.year) {
        y = payDate.year;
        if (payDate.month === 1 && m === 12) y -= 1;
        else if (payDate.month < m) y -= 1;
        return { year: y, month: m };
      }
    }
  }
  if (payDate) {
    let year = payDate.year;
    let month = payDate.month - 1;
    if (month === 0) { month = 12; year -= 1; }
    return { year, month };
  }
  return null;
}

function mapPayrollHeaderToField(header) {
  const h = normalizePayrollHeader(header);
  if (!h) return null;
  const exact = {
    '基本給': 'r-base',
    '時間外手当': 'r-ot',
    '残業手当': 'r-ot',
    '超過勤務手当': 'r-ot',
    '欠勤控除': 'r-kintai',
    '遅刻早退控除': 'r-kintai',
    '非課税通勤手当': 'r-commute',
    '課税通勤手当': 'r-commutetax',
    '勤務手当': 'r-kinmu',
    '職務手当': 'r-shokumu',
    '現場手当': 'r-field',
    '住民税': 'k-jumin',
    '年末調整': 'k-nencho',
    '差引支給金額': '_net',
    '従業員番号': 'no',
    '社員番号': 'no',
    '社員コード': 'no',
    '従業員名': 'name',
    '氏名': 'name',
    '支給月日': 'payDate',
    '月分': 'period',
    '対象月': 'period',
    '給与対象月': 'period',
    '支給対象月': 'period',
    '対象期間': 'period',
    '給与対象': 'period'
  };
  if (exact[h]) return exact[h];
  if (h.includes('月分')) return 'period';
  if (h.includes('対象') && h.includes('月')) return 'period';
  if (h.includes('課税通勤')) return 'r-commutetax';
  if (h.includes('非課税通勤')) return 'r-commute';
  if (h.includes('通勤') && h.includes('税')) return 'r-commutetax';
  if (h.includes('通勤')) return 'r-commute';
  if (h.includes('時間外') || h.includes('残業') || h.includes('超過勤務')) return 'r-ot';
  if (h.includes('欠勤') || h.includes('遅刻') || h.includes('早退')) return 'r-kintai';
  if (h.includes('職務') || h.includes('業務') || h.includes('役職')) return 'r-shokumu';
  if (h.includes('勤務') || h.includes('勤怠')) return 'r-kinmu';
  if (h.includes('現場')) return 'r-field';
  if (h.includes('基本') || h.includes('給与') || h.includes('支給額') || h.includes('支給金額')) return 'r-base';
  if (h.includes('手当')) return 'r-field';
  if (h.includes('税')) return 'k-jumin';
  return null;
}

function buildPayrollFieldMap(headers) {
  return headers.map(h => mapPayrollHeaderToField(h));
}

// ── 파일 선택 커스텀 레이블 업데이트 ──
function updateFreeeFileLabel() {
  const input = document.getElementById('freeePayrollInput');
  const label = document.getElementById('freeeFileLabel');
  if (!label) return;
  if (!input || !input.files || input.files.length === 0) {
    label.textContent = LANG === 'JP' ? 'ファイル未選択' : '선택된 파일 없음';
    return;
  }
  label.textContent = input.files.length === 1
    ? input.files[0].name
    : (LANG === 'JP' ? `${input.files.length}個のファイル` : `${input.files.length}개 파일 선택됨`);
}

// ── 급여 CSV → 구글 드라이브 임포트 (브라우저 업로드 방식) ──
async function importFreeePayrollCSV() {
  const input    = document.getElementById('freeePayrollInput');
  const statusEl = document.getElementById('freeePayrollStatus');
  if (!gasUrl) { showToast(LANG==='JP'?'先にURLを設定してください':'먼저 URL을 설정해 주세요','w'); return; }
  if (!input?.files?.length) { showToast(LANG==='JP'?'CSVファイルを選択してください':'CSV 파일을 선택해 주세요','w'); return; }

  if (statusEl) statusEl.innerHTML = '처리 중... ⏳';
  const payrolls = [];

  for (const file of input.files) {
    const text = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsText(file, 'Shift_JIS');
    });

    const rows = _parseCSV(text);
    if (rows.length < 2) continue;
    const headers = rows[0];
    const fieldMap = buildPayrollFieldMap(headers);
    const findIndexFor = (field, guesses=[]) => {
      let idx = fieldMap.indexOf(field);
      if (idx >= 0) return idx;
      // fallback: try guessing by header text
      for (const g of guesses) {
        for (let k = 0; k < headers.length; k++) {
          if (normalizePayrollHeader(headers[k]).includes(normalizePayrollHeader(g))) return k;
        }
      }
      return -1;
    };
    const idxPayDate = findIndexFor('payDate', ['支給月日', '支給日', '支給年月日']);
    const idxPeriod = findIndexFor('period', ['月分', '対象月', '給与対象月', '対象期間', '給与対象', '月分（回）']);
    const idxNo = findIndexFor('no', ['従業員番号', '社員番号', '社員コード', '社員ID']);
    const idxName = findIndexFor('name', ['従業員名', '社員名', '氏名', '名前', 'name']);
    const gv = (r, n) => {
      const i = findIndexFor(n, [n]);
      if (i < 0 || i >= r.length) return 0;
      const v = (r[i] || '').toString().replace(/,/g, '').trim();
      return v === '' ? 0 : (parseInt(v, 10) || 0);
    };
    const fieldValues = (r, field) => {
      const vals = [];
      for (let idx = 0; idx < fieldMap.length; idx++) {
        if (fieldMap[idx] !== field) continue;
        const v = (r[idx] || '').toString().replace(/,/g, '').trim();
        if (v === '') continue;
        vals.push(parseInt(v, 10) || 0);
      }
      return vals.reduce((sum, v) => sum + v, 0);
    };

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      let periodRaw = (idxPeriod >= 0 ? (r[idxPeriod] || '') : '').toString().trim();
      if (periodRaw === '0') periodRaw = '';
      if (!periodRaw) {
        const fallback = detectPayrollPeriodCell(r);
        if (fallback) periodRaw = fallback;
      }
      const dateStr = (idxPayDate >= 0 ? (r[idxPayDate] || '') : '').toString().trim();
      const ym = resolvePayrollYearMonth(periodRaw, dateStr);
      if (!ym) continue;
      const year = ym.year;
      const month = ym.month;
      if (!year || !month) continue;
      const no = parseInt((idxNo >= 0 ? (r[idxNo] || '') : '').toString().trim());
      if (!no) continue;

      payrolls.push({
        no, name: (idxName >= 0 ? (r[idxName] || '') : '').toString().trim(), year, month,
        'r-base':       fieldValues(r,'r-base'),
        'r-ot':         fieldValues(r,'r-ot'),
        'r-kintai':     fieldValues(r,'r-kintai'),
        'r-commute':    fieldValues(r,'r-commute'),
        'r-commutetax': fieldValues(r,'r-commutetax'),
        'r-kinmu':      fieldValues(r,'r-kinmu'),
        'r-shokumu':    fieldValues(r,'r-shokumu'),
        'r-field':      fieldValues(r,'r-field'),
        'k-jumin':      gv(r,'住民税'),
        'k-nencho':     gv(r,'年末調整'),
        '_net':         gv(r,'差引支給金額'),
      });
    }
  }

  if (!payrolls.length) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">❌ 유효한 데이터 없음</span>';
    return;
  }

  try {
    const timeoutMs = 20000; // 20s
    const batchSize = 5;
    const batches = [];
    for (let i = 0; i < payrolls.length; i += batchSize) {
      batches.push(payrolls.slice(i, i + batchSize));
    }
    let totalSaved = 0;
    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      const res = await gasRequest({ action: 'importPayrolls', payrolls: JSON.stringify(batch) }, timeoutMs);
      if (!res || !res.ok) throw new Error((res && res.error) ? res.error : '서버 응답 확인 실패');
      totalSaved += (res.count || 0);
    }
    // localStorage도 즉시 갱신
    payrolls.forEach(p => {
      const pNo = String(parseInt(p.no)).padStart(4, '0');
      const key = 'kyuyo_p_' + pNo + '_' + p.year + '_' + p.month;
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      const { no: _n, name: _nm, year: _y, month: _m, ...fields } = p;
      localStorage.setItem(key, JSON.stringify({ ...existing, ...fields }));
    });
    const msg = `✅ ${payrolls.length}건 → Google 시트 + 로컬 저장 완료 (서버 ${totalSaved}건)`;
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--green)">${msg}</span>`;
    showToast(msg, 's');
    input.value = '';
    loadPayrollForm();
  } catch(err) {
    if (err && err.name === 'AbortError') {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ タイムアウト: サーバ応答なし</span>`;
      showToast(LANG==='JP' ? 'サーバ応答がありません（タイムアウト）' : '서버 응답 없음(타임아웃)', 'e');
      console.error('importFreeePayrollCSV timeout after', timeoutMs, 'ms');
    } else {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">❌ ${err && err.message ? err.message : 'Upload failed'}</span>`;
      console.error('importFreeePayrollCSV error:', err);
    }
  }
}

function _parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM 제거
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = []; let field = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { row.push(field); field = ''; }
      else { field += c; }
    }
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// 유급휴가 데이터를 GAS에서 가져와 localStorage에 저장
// 페치 시작 후 로컬 변경이 발생하면 덮어쓰지 않음 (_vacDirtyVersion 가드)
async function fetchVacationData() {
  if (!gasUrl) return;
  const versionAtStart = typeof _vacDirtyVersion !== 'undefined' ? _vacDirtyVersion : 0;
  try {
    const res = await gasRequest({ action: 'getVacation' }, 15000);
    if (res && res.ok && Array.isArray(res.data)) {
      // 페치 중 로컬 변경이 발생했으면 GAS 데이터로 덮어쓰지 않음
      if (typeof _vacDirtyVersion !== 'undefined' && _vacDirtyVersion !== versionAtStart) return;
      const rebuilt = {};
      res.data.forEach(r => {
        const no = String(r.emp_no || '').trim().padStart(4, '0');
        if (!no || no === '0000') return;
        if (!rebuilt[no]) rebuilt[no] = [];
        const { emp_no, ...rest } = r;
        rebuilt[no].push(rest);
      });
      vacationData = rebuilt;
      localStorage.setItem(LS.vacation, JSON.stringify(vacationData));
    }
  } catch(e) {
    console.log('[WisePay] vacation fetch skipped:', e.message);
  }
}

// 유급휴가 데이터 전체를 GAS에 저장 (fire-and-forget)
async function saveVacationToGas(vData) {
  if (!gasUrl) return;
  const flat = [];
  Object.keys(vData || {}).forEach(empNo => {
    (vData[empNo] || []).forEach(r => {
      flat.push({ emp_no: empNo, ...r });
    });
  });
  try {
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'saveVacation', data: flat, ...(typeof gasWriteAuth === 'function' ? gasWriteAuth() : {}) })
    });
  } catch(e) {
    console.warn('saveVacationToGas error:', e);
  }
}

// GAS 코드 클립보드 복사
function copyGasCode() {
  const text = document.getElementById('gasCodePreview')?.textContent || GAS_CODE;
  navigator.clipboard.writeText(text)
    .then(() => showToast(LANG === 'JP' ? 'コードをコピーしました ✓' : '코드를 복사했습니다 ✓', 's'))
    .catch(() => showToast(LANG === 'JP' ? 'コピー失敗' : '복사 실패', 'e'));
}

