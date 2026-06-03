// WisePay GAS Script
// 수정: 2026-06-11 16:30 — sendPayConfirmReminderEmail 본문 🔒 이모지 → [送金完了] 텍스트로 교체
// 이 파일 전체를 Google Apps Script(code.gs)에 붙여넣고 재배포하세요.
// 배포 설정: 웹 앱 > 액세스 권한: 전체(Everyone)
//
// ⚠️ PDF 파싱 기능을 쓰려면:
//   GAS 편집기 왼쪽 메뉴 「서비스(+)」→ Drive API v2 추가 필요

const ADMIN_EMAIL   = 'lucky4694@gmail.com';

const SHEET_EMP     = '사원정보';
const SHEET_PAY     = '급여데이터';
const SHEET_RATE    = '보험료율데이터';
const SHEET_LOG     = 'WisePay로그';
const SHEET_USERS   = 'users';
const SHEET_DELETED = 'deleted_emp_ids';
const SHEET_PAID    = '지급완료이력';
const SHEET_SNAP    = '급여스냅샷';

// 협회けんぽ URL (2025년 사이트 개편 후 변경된 URL)
const KENPO_INDEX_URL = 'https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/';
const KENPO_BASE_URL  = 'https://www.kyoukaikenpo.or.jp';

// ── Entry points ──────────────────────────────────────────────

