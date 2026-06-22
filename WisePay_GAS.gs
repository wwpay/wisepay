// WisePay GAS Script
// 수정: 2026-06-22 15:34 — changePassword 오류 메시지 한국어→한일 이중 언어로 수정
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
const SHEET_HOLIDAY   = '공휴일';
const SHEET_VACATION  = '유급휴가';

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
    else if (action === 'getHolidays')                                    result = getHolidaysData();
    else if (action === 'getVacation')                                    result = getVacationData();
    else result = { ok: false, error: 'Unknown action: ' + action };
  } catch(err) {
    result = { ok: false, error: err.message };
  }
  const json = JSON.stringify(result);
  return ContentService
    .createTextOutput(callback ? callback + '(' + json + ')' : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

// ── GAS 유틸: 입사월 → 초기 발생일수 (JS와 동일 로직) ──────────────
function calcInitialDays(joinMonth) {
  if (joinMonth >= 1 && joinMonth <= 6) {
    return 15 - (joinMonth - 1); // 1월=15, 2월=14, ..., 6월=10
  }
  return 13 - joinMonth; // 7월=6, 8월=5, 9월=4, 10월=3, 11월=2, 12월=1
}

// ── 신규 사원 초기 유급휴가 자동 생성 ──────────────
// 입사일로부터 지나간 모든 1월 1일에 대해 연간발생 추가
function ensureNewEmpVacation(empNo, joinDate) {
  if (!empNo || !joinDate) return;
  var empNoStr = String(parseInt(empNo || 0)).padStart(4, '0');
  var joinMonth = parseInt(String(joinDate).substring(5, 7));
  var joinYear = parseInt(String(joinDate).substring(0, 4));
  if (isNaN(joinMonth) || isNaN(joinYear)) return;

  var vacSheet = getSheet(SHEET_VACATION);
  if (vacSheet.getLastRow() === 0) {
    vacSheet.getRange(1, 1, 1, 7).setValues([['emp_no', 'date', 'used', 'reason', 'grant_year', 'remaining', 'days']]);
  }

  // 현재 존재하는 동 사원의 발생 기록을 확인 (emp_no + date + reason 조합으로 중복 감지)
  var lastRow = vacSheet.getLastRow();
  var allRows = lastRow < 2 ? [] : vacSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var existingRecords = {};
  var hdrRow = vacSheet.getRange(1, 1, 1, 7).getValues()[0];
  var idxEmpNo = hdrRow.indexOf('emp_no');
  var idxDate = hdrRow.indexOf('date');
  var idxGrantYear = hdrRow.indexOf('grant_year');
  var idxReason = hdrRow.indexOf('reason');

  allRows.forEach(function(row) {
    var no = String(parseInt(row[idxEmpNo] || 0)).padStart(4, '0');
    var dt = String(row[idxDate] || '').substring(0, 10); // YYYY-MM-DD 형식
    var gy = String(row[idxGrantYear] || '').trim();
    var rsn = String(row[idxReason] || '').trim();
    if (no === empNoStr) {
      // 키: date + reason 조합 (같은 날 같은 사유 중복 방지)
      existingRecords[dt + '_' + rsn] = true;
      // 호환성: 기존 gy + rsn 키도 유지 (2025/06/16 이전 로직용)
      existingRecords[gy + '_' + rsn] = true;
    }
  });

  // 초기발생 추가 (없으면) — date + reason 조합으로 중복 방지
  var initialDays = calcInitialDays(joinMonth);
  var initKey = joinDate + '_초기발생';
  if (!existingRecords[initKey]) {
    vacSheet.appendRow([empNoStr, joinDate, 0, '초기발생', joinYear, '', initialDays]);
    Logger.log('✅ [' + empNoStr + '] 초기발생 ' + initialDays + '일 추가 (' + joinDate + ')');
  }

  // 현재 기준 연간발생 추가 (없으면) — date(YYYY-01-01) + reason 조합으로 중복 방지
  var today = new Date();
  var todayStr = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd');
  var thisYear = parseInt(todayStr.substring(0, 4));
  for (var y = joinYear + 1; y <= thisYear; y++) {
    var jan1 = y + '-01-01';
    var annualKey = jan1 + '_연간발생';
    if (jan1 <= todayStr && !existingRecords[annualKey]) {
      vacSheet.appendRow([empNoStr, jan1, 0, '연간발생', y, '', 15]);
      Logger.log('✅ [' + empNoStr + '] 연간발생 15일 추가 (' + y + '년)');
    }
  }

  sortVacationSheet();
}

// ── 신규 사원 감지 및 초기 유급휴가 자동 생성 ──────────────
// employees 시트에서 신규 사원을 감지해서 유급휴가 초기화
function detectNewEmployeesAndInitVacation(newEmployees) {
  if (!newEmployees || !Array.isArray(newEmployees) || newEmployees.length === 0) return;

  var empSheet = getSheet(SHEET_EMP);
  if (empSheet.getLastRow() < 2) {
    // employees 시트가 비어있으면 모두 신규 사원으로 처리
    newEmployees.forEach(function(emp) {
      if (emp.no && emp.join) {
        ensureNewEmpVacation(emp.no, emp.join);
      }
    });
    return;
  }

  // 기존 사원 emp_no 수집
  var hdr = empSheet.getRange(1, 1, 1, empSheet.getLastColumn()).getValues()[0];
  var noCol = hdr.indexOf('no') >= 0 ? hdr.indexOf('no') : hdr.indexOf('사원');
  if (noCol < 0) return;

  var existingNos = {};
  var allRows = empSheet.getRange(2, 1, empSheet.getLastRow() - 1, empSheet.getLastColumn()).getValues();
  allRows.forEach(function(row) {
    var no = String(parseInt(row[noCol] || 0)).padStart(4, '0');
    if (no !== '0000') existingNos[no] = true;
  });

  // 신규 사원 감지 및 초기화
  newEmployees.forEach(function(emp) {
    if (!emp.no || !emp.join) return;
    var empNoStr = String(parseInt(emp.no)).padStart(4, '0');
    if (!existingNos[empNoStr]) {
      Logger.log('🆕 신규 사원 감지: ' + empNoStr + ' (입사: ' + emp.join + ')');
      ensureNewEmpVacation(emp.no, emp.join);
    }
  });
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
        // vacation 생성은 JS → addVacationGrantEntry 경로에서만 처리 (중복 방지)
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
    if (data.type === 'changePassword') {
      var cpUid     = String(data._uid     || '').trim();
      var cpHash    = String(data._hash    || '').toLowerCase().trim();
      var cpNewHash = String(data.newHash  || '').toLowerCase().trim();
      if (!cpUid || !cpHash || !cpNewHash) return jsonResponse({ ok: false, error: 'Missing parameters' });
      var cpSheet   = getSheet(SHEET_USERS);
      var cpVals    = cpSheet.getDataRange().getValues();
      if (cpVals.length < 2) return jsonResponse({ ok: false, error: '現在のパスワードが一致しません / 현재 비밀번호가 일치하지 않습니다' });
      var cpHdrs    = cpVals[0];
      var cpIdCol   = cpHdrs.indexOf('ID');
      var cpHashCol = cpHdrs.indexOf('PW_HASH');
      var cpRoleCol = cpHdrs.indexOf('권한');
      if (cpIdCol < 0 || cpHashCol < 0) return jsonResponse({ ok: false, error: 'Invalid sheet format' });
      var cpRow = -1, cpRole = '';
      for (var ri = 1; ri < cpVals.length; ri++) {
        if (String(cpVals[ri][cpIdCol] || '').trim() === cpUid) {
          var storedHash = String(cpVals[ri][cpHashCol] || '').toLowerCase().trim();
          if (storedHash !== cpHash) return jsonResponse({ ok: false, error: '現在のパスワードが一致しません / 현재 비밀번호가 일치하지 않습니다' });
          cpRole = cpRoleCol >= 0 ? String(cpVals[ri][cpRoleCol] || '').trim() : '';
          cpRow  = ri; break;
        }
      }
      if (cpRow < 0) return jsonResponse({ ok: false, error: '現在のパスワードが一致しません / 현재 비밀번호가 일치하지 않습니다' });
      if (cpRole !== 'employee' && cpRole !== 'viewer') return jsonResponse({ ok: false, error: '権限がありません / 권한이 없습니다' });
      cpSheet.getRange(cpRow + 1, cpHashCol + 1).setValue(cpNewHash);
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
        var matchedRole = String(matched['권한'] || '').trim();
        var userResp = {
          id:          String(matched['ID']       || '').trim(),
          name:        String(matched['이름']     || '').trim(),
          role:        matchedRole,
          sessionType: String(matched['세션타입'] || '').trim(),
        };
        if (matchedRole === 'employee') {
          userResp.employeeId = String(matched['사원ID'] || '').trim();
        }
        return jsonResponse({ ok: true, user: userResp });
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
    if (data.type === 'saveVacation') {
      if (!verifyWriteToken(data)) return jsonResponse({ ok: false, error: 'Unauthorized' });
      if (Array.isArray(data.data) && data.data.length > 0) {
        saveVacationSheet(data.data); // 고정 컬럼 순서로 저장 (헤더 순서 변경 방지)
      }
      return jsonResponse({ ok: true });
    }
    if (data.type === 'deleteVacationEntry') {
      var dvUid   = String(data._uid   || '').trim();
      var dvToken = String(data._token || '').toLowerCase().trim();
      if (!dvUid || !dvToken) return jsonResponse({ ok: false, error: 'Unauthorized' });
      // admin 또는 employee 자격 검증
      var dvAllUsers = sheetToObjects(getSheet(SHEET_USERS));
      var dvRole = null; var dvSaId = null;
      for (var dvi = 0; dvi < dvAllUsers.length; dvi++) {
        var dvu = dvAllUsers[dvi];
        if (String(dvu['ID'] || '').trim() === dvUid &&
            String(dvu['PW_HASH'] || '').toLowerCase().trim() === dvToken) {
          dvRole = String(dvu['권한'] || '').trim();
          dvSaId = String(dvu['사원ID'] || '').trim();
          break;
        }
      }
      if (dvRole !== 'admin' && dvRole !== 'employee') {
        return jsonResponse({ ok: false, error: 'Unauthorized' });
      }
      var dEmpNo = String(data.emp_no || '').trim();
      var dDate  = String(data.date   || '').trim();
      // employee: 날짜가 오늘 이전(오늘 포함)이면 거부 + 본인 사원번호만 허용
      if (dvRole === 'employee') {
        var dvToday = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
        if (dDate <= dvToday) {
          return jsonResponse({ ok: false, error: '오늘 이전 날짜의 휴가는 삭제할 수 없습니다' });
        }
        var dvForcedPad = String(parseInt(dvSaId) || 0).padStart(4, '0');
        var dvReqPad    = String(parseInt(dEmpNo) || 0).padStart(4, '0');
        if (dvForcedPad !== dvReqPad) {
          return jsonResponse({ ok: false, error: '본인 휴가만 삭제할 수 있습니다' });
        }
      }
      var vacSheet = getSheet(SHEET_VACATION);
      if (vacSheet.getLastRow() < 2) return jsonResponse({ ok: true });
      var vacVals = vacSheet.getDataRange().getValues();
      var vacHdrs = vacVals[0];
      var vNoCol   = vacHdrs.indexOf('emp_no');
      var vDateCol = vacHdrs.indexOf('date');
      var vRsnCol  = vacHdrs.indexOf('reason');
      var dReason  = String(data.reason || '').trim();
      for (var vi = vacVals.length - 1; vi >= 1; vi--) {
        var vRow = vacVals[vi];
        // emp_no: 숫자로 저장된 경우(20) → 4자리 문자열(0020)로 정규화
        var rawNo = vRow[vNoCol];
        var rowEmpNo = (typeof rawNo === 'number')
          ? String(rawNo).padStart(4, '0')
          : (/^\d+$/.test(String(rawNo || '').trim()) ? String(rawNo || '').trim().padStart(4, '0') : String(rawNo || '').trim());
        // date: Date 객체로 저장된 경우 → 'yyyy-MM-dd' 문자열로 변환
        var rowDate = (vRow[vDateCol] instanceof Date)
          ? Utilities.formatDate(vRow[vDateCol], 'Asia/Tokyo', 'yyyy-MM-dd')
          : String(vRow[vDateCol] || '').trim();
        if (vNoCol >= 0 && rowEmpNo === dEmpNo &&
            vDateCol >= 0 && rowDate === dDate &&
            (vRsnCol < 0 || !dReason || String(vRow[vRsnCol]).trim() === dReason)) {
          vacSheet.deleteRow(vi + 1);
          break;
        }
      }
      return jsonResponse({ ok: true });
    }
    if (data.type === 'addVacationEntry') {
      var avUid   = String(data._uid   || '').trim();
      var avToken = String(data._token || '').toLowerCase().trim();
      if (!avUid || !avToken) return jsonResponse({ ok: false, error: 'Unauthorized' });
      // employee 자격 검증
      var avAllUsers = sheetToObjects(getSheet(SHEET_USERS));
      var avRole = null; var avSaId = null;
      for (var avi = 0; avi < avAllUsers.length; avi++) {
        var avu = avAllUsers[avi];
        if (String(avu['ID'] || '').trim() === avUid &&
            String(avu['PW_HASH'] || '').toLowerCase().trim() === avToken) {
          avRole = String(avu['권한'] || '').trim();
          avSaId = String(avu['사원ID'] || '').trim();
          break;
        }
      }
      if (avRole !== 'employee') return jsonResponse({ ok: false, error: 'Unauthorized' });
      var avDate  = String(data.date   || '').trim();
      var avEmpNo = String(data.emp_no || '').trim();
      // 날짜가 오늘 이전이면 거부
      var avToday = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
      if (avDate < avToday) {
        return jsonResponse({ ok: false, error: '오늘 이전 날짜는 등록할 수 없습니다' });
      }
      // 본인 사원번호만 허용
      var avForcedPad = String(parseInt(avSaId) || 0).padStart(4, '0');
      var avReqPad    = String(parseInt(avEmpNo) || 0).padStart(4, '0');
      if (avForcedPad !== avReqPad) {
        return jsonResponse({ ok: false, error: '본인 정보만 등록할 수 있습니다' });
      }
      var avUsed   = parseFloat(data.used || 1);
      var avReason = String(data.reason || '').trim().substring(0, 50);
      var avGy     = String(data.grant_year || '').trim();
      var avVacSheet = getSheet(SHEET_VACATION);
      // 시트가 비어 있으면 헤더 초기화
      if (avVacSheet.getLastRow() === 0) {
        avVacSheet.appendRow(['emp_no', 'date', 'used', 'reason', 'grant_year', 'remaining', 'days']);
      }
      // 기존 헤더 순서에 맞춰 행 삽입 (remaining 컬럼 유무 대응)
      var avHdrRow = avVacSheet.getRange(1, 1, 1, avVacSheet.getLastColumn()).getValues()[0];
      var avNewRow = avHdrRow.map(function(h) {
        switch (String(h)) {
          case 'emp_no':     return avReqPad;
          case 'date':       return avDate;
          case 'used':       return avUsed;
          case 'reason':     return avReason;
          case 'grant_year': return avGy;
          case 'days':       return 0;
          case 'remaining':  return '';
          default:           return '';
        }
      });
      avVacSheet.appendRow(avNewRow);
      sortVacationSheet();
      return jsonResponse({ ok: true });
    }
    if (data.type === 'addVacationGrantEntry') {
      // 신규 사원 초기발생·연간발생 등 부여 기록을 appendRow로만 추가 (시트 초기화 없음)
      if (!verifyWriteToken(data)) return jsonResponse({ ok: false, error: 'Unauthorized' });
      var agEmpNo  = String(data.emp_no     || '').trim().padStart(4, '0');
      var agDays   = parseFloat(data.days   || 0);
      var agGy     = String(data.grant_year || '').trim();
      var agReason = String(data.reason     || '').trim().substring(0, 50);
      var agDate   = String(data.date       || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd')).trim();
      if (!agEmpNo || agEmpNo === '0000') {
        return jsonResponse({ ok: false, error: 'Missing emp_no' });
      }
      var agSheet = getSheet(SHEET_VACATION);
      var VAC_HEADERS = ['emp_no', 'date', 'used', 'reason', 'grant_year', 'remaining', 'days'];
      if (agSheet.getLastRow() === 0) {
        agSheet.appendRow(VAC_HEADERS);
      }
      // 중복 체크: 동일 emp_no + date + reason 조합이 이미 있으면 skip
      var agLastRow = agSheet.getLastRow();
      if (agLastRow >= 2) {
        var agHdrs0 = agSheet.getRange(1, 1, 1, agSheet.getLastColumn()).getValues()[0];
        var agNoCol   = agHdrs0.indexOf('emp_no');
        var agDateCol = agHdrs0.indexOf('date');
        var agRsnCol  = agHdrs0.indexOf('reason');
        var agAllRows = agSheet.getRange(2, 1, agLastRow - 1, agSheet.getLastColumn()).getValues();
        var agDup = agAllRows.some(function(row) {
          var rowNo = (typeof row[agNoCol] === 'number')
            ? String(row[agNoCol]).padStart(4, '0')
            : String(row[agNoCol] || '').trim().padStart(4, '0');
          var rowDate = (row[agDateCol] instanceof Date)
            ? Utilities.formatDate(row[agDateCol], 'Asia/Tokyo', 'yyyy-MM-dd')
            : String(row[agDateCol] || '').substring(0, 10);
          var rowRsn = String(row[agRsnCol] || '').trim();
          return rowNo === agEmpNo && rowDate === agDate && rowRsn === agReason;
        });
        if (agDup) {
          Logger.log('⏭ [' + agEmpNo + '] 중복 발견, skip: ' + agDate + ' ' + agReason);
          return jsonResponse({ ok: true, skipped: true });
        }
      }
      var agHdrRow = agSheet.getRange(1, 1, 1, agSheet.getLastColumn()).getValues()[0];
      var agNewRow = agHdrRow.map(function(h) {
        switch (String(h)) {
          case 'emp_no':     return agEmpNo;
          case 'date':       return agDate;
          case 'used':       return 0;
          case 'reason':     return agReason;
          case 'grant_year': return agGy;
          case 'days':       return agDays;
          case 'remaining':  return '';
          default:           return '';
        }
      });
      agSheet.appendRow(agNewRow);
      sortVacationSheet();
      return jsonResponse({ ok: true });
    }
    if (data.type === 'createEmployeeAccount') {
      if (!verifyWriteToken(data)) return jsonResponse({ ok: false, error: 'Unauthorized' });
      var ceEmpNo = String(parseInt(data.emp_no || '') || 0).padStart(4, '0');
      var ceName  = String(data.emp_name || '').trim();
      if (!ceEmpNo || ceEmpNo === '0000' || !ceName) {
        return jsonResponse({ ok: false, error: 'Missing parameters' });
      }
      var ceId = 'wise' + ceEmpNo;
      var ceSheet = getSheet(SHEET_USERS);
      // 중복 체크: 동일 ID 또는 동일 사원ID가 이미 있으면 skip
      var ceExisting = sheetToObjects(ceSheet);
      for (var cei = 0; cei < ceExisting.length; cei++) {
        if (String(ceExisting[cei]['ID']    || '').trim() === ceId ||
            String(ceExisting[cei]['사원ID'] || '').trim() === ceEmpNo) {
          return jsonResponse({ ok: true, skipped: true });
        }
      }
      // SHA-256("1234") 계산 (GAS 내장 함수)
      var ceDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, '1234');
      var cePwHash = ceDigest.map(function(b) {
        var h = (b < 0 ? b + 256 : b).toString(16);
        return h.length === 1 ? '0' + h : h;
      }).join('');
      // 헤더 없으면 초기화
      if (ceSheet.getLastRow() === 0) {
        ceSheet.appendRow(['ID', 'PW_HASH', '권한', '세션타입', '이름', '사원ID']);
      }
      var ceHdrs = ceSheet.getRange(1, 1, 1, ceSheet.getLastColumn()).getValues()[0];
      var ceRow = ceHdrs.map(function(h) {
        switch (String(h)) {
          case 'ID':       return ceId;
          case 'PW_HASH':  return cePwHash;
          case '권한':     return 'employee';
          case '세션타입': return 'session';
          case '이름':     return ceName;
          case '사원ID':   return ceEmpNo;
          default:         return '';
        }
      });
      ceSheet.appendRow(ceRow);
      // 사원ID 셀을 텍스트 서식으로 고정해 앞자리 0 보존
      var ceSainColIdx = ceHdrs.indexOf('사원ID');
      if (ceSainColIdx >= 0) {
        var ceSainCell = ceSheet.getRange(ceSheet.getLastRow(), ceSainColIdx + 1);
        ceSainCell.setNumberFormat('@');
        ceSainCell.setValue(ceEmpNo);
      }
      return jsonResponse({ ok: true });
    }
    if (data.type === 'getEmployeeData') {
      var eUid  = String(data._uid  || '').trim();
      var eHash = String(data._hash || '').toLowerCase().trim();
      if (!eUid || !eHash) return jsonResponse({ ok: false, error: 'Missing credentials' });
      var eUsers = sheetToObjects(getSheet(SHEET_USERS));
      var eMatched = null;
      for (var eidx = 0; eidx < eUsers.length; eidx++) {
        var eu = eUsers[eidx];
        if (String(eu['ID'] || '').trim() === eUid &&
            String(eu['PW_HASH'] || '').toLowerCase().trim() === eHash) {
          eMatched = eu; break;
        }
      }
      if (!eMatched) return jsonResponse({ ok: false, error: 'Unauthorized' });
      if (String(eMatched['권한'] || '').trim() !== 'employee') {
        return jsonResponse({ ok: false, error: 'Not an employee account' });
      }
      // 요청 empNo 무시 → users 시트 사원ID로 강제 치환 (보안 핵심)
      var forcedNo = String(eMatched['사원ID'] || '').trim();
      if (!forcedNo) return jsonResponse({ ok: false, error: '사원ID not configured' });
      var forcedPad = String(parseInt(forcedNo) || 0).padStart(4, '0');
      var myEmps = sheetToObjects(getSheet(SHEET_EMP)).filter(function(e) {
        return String(parseInt(e.no || 0)).padStart(4, '0') === forcedPad;
      });
      var myPays = sheetToObjects(getSheet(SHEET_PAY)).filter(function(p) {
        return String(parseInt(p.no || 0)).padStart(4, '0') === forcedPad;
      });
      var myVac = (getVacationData().data || []).filter(function(v) {
        return String(parseInt(v.emp_no || 0)).padStart(4, '0') === forcedPad;
      });
      return jsonResponse({ ok: true, data: {
        employees:    myEmps,
        payrolls:     myPays,
        vacationData: myVac,
        paidYMs:      getPaidYMs(),
        forcedEmpNo:  forcedPad
      }});
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

// ── 공휴일 시트 ─────────────────────────────────────────────────

// 공휴일 시트에서 { date, name } 배열 반환. 시트 없으면 빈 배열.
function getHolidaysData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_HOLIDAY);
  if (!sheet) return { ok: true, data: [] };
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { ok: true, data: [] };
  const headers = rows[0].map(h => String(h).trim().toLowerCase());
  const di = headers.indexOf('date');
  const ni = headers.indexOf('name');
  if (di < 0) return { ok: true, data: [] };
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i][di];
    if (!raw) continue;
    const dateStr = (raw instanceof Date)
      ? Utilities.formatDate(raw, 'Asia/Tokyo', 'yyyy-MM-dd')
      : String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    data.push({ date: dateStr, name: ni >= 0 ? String(rows[i][ni] || '') : '' });
  }
  return { ok: true, data };
}