function doGet(e) {
  const action   = e.parameter.action   || '';
  const callback = e.parameter.callback || '';
  let result;
  try {
    if      (action === 'test')                                         result = { ok: true };
    else if (action === 'getAll')                                       result = getAllData();
    else if (action === 'getDeletedEmpIds')                             result = { ok: true, data: getDeletedEmpIdsData() };
    else if (action === 'scrapeRates' || action === 'scrapeKenpoRates') result = scrapeKenpoRates();
    else if (action === 'getUsers')                                       result = getUsers();
    else result = { ok: false, error: 'Unknown action: ' + action };
  } catch(err) {
    result = { ok: false, error: err.message };
  }
  const json = JSON.stringify(result);
  return ContentService
    .createTextOutput(callback ? callback + '(' + json + ')' : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.type === 'exportAll') {
      if (!verifyWriteToken(data)) return jsonResponse({ ok: false, error: 'Unauthorized' });
      if (data.employees)   saveSheet(SHEET_EMP,  data.employees);
      if (data.payrolls)    saveSheet(SHEET_PAY,  data.payrolls);
      if (data.rateHistory) saveSheet(SHEET_RATE, data.rateHistory);
      return jsonResponse({ ok: true });
    }
    if (data.type === 'employees') {
      if (!verifyWriteToken(data)) return jsonResponse({ ok: false, error: 'Unauthorized' });
      if (data.employees && data.employees.length > 0) {
        saveSheet(SHEET_EMP, data.employees);
      }
      return jsonResponse({ ok: true, count: (data.employees || []).length });
    }
    if (data.type === 'addDeletedEmpId') {
      if (!verifyWriteToken(data)) return jsonResponse({ ok: false, error: 'Unauthorized' });
      var empNo = String(data.emp_no || '').trim();
      if (!empNo) return jsonResponse({ ok: false, error: 'Missing emp_no' });
      var deletedAt = String(data.deleted_at || '').replace(/T.*$/, '').trim();
      var deletedBy = String(data.deleted_by || 'system').trim();
      var delSheet = getSheet(SHEET_DELETED);
      if (delSheet.getLastRow() === 0) {
        delSheet.getRange(1, 1, 1, 3).setValues([['emp_no', 'deleted_at', 'deleted_by']]);
        delSheet.appendRow([empNo, deletedAt, deletedBy]);
      } else {
        var delVals = delSheet.getDataRange().getValues();
        var delHdrs = delVals[0];
        var noCol = delHdrs.indexOf('emp_no');
        var exists = noCol >= 0 && delVals.slice(1).some(function(r) { return String(r[noCol]).trim() === empNo; });
        if (!exists) delSheet.appendRow([empNo, deletedAt, deletedBy]);
      }
      return jsonResponse({ ok: true });
    }
    if (data.type === 'removeDeletedEmpId') {
      if (!verifyWriteToken(data)) return jsonResponse({ ok: false, error: 'Unauthorized' });
      var rEmpNo = String(data.emp_no || '').trim();
      if (!rEmpNo) return jsonResponse({ ok: false, error: 'Missing emp_no' });
      var rSheet = getSheet(SHEET_DELETED);
      if (rSheet.getLastRow() < 2) return jsonResponse({ ok: true });
      var rVals = rSheet.getDataRange().getValues();
      var rHdrs = rVals[0];
      var rNoCol = rHdrs.indexOf('emp_no');
      if (rNoCol >= 0) {
        for (var ri = 1; ri < rVals.length; ri++) {
          if (String(rVals[ri][rNoCol]).trim() === rEmpNo) {
            rSheet.deleteRow(ri + 1);
            break;
          }
        }
      }
      return jsonResponse({ ok: true });
    }
    if (data.type === 'markPaid') {
      if (!verifyWriteToken(data)) return jsonResponse({ ok: false, error: 'Unauthorized' });
      var mpYear     = parseInt(data.year);
      var mpMonth    = parseInt(data.month);
      var mpPaidAt   = String(data.paidAt  || '');
      var mpPaidBy   = String(data.paidBy  || '');
      var mpPayrolls = data.payrolls || [];

      // 1. 지급완료이력 기록 (중복 방지)
      var paidSheet = getSheet(SHEET_PAID);
      if (paidSheet.getLastRow() === 0) {
        paidSheet.getRange(1, 1, 1, 4).setValues([['year', 'month', 'paidAt', 'paidBy']]);
      }
      var paidVals = paidSheet.getDataRange().getValues();
      var paidHdrs = paidVals[0] || [];
      var pYCol = paidHdrs.indexOf('year');
      var pMCol = paidHdrs.indexOf('month');
      var alreadyPaid = pYCol >= 0 && paidVals.slice(1).some(function(r) {
        return parseInt(r[pYCol]) === mpYear && parseInt(r[pMCol]) === mpMonth;
      });
      if (!alreadyPaid) {
        paidSheet.appendRow([mpYear, mpMonth, mpPaidAt, mpPaidBy]);
        var jstNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
        sendConfirmationEmail(mpYear, mpMonth, jstNow, mpPaidBy || 'wiseadmin');
      }

      // 2. 급여스냅샷 시트에 누적 기록
      if (mpPayrolls.length > 0) {
        var snapSheet = getSheet(SHEET_SNAP);
        var snapshotAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        var cleaned = mpPayrolls.map(function(p) {
          var c = {};
          Object.keys(p).forEach(function(k) {
            if (k !== '_uid' && k !== '_token') c[k] = p[k];
          });
          c.paidAt     = mpPaidAt;
          c.snapshotAt = snapshotAt;
          return c;
        });
        // 전체 키 수집
        var allKeys = [];
        var keySet  = {};
        cleaned.forEach(function(r) {
          Object.keys(r).forEach(function(k) { if (!keySet[k]) { keySet[k] = true; allKeys.push(k); } });
        });
        // 헤더 초기화 또는 신규 컬럼 추가
        if (snapSheet.getLastRow() === 0) {
          snapSheet.getRange(1, 1, 1, allKeys.length).setValues([allKeys]);
        }
        var snapHdrs = snapSheet.getRange(1, 1, 1, snapSheet.getLastColumn()).getValues()[0];
        var newHdrs  = allKeys.filter(function(k) { return snapHdrs.indexOf(k) < 0; });
        if (newHdrs.length > 0) {
          snapSheet.getRange(1, snapHdrs.length + 1, 1, newHdrs.length).setValues([newHdrs]);
          newHdrs.forEach(function(k) { snapHdrs.push(k); });
        }
        var rows = cleaned.map(function(p) {
          return snapHdrs.map(function(h) {
            var v = p[h] !== undefined ? p[h] : '';
            return (Array.isArray(v) || (v !== null && typeof v === 'object' && !(v instanceof Date)))
              ? JSON.stringify(v) : v;
          });
        });
        snapSheet.getRange(snapSheet.getLastRow() + 1, 1, rows.length, snapHdrs.length).setValues(rows);
      }

      return jsonResponse({ ok: true });
    }
    if (data.type === 'appendLog') {
      appendLog(data);
      return jsonResponse({ ok: true });
    }
    if (data.type === 'clearSyncLog') {
      const sheet = getSheet(SHEET_LOG);
      sheet.clearContents();
      return jsonResponse({ ok: true });
    }
    if (data.type === 'payroll') {
      if (!verifyWriteToken(data)) return jsonResponse({ ok: false, error: 'Unauthorized' });
      const { type: _t, _uid: _u, _token: _tok, ...payrollData } = data;
      const existing = sheetToObjects(getSheet(SHEET_PAY));
      const payMap = {};
      existing.forEach(function(p) {
        payMap[String(parseInt(p.no)) + '_' + p.year + '_' + p.month] = p;
      });
      const k = String(parseInt(payrollData.no)) + '_' + payrollData.year + '_' + payrollData.month;
      if (payMap[k]) { Object.assign(payMap[k], payrollData); } else { payMap[k] = payrollData; }
      const merged = Object.values(payMap).sort(function(a, b) {
        const nd = parseInt(a.no) - parseInt(b.no); if (nd !== 0) return nd;
        const yd = a.year - b.year; if (yd !== 0) return yd;
        return a.month - b.month;
      });
      saveSheet(SHEET_PAY, merged);
      return jsonResponse({ ok: true });
    }
    if (data.type === 'importPayrolls') {
      if (!verifyWriteToken(data)) return jsonResponse({ ok: false, error: 'Unauthorized' });
      const incoming = data.payrolls || [];
      if (incoming.length) {
        const existing = sheetToObjects(getSheet(SHEET_PAY));
        const payMap = {};
        existing.forEach(function(p) {
          payMap[String(parseInt(p.no)) + '_' + p.year + '_' + p.month] = p;
        });
        incoming.forEach(function(fp) {
          const k = fp.no + '_' + fp.year + '_' + fp.month;
          if (payMap[k]) { Object.assign(payMap[k], fp); } else { payMap[k] = fp; }
        });
        const merged = Object.values(payMap).sort(function(a, b) {
          const nd = parseInt(a.no) - parseInt(b.no);
          if (nd !== 0) return nd;
          const yd = a.year - b.year;
          if (yd !== 0) return yd;
          return a.month - b.month;
        });
        saveSheet(SHEET_PAY, merged);
      }
      return jsonResponse({ ok: true, count: incoming.length });
    }
    if (data.type === 'updatePassword') {
      var upId      = String(data.id        || '').trim();
      var newHash   = String(data.hash      || '').toLowerCase().trim();
      var verifyHash = data.verifyHash ? String(data.verifyHash).toLowerCase().trim() : null;
      if (!upId || !newHash) return jsonResponse({ ok: false, error: 'Missing parameters' });
      var usersSheet2 = getSheet(SHEET_USERS);
      var allVals = usersSheet2.getDataRange().getValues();
      if (allVals.length < 2) return jsonResponse({ ok: false, error: 'User not found' });
      var hdrs = allVals[0];
      var idCol   = hdrs.indexOf('ID');
      var hashCol = hdrs.indexOf('PW_HASH');
      if (idCol < 0 || hashCol < 0) return jsonResponse({ ok: false, error: 'Invalid sheet format' });
      var targetRow = -1, curHash = '';
      for (var ri = 1; ri < allVals.length; ri++) {
        if (String(allVals[ri][idCol] || '').trim() === upId) {
          targetRow = ri; curHash = String(allVals[ri][hashCol] || '').toLowerCase().trim(); break;
        }
      }
      if (targetRow < 0) return jsonResponse({ ok: false, error: 'User not found' });
      if (verifyHash && curHash !== verifyHash) {
        return jsonResponse({ ok: false, error: '현재 비밀번호가 틀렸습니다 / 現在のパスワードが違います' });
      }
      usersSheet2.getRange(targetRow + 1, hashCol + 1).setValue(newHash);
      return jsonResponse({ ok: true });
    }
    if (data.type === 'verifyLogin') {
      var loginId   = String(data.id   || '').trim();
      var loginHash = String(data.hash || '').toLowerCase().trim();
      if (!loginId || !loginHash) return jsonResponse({ ok: false, error: 'Missing credentials' });
      var usersSheet = getSheet(SHEET_USERS);
      var users = sheetToObjects(usersSheet);
      var matched = null;
      for (var i = 0; i < users.length; i++) {
        var u = users[i];
        if (String(u['ID'] || '').trim() === loginId &&
            String(u['PW_HASH'] || '').toLowerCase().trim() === loginHash) {
          matched = u; break;
        }
      }
      if (matched) {
        return jsonResponse({ ok: true, user: {
          id:          String(matched['ID']       || '').trim(),
          name:        String(matched['이름']     || '').trim(),
          role:        String(matched['권한']     || '').trim(),
          sessionType: String(matched['세션타입'] || '').trim(),
        }});
      }
      return jsonResponse({ ok: false });
    }
    if (data.type === 'sendReminderEmail') {
      sendPayrollReminderEmail(parseInt(data.year), parseInt(data.month));
      return jsonResponse({ ok: true });
    }
    if (data.type === 'sendDataInputReminder') {
      sendDataInputReminderEmail(parseInt(data.year), parseInt(data.month));
      return jsonResponse({ ok: true });
    }
    if (data.type === 'sendPayConfirmReminder') {
      sendPayConfirmReminderEmail(parseInt(data.year), parseInt(data.month));
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ ok: false, error: 'Unknown type' });
  } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function sendPayrollReminderEmail(year, month) {
  var subject = '[給与Pro] ' + year + '年' + month + '月分 給与振込リマインダー';
  var body    = year + '年' + month + '月分の給与振込期限は' + year + '年' + month + '月10日です。\n' +
                'お早めに振込手続きをお願いします。\n\n' +
                '--\n給与Pro by Wisewires';
  GmailApp.sendEmail(ADMIN_EMAIL, subject, body);
}

function sendDataInputReminderEmail(year, month) {
  var subject = '[給与Pro] ' + year + '年' + month + '月分 給与データ未入力のお知らせ';
  var body    = month + '月分の給与データがまだ入力されていません。\n' +
                '残業代等をご確認の上、給与Proに入力してください。\n\n' +
                '--\n給与Pro by Wisewires';
  GmailApp.sendEmail(ADMIN_EMAIL, subject, body);
}

function sendPayConfirmReminderEmail(year, month) {
  var subject = '[給与Pro] ' + year + '年' + month + '月分 送金完了確認のお願い';
  var body    = year + '年' + month + '月分の給与振込はお済みですか？\n' +
                '振込確認後、給与Pro上の[送金完了]ボタンを押してください。\n\n' +
                '--\n給与Pro by Wisewires';
  GmailApp.sendEmail(ADMIN_EMAIL, subject, body);
}

function sendConfirmationEmail(year, month, confirmedAt, confirmedBy) {
  var subject = '[給与Pro] ' + year + '年' + month + '月分 給与確定通知';
  var body    = '給与支払が確定されました。\n\n' +
                '■ 対象月：' + year + '年' + month + '月分\n' +
                '■ 確定日時：' + confirmedAt + '（JST）\n' +
                '■ 確定者：' + confirmedBy + '\n\n' +
                '--\n給与Pro by Wisewires';
  GmailApp.sendEmail(ADMIN_EMAIL, subject, body);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Data helpers ──────────────────────────────────────────────

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function sheetToObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(function(row) {
    const obj = {};
    headers.forEach(function(h, i) {
      if (h === '') return;
      const key = String(h);
      const val = row[i];
      if ((key === 'from' || key === 'shaho_start') && val instanceof Date) {
        obj[key] = val.getFullYear() + '-' + String(val.getMonth() + 1).padStart(2, '0');
      } else if (key === 'shaho_start' && typeof val === 'string') {
        const ym = val.trim();
        obj[key] = /^\d{4}-\d{2}$/.test(ym) ? ym : '';
      } else if ((key === 'join' || key === 'birth' || key === 'leave' || key === 'deleted_at') && val instanceof Date) {
        obj[key] = val.getFullYear() + '-' +
          String(val.getMonth() + 1).padStart(2, '0') + '-' +
          String(val.getDate()).padStart(2, '0');
      } else if ((key === 'join' || key === 'birth' || key === 'leave' || key === 'deleted_at') && typeof val === 'string') {
        obj[key] = val.replace(/T.*$/, '').trim();
      } else {
        obj[key] = val;
      }
    });
    return obj;
  });
}