// GAS 편집기에서 한 번 실행하면 공휴일 시트를 생성·초기화함
function setupHolidaySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_HOLIDAY);
  if (!sheet) sheet = ss.insertSheet(SHEET_HOLIDAY);
  sheet.clearContents();

  const holidays = [
    ['date','name'],
    // 2026
    ['2026-01-01','元日'],['2026-01-12','成人の日'],['2026-02-11','建国記念の日'],
    ['2026-02-23','天皇誕生日'],['2026-03-20','春分の日'],['2026-04-29','昭和の日'],
    ['2026-05-03','憲法記念日'],['2026-05-04','みどりの日'],['2026-05-05','こどもの日'],
    ['2026-05-06','振替休日'],['2026-07-20','海の日'],['2026-08-11','山の日'],
    ['2026-09-21','敬老の日'],['2026-09-22','国民の休日'],['2026-09-23','秋分の日'],
    ['2026-10-12','スポーツの日'],['2026-11-03','文化の日'],['2026-11-23','勤労感謝の日'],
    // 2027
    ['2027-01-01','元日'],['2027-01-11','成人の日'],['2027-02-11','建国記念の日'],
    ['2027-02-23','天皇誕生日'],['2027-03-21','春分の日'],['2027-03-22','振替休日'],
    ['2027-04-29','昭和の日'],['2027-05-03','憲法記念日'],['2027-05-04','みどりの日'],
    ['2027-05-05','こどもの日'],['2027-07-19','海の日'],['2027-08-11','山の日'],
    ['2027-09-20','敬老の日'],['2027-09-23','秋分の日'],['2027-10-11','スポーツの日'],
    ['2027-11-03','文化の日'],['2027-11-23','勤労感謝の日'],
    // 2028
    ['2028-01-01','元日'],['2028-01-10','成人の日'],['2028-02-11','建国記念の日'],
    ['2028-02-23','天皇誕生日'],['2028-03-20','春分の日'],['2028-04-29','昭和の日'],
    ['2028-05-03','憲法記念日'],['2028-05-04','みどりの日'],['2028-05-05','こどもの日'],
    ['2028-07-17','海の日'],['2028-08-11','山の日'],['2028-09-18','敬老の日'],
    ['2028-09-22','秋分の日'],['2028-10-09','スポーツの日'],['2028-11-03','文化の日'],
    ['2028-11-23','勤労感謝の日'],
    // 2029
    ['2029-01-01','元日'],['2029-01-08','成人の日'],['2029-02-11','建国記念の日'],
    ['2029-02-12','振替休日'],['2029-02-23','天皇誕生日'],['2029-03-20','春分の日'],
    ['2029-04-29','昭和の日'],['2029-04-30','振替休日'],['2029-05-03','憲法記念日'],
    ['2029-05-04','みどりの日'],['2029-05-05','こどもの日'],['2029-07-16','海の日'],
    ['2029-08-11','山の日'],['2029-09-17','敬老の日'],['2029-09-23','秋分の日'],
    ['2029-09-24','振替休日'],['2029-10-08','スポーツの日'],['2029-11-03','文化の日'],
    ['2029-11-23','勤労感謝の日'],
    // 2030
    ['2030-01-01','元日'],['2030-01-14','成人の日'],['2030-02-11','建国記念の日'],
    ['2030-02-23','天皇誕生日'],['2030-03-20','春分の日'],['2030-04-29','昭和の日'],
    ['2030-05-03','憲法記念日'],['2030-05-04','みどりの日'],['2030-05-05','こどもの日'],
    ['2030-05-06','振替休日'],['2030-07-15','海の日'],['2030-08-11','山の日'],
    ['2030-08-12','振替休日'],['2030-09-16','敬老の日'],['2030-09-23','秋分の日'],
    ['2030-10-14','スポーツの日'],['2030-11-03','文化の日'],['2030-11-04','振替休日'],
    ['2030-11-23','勤労感謝の日'],
    // 2031
    ['2031-01-01','元日'],['2031-01-13','成人の日'],['2031-02-11','建国記念の日'],
    ['2031-02-23','天皇誕生日'],['2031-02-24','振替休日'],['2031-03-21','春分の日'],
    ['2031-04-29','昭和の日'],['2031-05-03','憲法記念日'],['2031-05-04','みどりの日'],
    ['2031-05-05','こどもの日'],['2031-05-06','振替休日'],['2031-07-21','海の日'],
    ['2031-08-11','山の日'],['2031-09-15','敬老の日'],['2031-09-23','秋分の日'],
    ['2031-10-13','スポーツの日'],['2031-11-03','文化の日'],['2031-11-23','勤労感謝の日'],
    ['2031-11-24','振替休日'],
    // 2032
    ['2032-01-01','元日'],['2032-01-12','成人の日'],['2032-02-11','建国記念の日'],
    ['2032-02-23','天皇誕生日'],['2032-03-20','春分の日'],['2032-04-29','昭和の日'],
    ['2032-05-03','憲法記念日'],['2032-05-04','みどりの日'],['2032-05-05','こどもの日'],
    ['2032-07-19','海の日'],['2032-08-11','山の日'],['2032-09-20','敬老の日'],
    ['2032-09-22','秋分の日'],['2032-10-11','スポーツの日'],['2032-11-03','文化の日'],
    ['2032-11-23','勤労感謝の日'],
    // 2033
    ['2033-01-01','元日'],['2033-01-10','成人の日'],['2033-02-11','建国記念の日'],
    ['2033-02-23','天皇誕生日'],['2033-03-21','春分の日'],['2033-04-29','昭和の日'],
    ['2033-05-03','憲法記念日'],['2033-05-04','みどりの日'],['2033-05-05','こどもの日'],
    ['2033-07-18','海の日'],['2033-08-11','山の日'],['2033-09-19','敬老の日'],
    ['2033-09-23','秋分の日'],['2033-10-10','スポーツの日'],['2033-11-03','文化の日'],
    ['2033-11-23','勤労感謝の日'],
    // 2034
    ['2034-01-01','元日'],['2034-01-02','振替休日'],['2034-01-09','成人の日'],
    ['2034-02-11','建国記念の日'],['2034-02-23','天皇誕生日'],
    ['2034-03-20','春分の日'],['2034-04-29','昭和の日'],
    ['2034-05-03','憲法記念日'],['2034-05-04','みどりの日'],['2034-05-05','こどもの日'],
    ['2034-07-17','海の日'],['2034-08-11','山の日'],
    ['2034-09-18','敬老の日'],['2034-09-23','秋分の日'],
    ['2034-10-09','スポーツの日'],
    ['2034-11-03','文化の日'],['2034-11-23','勤労感謝の日'],
    // 2035
    ['2035-01-01','元日'],['2035-01-08','成人の日'],
    ['2035-02-11','建国記念の日'],['2035-02-12','振替休日'],['2035-02-23','天皇誕生日'],
    ['2035-03-21','春分の日'],['2035-04-29','昭和の日'],
    ['2035-05-03','憲法記念日'],['2035-05-04','みどりの日'],['2035-05-05','こどもの日'],
    ['2035-07-16','海の日'],['2035-08-11','山の日'],
    ['2035-09-17','敬老の日'],['2035-09-23','秋分の日'],
    ['2035-10-08','スポーツの日'],
    ['2035-11-03','文化の日'],['2035-11-23','勤労感謝の日'], // 11-23은 금요일 → 振替不要
  ];

  sheet.getRange(1, 1, holidays.length, 2).setValues(holidays);
  Logger.log('✅ 공휴일 시트 초기화 완료: ' + (holidays.length - 1) + '건');
}