function saveSheet(name, records) {
  if (!records || !records.length) return;
  const sheet = getSheet(name);
  sheet.clearContents();
  // 인증 필드(_uid, _token)는 시트에 저장하지 않음
  const cleaned = records.map(function(r) {
    const c = {};
    Object.keys(r).forEach(function(k) { if (k !== '_uid' && k !== '_token') c[k] = r[k]; });
    return c;
  });
  const headers = [...new Set(cleaned.flatMap(r => Object.keys(r)))];
  const rows = [headers, ...cleaned.map(r => headers.map(function(h) {
    const v = r[h] !== undefined ? r[h] : '';
    return (Array.isArray(v) || (v !== null && typeof v === 'object' && !(v instanceof Date)))
      ? JSON.stringify(v) : v;
  }))];
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
}

function appendLog(data) {
  const HEADERS = ['일시', '작업종류', '대상', '결과', '비고'];
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 구버전 '동기화로그' 시트가 남아있으면 자동 삭제
  const oldSheet = ss.getSheetByName('동기화로그');
  if (oldSheet) ss.deleteSheet(oldSheet);

  const sheet = getSheet(SHEET_LOG);
  const lastRow = sheet.getLastRow();

  // 헤더가 없거나 구버전(영문 헤더)이면 시트 초기화 후 한국어 헤더 설정
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  } else {
    const curH = sheet.getRange(1, 1, 1, 5).getValues()[0];
    if (curH[0] !== '일시') {
      sheet.clearContents();
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    }
  }

  // 새 로그 행을 헤더 바로 아래(2행)에 삽입 — 최신순 정렬
  const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  const row = [ts, data.logType || '', data.target || '', data.result || '', data.memo || ''];
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, row.length).setValues([row]);

  // 3개월 이상 된 로그 자동 삭제 (행은 최신→구 순서)
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const total = sheet.getLastRow();
  if (total > 1) {
    const tsVals = sheet.getRange(2, 1, total - 1, 1).getValues();
    let deleteFrom = -1;
    for (let i = tsVals.length - 1; i >= 0; i--) {
      if (new Date(tsVals[i][0]) < cutoff) {
        deleteFrom = i + 2; // 1-based 인덱스 + 헤더 1행
      } else {
        break;
      }
    }
    if (deleteFrom > 0) {
      sheet.deleteRows(deleteFrom, total - deleteFrom + 1);
    }
  }
}

function verifyWriteToken(data) {
  var uid   = String(data._uid   || '').trim();
  var token = String(data._token || '').toLowerCase().trim();
  if (!uid || !token) return false;
  var rows = sheetToObjects(getSheet(SHEET_USERS));
  for (var i = 0; i < rows.length; i++) {
    var u = rows[i];
    if (String(u['ID']   || '').trim()             === uid   &&
        String(u['PW_HASH'] || '').toLowerCase().trim() === token &&
        String(u['권한'] || '').trim()             === 'admin') {
      return true;
    }
  }
  return false;
}

function getUsers() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  var rows  = sheetToObjects(sheet); // sheetToObjects는 null 안전 처리됨
  var safe  = rows.map(function(u) {
    return {
      id:          String(u['ID']       || '').trim(),
      name:        String(u['이름']     || '').trim(),
      role:        String(u['권한']     || '').trim(),
      sessionType: String(u['세션타입'] || '').trim(),
    };
  }).filter(function(u) { return u.id; });
  return { ok: true, users: safe };
}

function getAllData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); // 1회만 취득
  var empData, payData, rateData, deletedData, paidData;
  try { empData     = sheetToObjects(ss.getSheetByName(SHEET_EMP));  } catch(e) { empData     = []; }
  try { payData     = sheetToObjects(ss.getSheetByName(SHEET_PAY));  } catch(e) { payData     = []; }
  try { rateData    = sheetToObjects(ss.getSheetByName(SHEET_RATE)); } catch(e) { rateData    = []; }
  try { deletedData = getDeletedEmpIdsData(ss);                       } catch(e) { deletedData = []; }
  try { paidData    = getPaidYMs(ss);                                 } catch(e) { paidData    = []; }
  return {
    ok: true,
    data: {
      employees:     empData,
      payrolls:      payData,
      rateHistory:   rateData,
      deletedEmpIds: deletedData,
      paidYMs:       paidData
    }
  };
}

function getPaidYMs(ss) {
  var sheet = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(SHEET_PAID);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var vals = sheet.getDataRange().getValues();
  var hdrs = vals[0];
  var yCol = hdrs.indexOf('year');
  var mCol = hdrs.indexOf('month');
  if (yCol < 0 || mCol < 0) return [];
  return vals.slice(1).map(function(r) {
    var y = parseInt(r[yCol]);
    var m = parseInt(r[mCol]);
    return (!isNaN(y) && !isNaN(m)) ? (y + '-' + String(m).padStart(2, '0')) : null;
  }).filter(Boolean);
}

function getDeletedEmpIdsData(ss) {
  var sheet = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(SHEET_DELETED);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var vals = sheet.getDataRange().getValues();
  var hdrs = vals[0];
  var noCol = hdrs.indexOf('emp_no');
  if (noCol < 0) return [];
  return vals.slice(1).map(function(row) { return String(row[noCol]).trim(); }).filter(Boolean);
}

// ── 협회けんぽ スクレイピング ─────────────────────────────────