// ── 유급휴가 ─────────────────────────────────────────────────────

// 유급휴가 시트 전체를 { emp_no, date, used, reason, grant_year, days } 배열로 반환
function getVacationData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_VACATION);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, data: [] };
  var rows = sheetToObjects(sheet);
  // date 필드: Date 객체 → 문자열 변환 (sheetToObjects에서 처리 안 된 경우 대비)
  rows = rows.map(function(r) {
    if (r.date instanceof Date) {
      r.date = Utilities.formatDate(r.date, 'Asia/Tokyo', 'yyyy-MM-dd');
    }
    return r;
  });
  return { ok: true, data: rows };
}

// 유급휴가 시트를 고정 헤더 순서로 전체 재작성 (saveSheet 대체 — 헤더 순서 변경 방지)
function saveVacationSheet(records) {
  var VAC_HEADERS = ['emp_no', 'date', 'used', 'reason', 'grant_year', 'remaining', 'days'];
  var sheet = getSheet(SHEET_VACATION);
  sheet.clearContents();
  if (!records || !records.length) return;
  var cleaned = records.map(function(r) {
    var c = {};
    Object.keys(r).forEach(function(k) {
      if (k !== '_uid' && k !== '_token') c[k] = r[k];
    });
    return c;
  });
  var rows = [VAC_HEADERS].concat(cleaned.map(function(r) {
    return VAC_HEADERS.map(function(h) {
      var v = r[h] !== undefined ? r[h] : '';
      return (Array.isArray(v) || (v !== null && typeof v === 'object' && !(v instanceof Date)))
        ? JSON.stringify(v) : v;
    });
  }));
  sheet.getRange(1, 1, rows.length, VAC_HEADERS.length).setValues(rows);
}

// 매년 1월 1일 자동 실행: 재직 중인 전 사원에게 15일 연간발생 추가
function checkAndGrantAnnualVacation() {
  var now = new Date();
  var jstMonth = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'M'));
  if (jstMonth !== 1) return; // 1월에만 실행

  var today = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  var grantYear = parseInt(today.substring(0, 4));

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var empSheet = ss.getSheetByName(SHEET_EMP);
  if (!empSheet) return;

  var emps = sheetToObjects(empSheet);
  var vacSheet = getSheet(SHEET_VACATION);

  if (vacSheet.getLastRow() === 0) {
    vacSheet.getRange(1, 1, 1, 7).setValues([['emp_no', 'date', 'used', 'reason', 'grant_year', 'remaining', 'days']]);
  }

  emps.forEach(function(emp) {
    var leaveVal = String(emp.leave || '').trim();
    if (leaveVal) return; // 퇴사자 제외
    var empNo = String(emp.no || '').trim().padStart ? String(parseInt(emp.no || '0')).padStart(4, '0') : String(emp.no || '');
    if (!empNo || empNo === '0000') return;
    vacSheet.appendRow([empNo, today, 0, '연간발생', grantYear, '', 15]);
  });
  sortVacationSheet();

  Logger.log('✅ 연간 유급휴가 발생 완료: ' + grantYear + '년 / ' + emps.filter(function(e) { return !String(e.leave || '').trim(); }).length + '명');
}