function scrapeKenpoRates() {
  const today  = new Date();
  const year   = today.getFullYear();
  const month  = today.getMonth() + 1;
  const fiscal = month >= 3 ? year - 2018 : year - 2019;
  const fromYr = month >= 3 ? year : year - 1;
  const from   = fromYr + '-03';

  const r2 = String(fiscal).padStart(2, '0');
  Logger.log('対象: ' + fromYr + '年度 (令和' + fiscal + '年度) / from=' + from);

  const opts = {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control':   'no-cache',
      'Pragma':          'no-cache',
      'Sec-Fetch-Dest':  'document',
      'Sec-Fetch-Mode':  'navigate',
      'Sec-Fetch-Site':  'none',
      'Upgrade-Insecure-Requests': '1',
    }
  };

  const directYearUrl = KENPO_INDEX_URL + 'r' + r2 + '/';
  Logger.log('Step1(direct): ' + directYearUrl);
  let idxHtml = kenpoFetch(directYearUrl, opts);
  let rates = idxHtml ? extractRatesFromHtml(idxHtml) : { kenko: null, kaigo: null };
  Logger.log('年度直接URL抽出: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);

  if (rates.kenko == null) {
    Logger.log('Step2(index): ' + KENPO_INDEX_URL);
    const fetchedIdx = kenpoFetch(KENPO_INDEX_URL, opts);
    if (fetchedIdx) {
      if (!idxHtml) idxHtml = fetchedIdx;
      rates = extractRatesFromHtml(fetchedIdx);
      Logger.log('インデックスHTML抽出: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);

      if (rates.kenko == null) {
        const yearUrl = findYearPageUrl(fetchedIdx, fromYr, fiscal);
        Logger.log('年度ページURL: ' + yearUrl);
        if (yearUrl) {
          const yearHtml = kenpoFetch(yearUrl, opts);
          if (yearHtml) {
            rates = extractRatesFromHtml(yearHtml);
            Logger.log('年度ページHTML抽出: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);
            if (rates.kenko == null) {
              const pdfUrl = findTokyoPdfUrl(yearHtml);
              Logger.log('東京都PDFリンク: ' + pdfUrl);
              if (pdfUrl) {
                rates = extractRatesFromPdf(pdfUrl, opts);
                Logger.log('PDF抽出結果: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);
              }
            }
          }
        }
      }
    }
  }

  if (rates.kenko == null && idxHtml) {
    const pdfUrl = findTokyoPdfUrl(idxHtml);
    Logger.log('インデックスPDF: ' + pdfUrl);
    if (pdfUrl) {
      rates = extractRatesFromPdf(pdfUrl, opts);
      Logger.log('インデックスPDF抽出: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);
    }
  }

  if (rates.kenko == null) {
    return {
      ok: false,
      error: '東京都の保険料率を抽出できませんでした。\nGASの実行ログを確認してください。\n出典: ' + KENPO_INDEX_URL
    };
  }

  const kodomo = fiscal >= 8 ? 0.23 : 0.00;

  return {
    ok:         true,
    kenko:      rates.kenko,
    kaigo:      rates.kaigo != null ? rates.kaigo : 1.62,
    kodomo:     kodomo,
    nenkin:     18.30,
    koyo:       0.50,
    from:       from,
    source:     KENPO_INDEX_URL,
    scraped_at: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm')
  };
}

function extractRatesFromHtml(html) {
  if (!html || typeof html !== 'string') return { kenko: null, kaigo: null };
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
  return extractRatesFromText(text);
}

function extractNumbers(text) {
  return (text.match(/\d{1,2}\.\d{1,3}(?:%|％)?/g) || [])
    .map(s => Number(s.replace(/[％%]/g, '')))
    .filter(v => !Number.isNaN(v));
}

function findNumberNearKeyword(text, keywordPattern, min, max, windowSize = 300) {
  const re = new RegExp(keywordPattern, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = Math.max(0, m.index - 120);
    const segment = text.slice(start, m.index + windowSize);
    const nums = extractNumbers(segment).filter(v => v >= min && v <= max);
    if (nums.length) return nums[0];
  }
  return null;
}

function toHankaku(str) {
  return str
    .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/．/g, '.')
    .replace(/％/g, '%');
}

function extractRatesFromText(text) {
  if (!text) return { kenko: null, kaigo: null };
  const normalized = toHankaku(text.replace(/[　\s]+/g, ' ').replace(/\s+/g, ' ').trim());
  let kenko = null;
  let kaigo = null;
  let tokyoSegment = null;

  const tokyoIdx = normalized.indexOf('東京都');
  if (tokyoIdx >= 0) {
    const afterStart = tokyoIdx + 3;
    const nextPrefPos = normalized.slice(afterStart).search(/[一-鿿]+[都道府県]/);
    const endPos = nextPrefPos > 0 ? afterStart + nextPrefPos : Math.min(normalized.length, tokyoIdx + 250);
    tokyoSegment = normalized.slice(tokyoIdx, endPos);
    const tokyoNums = extractNumbers(tokyoSegment).filter(v => v >= 1.0 && v <= 12.0);
    if (tokyoNums.length > 0) {
      const kenkoCandidates = tokyoNums.filter(v => v >= 8.0 && v <= 12.0);
      if (kenkoCandidates.length) kenko = kenkoCandidates[kenkoCandidates.length - 1];
      const kaigoCandidates = tokyoNums.filter(v => v >= 1.0 && v <= 3.5 && Math.abs(v - kenko) > 0.001);
      if (kaigoCandidates.length) kaigo = kaigoCandidates[kaigoCandidates.length - 1];
    }
  }

  if (kenko == null) {
    kenko = findNumberNearKeyword(normalized, '健康保険料率|健康保険料|協会けんぽ', 8.0, 12.0, 400);
  }
  if (kenko == null) {
    kenko = extractNumbers(normalized).find(v => v >= 8.0 && v <= 12.0) || null;
  }
  Logger.log('健康保険料率(東京)候補: ' + kenko);

  if (kaigo == null && tokyoSegment) {
    for (const pattern of ['介護保険料率', '介護保険.*?料率', '介護保険料', '介護保険']) {
      const found = findNumberNearKeyword(tokyoSegment, pattern, 1.0, 3.5, 200);
      if (found != null) { kaigo = found; break; }
    }
  }
  if (kaigo == null) {
    for (const pattern of ['介護保険料率', '介護保険.*?料率', '介護保険料', '介護保険']) {
      kaigo = findNumberNearKeyword(normalized, pattern, 1.0, 3.5, 400);
      if (kaigo != null) break;
    }
  }
  if (kaigo == null) {
    kaigo = extractNumbers(normalized).find(v => v >= 1.0 && v <= 3.5) || null;
  }
  Logger.log('介護保険料率候補: ' + kaigo);

  return { kenko, kaigo };
}

function findYearPageUrl(html, year, fiscal) {
  const yearStr  = String(year);
  const reiwaStr = '令和' + fiscal;
  const candidates = [];
  const re = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    let score = 0;
    if (text.includes(yearStr) || href.includes(yearStr) || text.includes(reiwaStr) || href.includes('r' + String(fiscal).padStart(2,'0'))) score += 30;
    if (text.includes('令和') || text.includes('年度') || href.includes('reiwa') || href.includes('年度')) score += 8;
    if (/保険料|料率/.test(text) || /保険料|料率/.test(href)) score += 5;
    if (/東京|東京都/.test(text) || /東京|東京都/.test(href)) score += 3;
    if (href.toLowerCase().endsWith('.pdf')) score += 2;
    if (score > 0) candidates.push({ href, text, score });
  }
  Logger.log('年度リンク候補: ' + JSON.stringify(candidates.slice(0, 8)));
  if (candidates.length === 0) return null;
  candidates.sort((a,b) => b.score - a.score);
  const href = candidates[0].href;
  if (href.startsWith('http')) return href;
  return KENPO_BASE_URL + (href.startsWith('/') ? href : '/' + href);
}

function findTokyoPdfUrl(html) {
  const re = /href=["']([^"']+\.pdf)["']/gi;
  const pdfs = [];
  let m;
  while ((m = re.exec(html)) !== null) pdfs.push(m[1]);
  Logger.log('全PDFリンク: ' + JSON.stringify(pdfs.slice(0, 10)));
  const tokyoPdf = pdfs.find(p => /tokyo|Tokyo|東京/i.test(p));
  const target   = tokyoPdf || pdfs[0] || null;
  if (!target) return null;
  if (target.startsWith('http')) return target;
  return KENPO_BASE_URL + (target.startsWith('/') ? target : '/' + target);
}

function extractRatesFromPdf(pdfUrl, opts) {
  try {
    Logger.log('PDF取得: ' + pdfUrl);
    const res = UrlFetchApp.fetch(pdfUrl, opts);
    Logger.log('PDF HTTP: ' + res.getResponseCode());
    if (res.getResponseCode() !== 200) return { kenko: null, kaigo: null };
    const blob = res.getBlob().setName('kenpo_tmp.pdf');
    const file = Drive.Files.insert(
      { title: 'kenpo_tmp', mimeType: 'application/vnd.google-apps.document' },
      blob,
      { convert: true }
    );
    let text = '';
    try {
      text = DocumentApp.openById(file.id).getBody().getText();
      Logger.log('PDFテキスト先頭500: ' + text.substring(0, 500));
    } finally {
      Drive.Files.remove(file.id);
    }
    return extractRatesFromText(text);
  } catch(e) {
    Logger.log('PDF処理エラー (Drive API v2 未追加の可能性): ' + e.message);
    return { kenko: null, kaigo: null };
  }
}

function kenpoFetch(url, opts) {
  try {
    const res  = UrlFetchApp.fetch(url, opts);
    const code = res.getResponseCode();
    Logger.log('HTTP ' + code + ' : ' + url);
    if (code !== 200) {
      try { Logger.log('レスポンスヘッダー: ' + JSON.stringify(res.getHeaders())); } catch(he) {}
      try { Logger.log('レスポンス本文先頭500: ' + res.getContentText('UTF-8').substring(0, 500)); } catch(be) {}
      return null;
    }
    return res.getContentText('UTF-8');
  } catch(e) {
    Logger.log('Fetch例外: ' + url + ' → ' + e.message);
    return null;
  }
}

// ── 주간 자동 백업 ────────────────────────────────────────────────
// 매주 월요일 오전 9시 GAS 트리거로 자동 실행
function backupWeekly() {
  const ts   = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  const name = 'WisePay_backup_' + ts;
  const main = SpreadsheetApp.getActiveSpreadsheet();
  const backup = SpreadsheetApp.create(name);
  [SHEET_EMP, SHEET_PAY, SHEET_RATE, SHEET_LOG,
   SHEET_USERS, SHEET_DELETED, SHEET_PAID, SHEET_SNAP].forEach(function(sn) {
    const src = main.getSheetByName(sn);
    if (!src) return;
    const nr = src.getLastRow(), nc = src.getLastColumn();
    if (nr === 0 || nc === 0) return;
    const vals = src.getRange(1, 1, nr, nc).getValues();
    var dst = backup.getSheetByName(sn) || backup.insertSheet(sn);
    dst.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
  });
  try {
    var s1 = backup.getSheetByName('Sheet1');
    if (s1 && backup.getSheets().length > 1) backup.deleteSheet(s1);
  } catch(e) {}
  var hist = getSheet('백업이력');
  if (hist.getLastRow() === 0) {
    hist.getRange(1, 1, 1, 3).setValues([['timestamp', 'filename', 'fileId']]);
  }
  hist.insertRowAfter(1);
  hist.getRange(2, 1, 1, 3).setValues([[ts, name, backup.getId()]]);
  try {
    var folder = DriveApp.getFolderById('125mzhl1EVBbHklwN9RiBN4vNnZbSBBsI');
    DriveApp.getFileById(backup.getId()).moveTo(folder);
  } catch(e) {
    Logger.log('폴더 이동 실패(루트에 저장): ' + e.message);
  }
  deleteOldBackups();
  Logger.log('자동 백업 완료: ' + name + ' (ID: ' + backup.getId() + ')');
  return { ok: true, name: name };
}

function deleteOldBackups() {
  var MAX = 26;
  var hist = getSheet('백업이력');
  if (hist.getLastRow() < 2) return;
  var data    = hist.getDataRange().getValues();
  var headers = data[0];
  var idIdx   = headers.indexOf('fileId');
  var rows    = data.slice(1);
  if (rows.length <= MAX) return;
  var toDelete = rows.slice(MAX);
  toDelete.forEach(function(row) {
    var fid = row[idIdx];
    if (!fid) return;
    try { DriveApp.getFileById(String(fid)).setTrashed(true); }
    catch(e) { Logger.log('백업 삭제 실패: ' + fid + ' / ' + e.message); }
  });
  hist.deleteRows(MAX + 2, rows.length - MAX);
  Logger.log((rows.length - MAX) + '개 오래된 백업 삭제');
}

// GAS 편집기에서 한 번만 실행 → 매주 월요일 오전 9시 트리거 등록
function createWeeklyBackupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'backupWeekly'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backupWeekly')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();
  Logger.log('✅ 매주 월요일 오전 9시 자동 백업 트리거 설정 완료');
}