// GAS 편집기에서 한 번 실행 → 매월 1일 오전 9시(JST) 트리거 등록 (1월에만 실행)
function createAnnualVacationTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'checkAndGrantAnnualVacation'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkAndGrantAnnualVacation')
    .timeBased()
    .onMonthDay(1)
    .atHour(9)
    .create();
  Logger.log('✅ 매월 1일 오전 9시 유급휴가 트리거 설정 완료 (1월에만 실제 발생)');
}

// ── 0020·0021·0023 유급휴가 기록 보정 (GAS 편집기에서 한 번만 실행) ──────────
// 0020: 초기발생 15일(2025-01-01) 누락 시 추가
// 0021: 연간발생 2025년 행의 days 컬럼이 비어있으면 15로 수정
// 0023: 초기발생 date를 2025-07-01로 정정 + 2026-01-01 연간발생 누락 시 추가
function fixVacationRecords() {
  var vacSheet = getSheet(SHEET_VACATION);
  if (vacSheet.getLastRow() === 0) {
    vacSheet.getRange(1, 1, 1, 7).setValues([['emp_no', 'date', 'used', 'reason', 'grant_year', 'remaining', 'days']]);
  }
  var lastRow = vacSheet.getLastRow();
  var hdrRow = vacSheet.getRange(1, 1, 1, 7).getValues()[0];
  var idxEmpNo     = hdrRow.indexOf('emp_no');
  var idxDate      = hdrRow.indexOf('date');
  var idxUsed      = hdrRow.indexOf('used');
  var idxGrantYear = hdrRow.indexOf('grant_year');
  var idxReason    = hdrRow.indexOf('reason');
  var idxDays      = hdrRow.indexOf('days');
  var allRows = lastRow < 2 ? [] : vacSheet.getRange(2, 1, lastRow - 1, 7).getValues();

  // ── 0020: 초기발생 15일 (2025-01-01, grant_year=2025) — 존재 시 date 검사, 없으면 추가
  var found0020 = false;
  for (var i = 0; i < allRows.length; i++) {
    var row = allRows[i];
    var no   = String(parseInt(row[idxEmpNo] || 0)).padStart(4, '0');
    var gy   = String(row[idxGrantYear] || '').trim();
    var used = parseFloat(row[idxUsed]   || 0);
    var days = parseFloat(row[idxDays]   || 0);
    var rsn  = String(row[idxReason]     || '').trim();
    if (no === '0020' && gy === '2025' && used === 0 && days > 0 && rsn === '초기발생') {
      found0020 = true;
      var rawDate = row[idxDate];
      var currDateStr = (rawDate instanceof Date)
        ? Utilities.formatDate(rawDate, 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(rawDate || '').trim();
      if (currDateStr !== '2025-01-01') {
        vacSheet.getRange(i + 2, idxDate + 1).setValue('2025-01-01');
        Logger.log('✅ 0020 초기발생 date → 2025-01-01 수정 (이전: ' + currDateStr + ')');
      } else {
        Logger.log('ℹ️ 0020 초기발생 이미 정상');
      }
      break;
    }
  }
  if (!found0020) {
    vacSheet.appendRow(['0020', '2025-01-01', 0, '초기발생', '2025', '', 15]);
    Logger.log('✅ 0020 초기발생 15일 추가');
  }

  // ── 0020: 연간발생 2026 (2026-01-01) 없으면 추가
  var has0020Annual = allRows.some(function(row) {
    var no   = String(parseInt(row[idxEmpNo] || 0)).padStart(4, '0');
    var gy   = String(row[idxGrantYear] || '').trim();
    var rsn  = String(row[idxReason]    || '').trim();
    var days = parseFloat(row[idxDays]  || 0);
    return no === '0020' && gy === '2026' && rsn === '연간발생' && days > 0;
  });
  if (!has0020Annual) {
    vacSheet.appendRow(['0020', '2026-01-01', 0, '연간발생', '2026', '', 15]);
    Logger.log('✅ 0020 2026 연간발생 15일 추가');
  } else {
    Logger.log('ℹ️ 0020 2026 연간발생 이미 존재');
  }

  // ── 0021: 초기발생(2024) 날짜 보정 + 연간발생 2025 (grant_year=2025) — days/date 검사, 없으면 추가
  // 초기발생(0021, grant_year=2024) — date 강제 보정 (입사일: 2024-08-15)
  for (var k = 0; k < allRows.length; k++) {
    var r = allRows[k];
    var noK = String(parseInt(r[idxEmpNo] || 0)).padStart(4, '0');
    var gyK = String(r[idxGrantYear] || '').trim();
    var rsnK = String(r[idxReason] || '').trim();
    if (noK === '0021' && gyK === '2024' && rsnK === '초기발생') {
      var rawDateK = r[idxDate];
      var currDateK = (rawDateK instanceof Date)
        ? Utilities.formatDate(rawDateK, 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(rawDateK || '').trim();
      if (currDateK !== '2024-08-15') {
        vacSheet.getRange(k + 2, idxDate + 1).setValue('2024-08-15');
        Logger.log('✅ 0021 초기발생 date → 2024-08-15 수정 (이전: ' + currDateK + ')');
      } else {
        Logger.log('ℹ️ 0021 초기발생 이미 정상');
      }
      break;
    }
  }

  var fixed0021 = false;
  for (var i2 = 0; i2 < allRows.length; i2++) {
    var row2 = allRows[i2];
    var no2  = String(parseInt(row2[idxEmpNo] || 0)).padStart(4, '0');
    var gy2  = String(row2[idxGrantYear] || '').trim();
    var rsn2 = String(row2[idxReason]    || '').trim();
    if (no2 === '0021' && gy2 === '2025' && rsn2 === '연간발생') {
      var currDays2 = parseFloat(row2[idxDays] || 0);
      var rawDate2 = row2[idxDate];
      var currDate2 = (rawDate2 instanceof Date)
        ? Utilities.formatDate(rawDate2, 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(rawDate2 || '').trim();
      if (currDays2 <= 0) {
        vacSheet.getRange(i2 + 2, idxDays + 1).setValue(15);
        Logger.log('✅ 0021 연간발생 days 컬럼 → 15로 수정');
      } else {
        Logger.log('ℹ️ 0021 연간발생 days 정상 (' + currDays2 + '일)');
      }
      if (currDate2 !== '2025-01-01') {
        vacSheet.getRange(i2 + 2, idxDate + 1).setValue('2025-01-01');
        Logger.log('✅ 0021 연간발생 date → 2025-01-01 수정 (이전: ' + currDate2 + ')');
      }
      fixed0021 = true;
      break;
    }
  }
  if (!fixed0021) {
    vacSheet.appendRow(['0021', '2025-01-01', 0, '연간발생', '2025', '', 15]);
    Logger.log('✅ 0021 연간발생 15일 추가');
  }

  // ── 0023: 초기발생 date → 2025-07-01 정정 + 2026 연간발생 누락 시 추가
  // 초기발생 date 수정
  for (var j = 0; j < allRows.length; j++) {
    var row = allRows[j];
    var no  = String(parseInt(row[idxEmpNo] || 0)).padStart(4, '0');
    var gy  = String(row[idxGrantYear] || '').trim();
    var rsn = String(row[idxReason]    || '').trim();
    if (no === '0023' && gy === '2025' && rsn === '초기발생') {
      var rawDate = row[idxDate];
      var currDateStr = (rawDate instanceof Date)
        ? Utilities.formatDate(rawDate, 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(rawDate || '').trim();
      if (currDateStr !== '2025-07-01') {
        vacSheet.getRange(j + 2, idxDate + 1).setValue('2025-07-01');
        Logger.log('✅ 0023 초기발생 date → 2025-07-01 수정 (이전: ' + currDateStr + ')');
      } else {
        Logger.log('ℹ️ 0023 초기발생 date 이미 정상');
      }
      break;
    }
  }
  // 연간발생 2026 (2026-01-01) 없으면 추가
  var has0023Annual = allRows.some(function(row) {
    var no   = String(parseInt(row[idxEmpNo] || 0)).padStart(4, '0');
    var gy   = String(row[idxGrantYear] || '').trim();
    var rsn  = String(row[idxReason]    || '').trim();
    var days = parseFloat(row[idxDays]  || 0);
    return no === '0023' && gy === '2026' && rsn === '연간발생' && days > 0;
  });
  if (!has0023Annual) {
    vacSheet.appendRow(['0023', '2026-01-01', 0, '연간발생', '2026', '', 15]);
    Logger.log('✅ 0023 2026 연간발생 15일 추가');
  } else {
    Logger.log('ℹ️ 0023 2026 연간발생 이미 존재');
  }

  sortVacationSheet();
  Logger.log('✅ fixVacationRecords 완료');
}

// ── 유급휴가 시트 중복 발생 기록 제거 ──────────────
// date + reason 조합 기준으로 후발 중복 행 삭제 (첫 번째 행만 유지)
function removeDuplicateVacationRecords() {
  var vacSheet = getSheet(SHEET_VACATION);
  if (vacSheet.getLastRow() < 2) return;
  
  var allRows = vacSheet.getDataRange().getValues();
  var hdrRow = allRows[0] || [];
  var idxEmpNo = hdrRow.indexOf('emp_no');
  var idxDate = hdrRow.indexOf('date');
  var idxReason = hdrRow.indexOf('reason');
  
  if (idxEmpNo < 0 || idxDate < 0 || idxReason < 0) {
    Logger.log('⚠️ 헤더 컬럼 누락: emp_no=' + idxEmpNo + ', date=' + idxDate + ', reason=' + idxReason);
    return;
  }
  
  var seen = {}; // (emp_no + date + reason) → 첫 만남 행번호
  var toDelete = []; // 삭제할 행번호 (역순)
  
  for (var i = 1; i < allRows.length; i++) {
    var row = allRows[i];
    var no = String(parseInt(row[idxEmpNo] || 0)).padStart(4, '0');
    var dt = row[idxDate] instanceof Date
      ? Utilities.formatDate(row[idxDate], 'Asia/Tokyo', 'yyyy-MM-dd')
      : String(row[idxDate] || '').substring(0, 10);
    var rsn = String(row[idxReason] || '').trim();
    var key = no + '|' + dt + '|' + rsn;
    
    if (seen[key]) {
      toDelete.push(i + 2); // 시트는 1-indexed, 헤더 고려하면 +2
      Logger.log('⚠️ 중복 발견: ' + key + ' (행 ' + (i+2) + ') 삭제 예정');
    } else {
      seen[key] = i + 2;
    }
  }
  
  // 역순으로 삭제 (행번호 변경 방지)
  for (var j = toDelete.length - 1; j >= 0; j--) {
    vacSheet.deleteRow(toDelete[j]);
    Logger.log('✅ 행 ' + toDelete[j] + ' 삭제');
  }
  
  if (toDelete.length > 0) {
    sortVacationSheet();
    Logger.log('✅ 총 ' + toDelete.length + '개 중복 행 제거 완료');
  } else {
    Logger.log('ℹ️ 중복 행 없음');
  }
}

// ── 유급휴가 시트 1회 재정렬 (GAS 편집기에서 수동 실행) ──────────────
// emp_no 오름차순 → 같은 emp_no 내에서 date 오름차순으로 정렬. 헤더 행 유지.
function sortVacationSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_VACATION);
  if (!sheet) { Logger.log('❌ 유급휴가 시트 없음'); return; }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('정렬할 데이터 없음'); return; }

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var noCol   = headers.indexOf('emp_no');
  var dateCol = headers.indexOf('date');
  if (noCol < 0 || dateCol < 0) {
    Logger.log('❌ emp_no 또는 date 컬럼을 찾을 수 없음. 헤더: ' + headers.join(', '));
    return;
  }

  // 데이터 행만 추출 (헤더 제외)
  var dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var data = dataRange.getValues();

  // emp_no 오름차순(숫자) → date 오름차순 정렬
  data.sort(function(a, b) {
    var noA = parseInt(String(a[noCol] || '0').trim(), 10) || 0;
    var noB = parseInt(String(b[noCol] || '0').trim(), 10) || 0;
    if (noA !== noB) return noA - noB;
    // emp_no 동일: date 비교
    var dA = a[dateCol] instanceof Date
      ? Utilities.formatDate(a[dateCol], 'Asia/Tokyo', 'yyyy-MM-dd')
      : String(a[dateCol] || '').trim();
    var dB = b[dateCol] instanceof Date
      ? Utilities.formatDate(b[dateCol], 'Asia/Tokyo', 'yyyy-MM-dd')
      : String(b[dateCol] || '').trim();
    if (dA < dB) return -1;
    if (dA > dB) return  1;
    return 0;
  });

  dataRange.setValues(data);
  Logger.log('✅ 유급휴가 시트 정렬 완료: ' + (lastRow - 1) + '행 처리');
}

// ── 유급휴가 발생 기록 일괄 삭제 (GAS 편집기에서 1회 수동 실행) ──────────────
// used === 0 인 행(초기발생·연간발생)을 모두 삭제. 사용 기록(used > 0)은 유지.
function cleanVacationGrantRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_VACATION);
  if (!sheet) { Logger.log('❌ 유급휴가 시트 없음'); return; }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('삭제할 데이터 없음'); return; }

  var lastCol  = sheet.getLastColumn();
  var headers  = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var usedCol  = headers.indexOf('used');
  if (usedCol < 0) {
    Logger.log('❌ used 컬럼을 찾을 수 없음. 헤더: ' + headers.join(', '));
    return;
  }

  var deletedCount = 0;
  // 아래에서 위로 순회해 행 번호 어긋남 방지
  for (var row = lastRow; row >= 2; row--) {
    var usedVal = sheet.getRange(row, usedCol + 1).getValue();
    if (parseFloat(usedVal) === 0) {
      sheet.deleteRow(row);
      deletedCount++;
    }
  }
  Logger.log('✅ 발생 기록 ' + deletedCount + '행 삭제 완료');
}

// ── 1회용 유틸: users 시트의 사원ID 셀을 4자리 텍스트로 교정 ───────────────
// GAS 편집기에서 직접 이 함수를 실행하세요 (배포 불필요)
function fixUsersSheetSaeinID() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  if (!sheet) { Logger.log('❌ users 시트 없음'); return; }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('데이터 없음'); return; }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var sainCol = headers.indexOf('사원ID');
  if (sainCol < 0) { Logger.log('❌ 사원ID 컬럼 없음'); return; }
  var fixed = 0;
  for (var r = 2; r <= lastRow; r++) {
    var cell = sheet.getRange(r, sainCol + 1);
    var raw  = String(cell.getValue()).trim();
    if (!raw || raw === '') continue;
    var padded = raw.padStart(4, '0');
    if (raw !== padded || cell.getNumberFormat() !== '@') {
      cell.setNumberFormat('@');
      cell.setValue(padded);
      fixed++;
      Logger.log('수정: 행 ' + r + ' → ' + padded);
    }
  }
  Logger.log('✅ 총 ' + fixed + '개 셀 교정 완료');
}
