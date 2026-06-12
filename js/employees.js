// 수정: 2026-06-12 12:22 — 유급휴가 관리 "관리 대상으로 설정" → "적용 대상으로 설정" 문구 변경
'use strict';

let showResigned = false; // 퇴사자 포함 토글 상태

// 사원의 급여 데이터 존재 여부 확인
function hasPayrollData(emp) {
  const no = String(emp.no).padStart(4, '0');
  for (let y = 2020; y <= 2030; y++) {
    for (let m = 1; m <= 12; m++) {
      if (localStorage.getItem(`kyuyo_p_${no}_${y}_${m}`)) return true;
    }
  }
  return false;
}

// 재직 사원 편집 버튼 렌더링 — 급여 데이터 유무에 따라 삭제 버튼 활성/비활성
function renderActiveEmpBtns(idx) {
  const jp = LANG === 'JP';
  const emp = employees[idx];
  const hasPay = hasPayrollData(emp);
  const btns = document.getElementById('empFormBtns');
  if (!btns) return;

  const hintMsg = jp
    ? '給与データがある社員は削除できません。退職処理は退職日を入力してください。'
    : '급여 데이터가 있는 사원은 삭제할 수 없습니다. 퇴사 처리는 퇴사일을 입력해 주세요.';

  btns.style.display = 'flex';
  btns.style.flexDirection = 'column';
  btns.style.alignItems = 'flex-end';
  btns.style.gap = '4px';
  btns.innerHTML =
    `<div style="display:flex;gap:6px;">` +
    `<button class="btn btn-primary btn-sm" onclick="saveEmployee()">${jp?'保存':'저장'}</button>` +
    (hasPay
      ? `<button class="btn btn-danger btn-sm" disabled style="opacity:.4;cursor:not-allowed;">${jp?'削除':'삭제'}</button>`
      : `<button class="btn btn-danger btn-sm" onclick="deleteEmp(${idx})">${jp?'削除':'삭제'}</button>`) +
    `<button class="btn btn-sm" onclick="cancelEmpForm()">${jp?'キャンセル':'취소'}</button>` +
    `</div>` +
    (hasPay ? `<div style="font-size:calc(10px + var(--fs-delta));color:var(--text3);text-align:right;">${hintMsg}</div>` : '');
}

function isResigned(emp) {
  return !!(emp && emp.leave && emp.leave.trim());
}

// 사원 목록 표시 여부 판정 (설계 규칙 적용)
function shouldShowEmp(emp) {
  if (!isResigned(emp)) return true;          // 재직중: 항상 표시
  if (showResigned) return true;              // 토글 ON: 전체 퇴사자 표시
  const leaveYear = parseInt((emp.leave || '').substring(0, 4));
  if (isNaN(leaveYear)) return false;
  const today = new Date();
  const thisYear = today.getFullYear();
  const thisMonth = today.getMonth() + 1;
  if (leaveYear === thisYear) return true;            // 당해 연도: 뱃지 붙여서 표시
  if (leaveYear === thisYear - 1) return thisMonth <= 3; // 전년도: 1~3월만 표시
  return false;                                       // 2년 이상: 항상 숨김
}

function toggleShowResigned() {
  showResigned = !showResigned;
  renderEmpList();
}

function renderEmpList() {
  const body = document.getElementById('empListBody');
  const title = document.getElementById('empListTitle');
  const jp = LANG === 'JP';
  body.innerHTML = '';

  const activeCount = employees.filter(e => !isResigned(e)).length;
  const resignedCount = employees.filter(e => isResigned(e)).length;
  title.textContent = jp
    ? `従業員一覧（${activeCount}名）`
    : `사원 목록（${activeCount}명）`;

  // 퇴사자가 있을 때만 토글 바 표시
  if (resignedCount > 0) {
    const toggleBar = document.createElement('div');
    toggleBar.className = 'emp-list-toggle-bar';
    toggleBar.innerHTML = `<button class="resign-toggle-btn${showResigned ? ' active' : ''}" onclick="toggleShowResigned()">${jp ? `退職者を含む（${resignedCount}名）` : `퇴사자 포함（${resignedCount}명）`}</button>`;
    body.appendChild(toggleBar);
  }

  const visibleEmps = employees.filter(emp => shouldShowEmp(emp));
  if (!visibleEmps.length) {
    const empty = document.createElement('div');
    empty.className = 'emp-list-empty';
    empty.textContent = jp ? '従業員が登録されていません' : '등록된 사원이 없습니다';
    body.appendChild(empty);
    return;
  }

  employees.forEach((emp, i) => {
    if (!shouldShowEmp(emp)) return;
    const resigned = isResigned(emp);
    const item = document.createElement('div');
    item.className = 'emp-list-item' + (i === editingEmpIdx ? ' active' : '') + (resigned ? ' resigned' : '');
    const famCnt = countFamilies(emp);
    const badge = resigned ? `<span class="resign-badge">${jp ? '退' : '퇴'}</span>` : '';
    const kanaStr = jp && emp.kana ? `<span style="font-size:11px;color:var(--text3);margin-left:5px;">（${emp.kana}）</span>` : '';
    item.innerHTML = `<div class="emp-list-av${resigned ? ' av-resigned' : ''}">${emp.name.charAt(0)}</div><div class="emp-list-info"><div class="emp-list-name">${badge}${emp.name}${kanaStr}</div><div class="emp-list-no">${String(emp.no).padStart(4,'0')} · ${jp?'扶養':'부양'} ${famCnt}${jp?'名':'명'}</div></div>`;
    item.onclick = () => openEmpForm(i);
    body.appendChild(item);
  });
}

function countFamilies(emp) {
  if(!emp.families) return 0;
  return emp.families.filter(f=>{
    if(!f.birth) return false;
    return calcAgeByYear(f.birth) >= 16;
  }).length;
}

// ══ EMP FORM (inline) ══
let empFormDirty = false; // 폼 변경 여부 추적

function markDirty() { empFormDirty = true; }

function setFieldError(errId, msg, inputId) {
  const errEl = document.getElementById(errId);
  if (errEl) errEl.textContent = msg || '';
  if (inputId) {
    const inp = document.getElementById(inputId);
    if (inp) inp.classList.toggle('error', !!msg);
  }
}

function clearFieldError(errId, inputId) {
  setFieldError(errId, '', inputId);
}

function openEmpForm(idx) {
  // 수정 중인데 다른 사원 선택 시 경고
  if(editingEmpIdx !== -1 && empFormDirty && idx !== editingEmpIdx) {
    const jp = LANG==='JP';
    const msg = jp
      ? '入力中の内容が失われます。このまま移動しますか？'
      : '입력 중인 내용이 사라집니다. 이동하시겠습니까?';
    if(!confirm(msg)) return;
  }

  editingEmpIdx = idx;
  empFormDirty = false;
  const title=document.getElementById('empFormTitle');
  const btns=document.getElementById('empFormBtns');

  const jp = LANG === 'JP';
  if(idx===-1) {
    tempFamilies=[];
    title.textContent=jp?'新規従業員登録':'신규 사원 등록';
    btns.innerHTML=`<button class="btn btn-success btn-sm" onclick="saveEmployee()">${jp?'保存':'저장'}</button><button class="btn btn-sm" onclick="cancelEmpForm()">${jp?'キャンセル':'취소'}</button>`;
    renderEmpFormFields(null, false);
  } else {
    const emp=employees[idx];
    tempFamilies=JSON.parse(JSON.stringify(emp.families||[]));
    const resigned = isResigned(emp);
    if (resigned) {
      title.textContent = jp ? `${emp.name}${emp.kana?'（'+emp.kana+'）':''} の閲覧（退職者）` : `${emp.name} 보기（퇴사자）`;
      btns.innerHTML = `<button class="btn btn-success btn-sm" onclick="reinstateEmp(${idx})">${jp?'在職に戻す':'재직 복귀'}</button><button class="btn btn-sm" onclick="cancelEmpForm()">${jp?'キャンセル':'취소'}</button>`;
      renderEmpFormFields(emp, true);
    } else {
      title.textContent = jp && emp.kana ? `${emp.name}（${emp.kana}）` : emp.name;
      renderEmpFormFields(emp, false);
      renderActiveEmpBtns(idx);
    }
  }
  renderEmpList();
  // 재직 사원 편집 버튼은 renderActiveEmpBtns가 처리하므로 신규·퇴사자만 display 설정
  if(idx === -1 || (idx !== -1 && isResigned(employees[idx]))) {
    const btnsEl = document.getElementById('empFormBtns');
    if(btnsEl) { btnsEl.style.display='flex'; btnsEl.style.flexDirection=''; btnsEl.style.alignItems=''; btnsEl.style.gap='6px'; }
  }
}

function cancelEmpForm() {
  if(empFormDirty) {
    const jp = LANG==='JP';
    const msg = jp ? '入力中の内容が失われます。キャンセルしますか？' : '입력 중인 내용이 사라집니다. 취소하시겠습니까?';
    if(!confirm(msg)) return;
  }
  editingEmpIdx=-1;
  tempFamilies=[];
  empFormDirty=false;
  const body=document.getElementById('empFormBody');
  body.innerHTML=`<div style="padding:40px;text-align:center;color:var(--text3);"><div style="font-size:36px;margin-bottom:10px;">👈</div><div>${LANG==='JP'?'左のリストから選択、または「新規」ボタンで登録してください。':'좌측 목록에서 선택하거나 「사원 추가」 버튼으로 등록해 주세요.'}</div></div>`;
  document.getElementById('empFormTitle').textContent=LANG==='JP'?'従業員を選択してください':'사원을 선택해 주세요';
  document.getElementById('empFormBtns').innerHTML='';
  renderEmpList();
}

function renderEmpFormFields(emp, readOnly = false) {
  const isNew = !emp;
  const v = (k,def='') => emp ? (emp[k]!==undefined&&emp[k]!==''?emp[k]:def) : def;
  const jp=LANG==='JP';
  const dis = readOnly ? ' disabled' : '';
  const assignedNo = isNew ? _assignEmpNo() : (v('no') ? String(v('no')).padStart(4,'0') : '');

  const html = `
  <div class="form-grid2">
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label"><span class="form-req">*</span>${jp?'社員番号':'사원 번호'}</label>
          <span class="form-label-hint">${jp?'（自動採番）':'（자동 배정）'}</span>
        </div>
      </div>
      <input class="form-input" id="f-no" value="${assignedNo}"
        readonly style="background:#f3f4f6;color:var(--text3);cursor:default;"
        onkeydown="focusNext(event,'f-name')">
    </div>
    <div></div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label"><span class="form-req">*</span>${jp?'氏名':'이름'}</label>
          <span class="form-error" id="f-name-err"></span>
        </div>
      </div>
      <input class="form-input" id="f-name" value="${v('name')}"
        oninput="clearFieldError('f-name-err','f-name');markDirty()" onkeydown="focusNext(event,'f-kana')"${dis}>
    </div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label"><span class="form-req">*</span>${jp?'カナ':'카나'}</label>
          <span class="form-label-hint">${jp?'カタカナ・英字可':'가타카나·영문 가능'}</span>
          <span class="form-error" id="f-kana-err"></span>
        </div>
      </div>
      <input class="form-input" id="f-kana" value="${v('kana')}"
        oninput="clearFieldError('f-kana-err','f-kana');markDirty()" onkeydown="focusNext(event,'f-join')"${dis}>
    </div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label"><span class="form-req">*</span>${jp?'入社日':'입사일'}</label>
          <span class="form-error" id="f-join-err"></span>
        </div>
      </div>
      <input class="form-input" id="f-join" type="text" value="${normalizeDate(v('join'))}"
        placeholder="YYYY-MM-DD" autocomplete="off" data-required="1"
        onfocus="onDateFocus(this)" onblur="onDateBlur(this,'f-join-err')"
        onkeydown="onDateKeydown(event,'f-leave','f-join-err')" oninput="onDateInput(this)"${dis}>
    </div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label">${jp?'退職日':'퇴사일'}</label>
          <span class="form-error" id="f-leave-err"></span>
        </div>
      </div>
      ${readOnly
        ? `<div style="display:flex;gap:6px;align-items:center;">
          <input class="form-input" id="f-leave" type="text" value="${normalizeDate(v('leave'))}"
            placeholder="YYYY-MM-DD" autocomplete="off" disabled>
          <button class="btn btn-success btn-sm" style="white-space:nowrap;" onclick="reinstateEmp(${editingEmpIdx})">${jp?'在職に戻す':'재직 복귀'}</button>
        </div>`
        : `<input class="form-input" id="f-leave" type="text" value="${normalizeDate(v('leave'))}"
          placeholder="YYYY-MM-DD" autocomplete="off"
          onfocus="onDateFocus(this)" onblur="onDateBlur(this,'f-leave-err')"
          onkeydown="onDateKeydown(event,'f-birth','f-leave-err')" oninput="onDateInput(this)">`
      }
    </div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label"><span class="form-req">*</span>${jp?'生年月日':'생년월일'}</label>
          <span class="form-error" id="f-birth-err"></span>
        </div>
      </div>
      <input class="form-input" id="f-birth" type="text" value="${normalizeDate(v('birth'))}"
        placeholder="YYYY-MM-DD" autocomplete="off" data-required="1"
        onfocus="onDateFocus(this)" onblur="onDateBlur(this,'f-birth-err');updateAgeDisplay()"
        onkeydown="onDateKeydown(event,'f-kaigo','f-birth-err')" oninput="onDateInput(this)"${dis}>
    </div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label">${jp?'年齢':'나이'}</label>
        </div>
      </div>
      <div id="f-age-display" style="padding:7px 9px;border:1px solid var(--border);border-radius:var(--r2);font-size:12.5px;font-family:inherit;color:var(--text);background:var(--surface);">${calcAgeStr(normalizeDate(v('birth')), jp)}</div>
    </div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label">${jp?'介護保険':'개호보험'}</label>
        </div>
      </div>
      <select class="form-select" id="f-kaigo" onchange="markDirty()"${dis}>
        <option value="auto" ${v('kaigo','auto')==='auto'?'selected':''}>${jp?'自動（年齢で判定）':'자동（나이로 판정）'}</option>
        <option value="yes" ${v('kaigo')==='yes'?'selected':''}>${jp?'対象（40歳以上）':'대상（40세 이상）'}</option>
        <option value="no" ${v('kaigo')==='no'?'selected':''}>${jp?'対象外':'대상 외'}</option>
      </select>
    </div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label">${jp?'雇用保険':'고용보험'}</label>
        </div>
      </div>
      <select class="form-select" id="f-koyo" onchange="markDirty()"${dis}>
        <option value="yes" ${v('koyo','yes')==='yes'?'selected':''}>${jp?'加入':'가입'}</option>
        <option value="no" ${v('koyo')==='no'?'selected':''}>${jp?'未加入':'미가입'}</option>
      </select>
    </div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label">${jp?'社保加入年月':'사회보험 가입 연월'}</label>
          <span class="form-label-hint">${jp?'例: 2025-04 / 202504（空欄=全月）':'예: 2025-04 또는 202504'}</span>
          <span class="form-error" id="f-shaho-err"></span>
        </div>
      </div>
      <input class="form-input" id="f-shaho-start" value="${v('shaho_start')}"
        placeholder="YYYY-MM" maxlength="7" autocomplete="off"
        oninput="onShahoInput(this)"
        onblur="onShahoBlur(this)"
        onkeydown="onShahoKeydown(event)"${dis}>
    </div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label">${jp?'所得税区分':'소득세 구분'}</label>
        </div>
      </div>
      <select class="form-select" id="f-shotoku-kbn" onchange="markDirty()"${dis}>
        <option value="ko" ${v('shotokuKbn','ko')==='ko'?'selected':''}>${jp?'甲欄（扶養控除等申告書あり）':'갑란（부양공제신고서 제출）'}</option>
        <option value="otsu" ${v('shotokuKbn')==='otsu'?'selected':''}>${jp?'乙欄（申告書なし）':'을란（신고서 미제출）'}</option>
      </select>
    </div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label">${jp?'扶養親族等の数（所得税用）':'부양친족 수（소득세용）'}</label>
          <span class="form-label-hint">${jp?'扶養家族（16歳以上）から自動計算':'부양가족（16세 이상）에서 자동 계산'}</span>
        </div>
      </div>
      <select class="form-select" id="f-fuyou" onchange="markDirty()"${dis}>
        ${[0,1,2,3,4,5,6,7].map(n=>`<option value="${n}" ${(emp ? countFamilies(emp) : 0)===n?'selected':''}>${n}${jp?'人':'명'}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <div class="form-label-block">
        <div class="form-label-row">
          <label class="form-label">${jp?'有給休暇管理':'유급휴가 관리'}</label>
        </div>
      </div>
      <label class="form-input" style="display:flex;align-items:center;gap:8px;cursor:${readOnly?'default':'pointer'};">
        <input type="checkbox" id="f-vacation-applied" ${emp?.vacationApplied !== false?'checked':''} style="accent-color:var(--accent);width:14px;height:14px;flex-shrink:0;"${readOnly?' disabled':' onchange="markDirty()"'}>
        <span style="font-size:calc(12.5px + var(--fs-delta));">${jp?'有給管理対象にする':'적용 대상으로 설정'}</span>
      </label>
    </div>
  </div>

  <div class="fam-section">
    <div class="fam-title">
      <span>${jp?'扶養家族':'부양가족'} <span class="fam-count-badge" id="famCountBadge">0${jp?'名':'명'}</span></span>
      <span style="font-size:11px;color:var(--text3);">${jp?'16歳以上が扶養人数にカウントされます':'만 16세 이상이 부양 인원으로 집계됩니다'}</span>
    </div>
    ${readOnly ? '' : `<div class="fam-add-row">
      <div class="form-group" style="margin:0;">
        <div class="form-label-block" style="min-height:24px;">
          <div class="form-label-row">
            <label class="form-label">${jp?'氏名':'이름'}</label>
          </div>
        </div>
        <input class="form-input" id="fam-name" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('fam-birth').focus();}">
      </div>
      <div class="form-group" style="margin:0;">
        <div class="form-label-block" style="min-height:24px;">
          <div class="form-label-row">
            <label class="form-label">${jp?'生年月日':'생년월일'}</label>
            <span class="form-error" id="fam-birth-err"></span>
          </div>
        </div>
        <input class="form-input" id="fam-birth" type="text"
          placeholder="YYYY-MM-DD" autocomplete="off"
          onfocus="onDateFocus(this)" onblur="onDateBlur(this,'fam-birth-err')"
          onkeydown="onDateKeydown(event,'addFam','fam-birth-err')" oninput="onDateInput(this)">
      </div>
      <button class="btn btn-success btn-sm" onclick="addFam()">${jp?'追加':'추가'}</button>
      <div></div>
    </div>`}
    <table class="fam-table">
      <thead><tr><th>${jp?'氏名':'이름'}</th><th>${jp?'生年月日':'생년월일'}</th><th>${jp?'扶養対象':'부양 대상'}</th>${readOnly?'':'<th></th>'}</tr></thead>
      <tbody id="famTableBody"></tbody>
    </table>
  </div>`;

  document.getElementById('empFormBody').innerHTML = html;
  renderFamTable();
  updateFamCount();
}

// ══ DATE INPUT (mask + compact) ══
const DATE_MASK = 'YYYY-MM-DD';
const DATE_SLOT_IDX = [0, 1, 2, 3, 5, 6, 8, 9];

function normalizeDateInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function isDateMaskValue(v) {
  if (!v || v === DATE_MASK) return true;
  return /^[\dY]{4}-[\dM]{2}-[\dD]{2}$/.test(v);
}

function formatDateDigits(digits) {
  const chars = DATE_MASK.split('');
  for (let i = 0; i < digits.length && i < 8; i++) {
    chars[DATE_SLOT_IDX[i]] = digits[i];
  }
  return chars.join('');
}

function dateDigitsFromValue(v) {
  let digits = '';
  for (const i of DATE_SLOT_IDX) {
    if (/\d/.test(v[i])) digits += v[i];
  }
  return digits;
}

function setDateCaret(input, pos) {
  const p = Math.max(0, Math.min(pos, input.value.length));
  input.setSelectionRange(p, p + 1);
}

function clearDateErrorForInput(input) {
  const errMap = { 'f-join': 'f-join-err', 'f-leave': 'f-leave-err', 'f-birth': 'f-birth-err', 'fam-birth': 'fam-birth-err' };
  const errEl = document.getElementById(errMap[input.id] || '');
  if (errEl) errEl.textContent = '';
  input.classList.remove('error');
}

function onDateFocus(input) {
  const norm = normalizeDateInput(input.value);
  if (norm) {
    input.value = norm;
    return;
  }
  if (!input.value.trim() || isDateMaskValue(input.value)) {
    input.value = DATE_MASK;
    requestAnimationFrame(() => setDateCaret(input, DATE_SLOT_IDX[0]));
  }
}

function finalizeDateInput(input) {
  const norm = normalizeDateInput(input.value);
  if (norm) {
    input.value = norm;
    return;
  }
  if (isDateMaskValue(input.value)) input.value = '';
}

function onDateBlur(input, errId) {
  finalizeDateInput(input);
  validateDateText(input, errId, input.dataset.required === '1');
}

function onDateInput(input) {
  const digits = input.value.replace(/\D/g, '');
  if (digits.length >= 8) {
    input.value = normalizeDateInput(digits);
  } else if (digits.length > 0 && !/[YMD]/.test(input.value)) {
    input.value = formatDateDigits(digits);
  }
  clearDateErrorForInput(input);
  markDirty();
}

function handleDateDigit(input, digit) {
  let digits;
  const allSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
  if (isDateMaskValue(input.value)) {
    digits = (dateDigitsFromValue(input.value) + digit).slice(0, 8);
  } else if (normalizeDateInput(input.value) && allSelected) {
    digits = digit;
  } else if (normalizeDateInput(input.value)) {
    digits = (dateDigitsFromValue(input.value) + digit).slice(0, 8);
  } else {
    digits = digit;
  }

  // 월 첫 자리(index 4)가 2~9이면 앞에 0 자동 추가 → 02~09
  if (digits.length === 5 && parseInt(digits[4]) >= 2) {
    digits = digits.slice(0, 4) + '0' + digits[4];
  }
  // 일 첫 자리(index 6)가 4~9이면 앞에 0 자동 추가 → 04~09
  if (digits.length === 7 && parseInt(digits[6]) >= 4) {
    digits = digits.slice(0, 6) + '0' + digits[6];
  }

  if (digits.length === 8) {
    input.value = normalizeDateInput(digits);
  } else {
    input.value = formatDateDigits(digits);
    requestAnimationFrame(() => setDateCaret(input, DATE_SLOT_IDX[digits.length]));
  }
  clearDateErrorForInput(input);
}

function handleDateBackspace(input) {
  let digits = input.value.replace(/\D/g, '').slice(0, 8);
  if (!digits.length) {
    input.value = DATE_MASK;
    requestAnimationFrame(() => setDateCaret(input, DATE_SLOT_IDX[0]));
    clearDateErrorForInput(input);
    return;
  }
  digits = digits.slice(0, -1);
  input.value = digits.length ? formatDateDigits(digits) : DATE_MASK;
  const pos = digits.length < 8 ? DATE_SLOT_IDX[digits.length] : DATE_SLOT_IDX[7];
  requestAnimationFrame(() => setDateCaret(input, pos));
  clearDateErrorForInput(input);
}

function isDateFieldEmpty(v) {
  const t = (v || '').trim();
  if (!t || t === DATE_MASK) return true;
  return isDateMaskValue(t) && dateDigitsFromValue(t).length === 0;
}

function tryAdvanceDateField(input, nextId, errId) {
  const jp = LANG === 'JP';
  if (isDateFieldEmpty(input.value)) {
    if (input.dataset.required === '1') {
      setFieldError(errId, jp ? '必須入力' : '필수 입력', input.id);
      return false;
    }
    input.value = '';
    clearFieldError(errId, input.id);
  } else {
    // 일 첫 자리만 입력된 경우(7자리) → 0 패딩으로 완성 (예: 1→01, 2→02, 3→03)
    const d7 = dateDigitsFromValue(input.value);
    if (d7.length === 7) {
      input.value = normalizeDateInput(d7.slice(0, 6) + '0' + d7[6]) || input.value;
    }
    const norm = normalizeDateInput(input.value);
    if (norm) input.value = norm;
    if (!validateDateText(input, errId)) return false;
  }
  if (nextId === 'addFam') {
    addFam();
    return true;
  }
  const next = document.getElementById(nextId);
  if (next) next.focus();
  return true;
}

function onDateKeydown(event, nextId, errId) {
  const input = event.target;

  if (event.key === 'Enter') {
    event.preventDefault();
    if (!tryAdvanceDateField(input, nextId, errId)) {
      input.focus();
    }
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    input.value = '';
    input.blur();
    return;
  }

  if (event.key === 'Tab' || event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
    return;
  }

  if (/^\d$/.test(event.key)) {
    event.preventDefault();
    handleDateDigit(input, event.key);
    markDirty();
    return;
  }

  if (event.key === 'Backspace') {
    event.preventDefault();
    handleDateBackspace(input);
    markDirty();
    return;
  }

  if (event.key.length === 1) {
    event.preventDefault();
  }
}

// ══ DATE VALIDATION ══
function today() { return new Date().toISOString().split('T')[0]; }

// text 입력용 날짜 검증 (브라우저 자동보정 없음)
function validateDateText(input, errId, required) {
  const errEl = document.getElementById(errId);
  if(!errEl) return true;
  const jp = LANG==='JP';
  const v = input.value.trim();
  const empty = !v || v === DATE_MASK || (isDateMaskValue(v) && dateDigitsFromValue(v).length === 0);
  if(empty) {
    if(required) {
      errEl.textContent = jp ? '必須入力' : '필수 입력';
      input.classList.add('error');
      return false;
    }
    errEl.textContent=''; input.classList.remove('error'); return true;
  }

  // YYYY-MM-DD 형식 파싱
  const match = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) {
    errEl.textContent = jp ? '日付はYYYY-MM-DD形式で入力してください（例：1990-04-01）' : '날짜는 YYYY-MM-DD 형식으로 입력해 주세요（예：1990-04-01）';
    input.classList.add('error');
    return false;
  }
  const y=parseInt(match[1]), m=parseInt(match[2]), day=parseInt(match[3]);
  const maxDay = new Date(y, m, 0).getDate();
  if(m < 1 || m > 12) {
    errEl.textContent = jp ? '月は1〜12で入力してください' : '월은 1~12로 입력해 주세요';
    input.classList.add('error'); return false;
  }
  if(day < 1 || day > maxDay) {
    errEl.textContent = jp
      ? `${m}月は${maxDay}日までです。入力し直してください`
      : `${m}월은 ${maxDay}일까지입니다. 다시 입력해 주세요`;
    input.classList.add('error');
    return false;
  }
  const t = new Date();
  const todayStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  if(v > todayStr) {
    errEl.textContent = jp ? '未来の日付は入力できません' : '미래 날짜는 입력할 수 없습니다';
    input.classList.add('error');
    return false;
  }
  errEl.textContent=''; input.classList.remove('error'); return true;
}


function isValidDate(dateStr) {
  if(!dateStr) return true;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) return false;
  const y=parseInt(match[1]), m=parseInt(match[2]), day=parseInt(match[3]);
  if(m<1||m>12) return false;
  const maxDay = new Date(y,m,0).getDate();
  if(day<1||day>maxDay) return false;
  const t2 = new Date();
  const todayStr2 = `${t2.getFullYear()}-${String(t2.getMonth()+1).padStart(2,'0')}-${String(t2.getDate()).padStart(2,'0')}`;
  if(dateStr > todayStr2) return false;
  return true;
}

// ══ SHAHO_START (사회보험 가입 연월) YYYY-MM 입력/검증 ══

function onShahoInput(input) {
  const digits = input.value.replace(/\D/g, '');
  // 숫자 6자리만 입력된 경우 자동 포맷 (202504 → 2025-04)
  if (digits.length >= 6 && !input.value.includes('-')) {
    input.value = digits.slice(0, 4) + '-' + digits.slice(4, 6);
  }
  clearFieldError('f-shaho-err', 'f-shaho-start');
  markDirty();
}

function onShahoBlur(input) {
  const digits = input.value.replace(/\D/g, '');
  if (digits.length === 6 && !input.value.includes('-')) {
    input.value = digits.slice(0, 4) + '-' + digits.slice(4, 6);
  }
  validateShahoStart(input, 'f-shaho-err');
}

function onShahoKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.target;
  const digits = input.value.replace(/\D/g, '');
  if (digits.length === 6 && !input.value.includes('-')) {
    input.value = digits.slice(0, 4) + '-' + digits.slice(4, 6);
  }
  if (!validateShahoStart(input, 'f-shaho-err')) { input.focus(); return; }
  const next = document.getElementById('f-shotoku-kbn');
  if (next) next.focus();
}

function validateShahoStart(input, errId) {
  const errEl = document.getElementById(errId);
  if (!errEl) return true;
  const jp = LANG === 'JP';
  const v = (input.value || '').trim();

  if (!v) {
    errEl.textContent = ''; input.classList.remove('error');
    return true;
  }

  const match = v.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    errEl.textContent = jp ? '例: 2025-04 または 202504' : '예: 2025-04 또는 202504';
    input.classList.add('error');
    return false;
  }

  const y = parseInt(match[1]), m = parseInt(match[2]);
  if (m < 1 || m > 12) {
    errEl.textContent = jp ? '月は1〜12で入力してください' : '월은 1~12로 입력해 주세요';
    input.classList.add('error');
    return false;
  }

  // 입사일보다 이전인지 확인
  const joinMatch = (document.getElementById('f-join')?.value || '').match(/^(\d{4})-(\d{2})/);
  if (joinMatch) {
    const jy = parseInt(joinMatch[1]), jm = parseInt(joinMatch[2]);
    if (y < jy || (y === jy && m < jm)) {
      errEl.textContent = jp ? '入社年月より前の日付は入力できません' : '입사 연월보다 이른 날짜는 입력할 수 없습니다';
      input.classList.add('error');
      return false;
    }
  }

  errEl.textContent = ''; input.classList.remove('error');
  return true;
}

// ══ EMP NO 0패딩 ══
// ══ AUTO EMP NO ══
function _assignEmpNo() {
  const used = new Set([
    ...employees.map(e => String(e.no).padStart(4, '0')),
    ...deletedEmpIds,
    ...gasDeletedEmpIds,
  ]);
  let n = 1;
  while (used.has(String(n).padStart(4, '0'))) n++;
  return String(n).padStart(4, '0');
}

// ══ AGE DISPLAY ══
function calcAgeStr(birthStr, jp) {
  if (!birthStr || !/^\d{4}-\d{2}-\d{2}$/.test(birthStr)) return '—';
  const today = new Date();
  const birth = new Date(birthStr);
  if (isNaN(birth.getTime())) return '—';
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? `${age}${jp ? '歳' : '세'}` : '—';
}

function updateAgeDisplay() {
  const birthEl = document.getElementById('f-birth');
  const ageEl   = document.getElementById('f-age-display');
  if (!birthEl || !ageEl) return;
  ageEl.textContent = calcAgeStr(birthEl.value, LANG === 'JP');
}

// ══ FAMILY ══
function addFam() {
  const name = document.getElementById('fam-name').value.trim();
  const birth = document.getElementById('fam-birth').value;
  const jp = LANG==='JP';
  if(!name) { showToast(jp?'氏名を入力してください':'이름을 입력해 주세요','w'); return; }
  if(!birth) { showToast(jp?'生年月日を入力してください':'생년월일을 입력해 주세요','w'); return; }
  if(!isValidDate(birth)) {
    const errEl = document.getElementById('fam-birth-err');
    if(errEl) errEl.textContent = jp?'有効な日付を入力してください':'유효한 날짜를 입력해 주세요';
    showToast(jp?'有効な日付を入力してください':'유효한 날짜를 입력해 주세요','w'); return;
  }
  tempFamilies.push({name,birth});
  document.getElementById('fam-name').value='';
  document.getElementById('fam-birth').value='';
  renderFamTable(); updateFamCount();
  document.getElementById('fam-name').focus();
}

function removeFam(i) { tempFamilies.splice(i,1); renderFamTable(); updateFamCount(); }

function renderFamTable() {
  const tbody = document.getElementById('famTableBody');
  if(!tbody) return;
  tbody.innerHTML='';
  const jp=LANG==='JP';
  const ro = editingEmpIdx !== -1 && employees[editingEmpIdx] && isResigned(employees[editingEmpIdx]);
  tempFamilies.forEach((f,i)=>{
    const isTarget = calcAgeByYear(f.birth) >= 16;
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${f.name}</td><td>${normalizeDate(f.birth)}</td><td><span class="fam-badge ${isTarget?'badge-ok':'badge-no'}">${isTarget?(jp?'対象':'대상'):(jp?'16歳未満':'16세 미만')}</span></td>${ro?'':'<td><button class="btn btn-sm" onclick="removeFam('+i+')" style="color:var(--red);padding:3px 7px;">'+(jp?'削除':'삭제')+'</button></td>'}`;
    tbody.appendChild(tr);
  });
}

function updateFamCount() {
  const el=document.getElementById('famCountBadge');
  if(!el) return;
  const cnt = tempFamilies.filter(f=>{ if(!f.birth) return false; return calcAgeByYear(f.birth) >= 16; }).length;
  el.textContent = cnt+(LANG==='JP'?'名':'명');
  const fuyouEl = document.getElementById('f-fuyou');
  if(fuyouEl) fuyouEl.value = String(Math.min(cnt, 7));
}

// ══ SAVE EMP ══
function saveEmployee() {
  const jp=LANG==='JP';
  // 퇴사자는 읽기 전용 — 저장 차단
  if(editingEmpIdx !== -1 && isResigned(employees[editingEmpIdx])) {
    showToast(jp?'退職者は編集できません':'퇴사자는 편집할 수 없습니다','w');
    return;
  }
  const noEl=document.getElementById('f-no');
  const nameEl=document.getElementById('f-name');
  if(!noEl||!nameEl) return;
  let no=noEl.value.trim().replace(/\D/g, '').padStart(4,'0');
  const name=toHalfSpace(nameEl.value.trim());
  const kanaEl = document.getElementById('f-kana');
  const joinEl = document.getElementById('f-join');
  const birthEl = document.getElementById('f-birth');
  const kana = toHalfSpace((kanaEl?.value||'').trim());

  let ok = true;
  if(!name) { setFieldError('f-name-err', jp?'必須入力':'필수 입력', 'f-name'); ok = false; }
  else clearFieldError('f-name-err', 'f-name');
  if(!kana) { setFieldError('f-kana-err', jp?'必須入力':'필수 입력', 'f-kana'); ok = false; }
  else clearFieldError('f-kana-err', 'f-kana');
  if(joinEl && !validateDateText(joinEl, 'f-join-err', true)) ok = false;
  if(birthEl && !validateDateText(birthEl, 'f-birth-err', true)) ok = false;
  const shahoEl = document.getElementById('f-shaho-start');
  if(shahoEl && shahoEl.value.trim()) {
    const sd = shahoEl.value.replace(/\D/g, '');
    if(sd.length === 6 && !shahoEl.value.includes('-')) shahoEl.value = sd.slice(0,4)+'-'+sd.slice(4,6);
    if(!validateShahoStart(shahoEl, 'f-shaho-err')) ok = false;
  }
  if(!ok) {
    showToast(jp?'必須項目を確認してください':'필수 항목을 확인해 주세요','w');
    return;
  }

  const joinVal = joinEl?.value || '';
  const leaveEl = document.getElementById('f-leave');
  if (leaveEl && leaveEl.value.trim() && !validateDateText(leaveEl, 'f-leave-err', false)) { showToast(jp?'退職日を確認してください':'퇴사일을 확인해 주세요','w'); return; }
  const leaveVal = leaveEl?.value || '';
  const birthVal = birthEl?.value || '';

  const empData = {
    no, name, kana,
    join: joinVal,
    leave: leaveVal,
    birth: birthVal,
    kaigo: document.getElementById('f-kaigo')?.value||'auto',
    koyo: document.getElementById('f-koyo')?.value||'yes',
    shaho_start: (document.getElementById('f-shaho-start')?.value||'').trim(),
    shotokuKbn: document.getElementById('f-shotoku-kbn')?.value||'ko',
    fuyouCount: parseInt(document.getElementById('f-fuyou')?.value)||0,
    vacationApplied: document.getElementById('f-vacation-applied')?.checked !== false,
    base: 0,
    families: [...tempFamilies],
  };

  const isNewEmp = editingEmpIdx === -1;
  if(isNewEmp) {
    employees.push(empData);
    editingEmpIdx = employees.length - 1;
  } else {
    const oldNo = employees[editingEmpIdx].no;
    employees[editingEmpIdx] = empData;
    // 사원번호가 변경된 경우 급여 데이터 키도 마이그레이션
    if(oldNo !== no) {
      for(let y = 2020; y <= 2030; y++) {
        for(let m = 1; m <= 12; m++) {
          const oldKey = `kyuyo_p_${oldNo}_${y}_${m}`;
          const val = localStorage.getItem(oldKey);
          if(val) {
            localStorage.setItem(`kyuyo_p_${no}_${y}_${m}`, val);
            localStorage.removeItem(oldKey);
          }
        }
      }
      showToast(jp?`社員番号を ${oldNo} → ${no} に変更し、給与データを移行しました`:`사원 번호 ${oldNo} → ${no} 변경 및 급여 데이터 이전 완료`,'s');
    }
  }

  localStorage.setItem(LS.emp,JSON.stringify(employees));

  // 신규 사원 등록 시 초기 유급휴가 자동 발생
  if (isNewEmp && typeof initEmployeeVacation === 'function') {
    initEmployeeVacation(empData);
  }

  // 퇴사일이 새로 설정된 경우 deleted_emp_ids에 기록
  if(leaveVal && !deletedEmpIds.includes(no) && !gasDeletedEmpIds.includes(no)) {
    deletedEmpIds.push(no);
    gasDeletedEmpIds.push(no);
    localStorage.setItem(LS.deletedEmpIds, JSON.stringify(deletedEmpIds));
    if(typeof gasAddDeletedEmpId === 'function') gasAddDeletedEmpId(no, leaveVal);
  }

  if(gasUrl) {
    fetch(gasUrl,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({type:'employees',employees,...(typeof gasWriteAuth==='function'?gasWriteAuth():{})}),mode:'no-cors'}).catch(()=>{});
  }
  gasAppendLog(isNewEmp ? '사원추가' : (leaveVal ? '퇴사처리' : '사원수정'), `${name} (${no})`, '성공', leaveVal ? `퇴사일: ${leaveVal}` : '');

  empFormDirty = false;
  renderEmpSelect();
  renderEmpList();
  const title = document.getElementById('empFormTitle');
  const btns = document.getElementById('empFormBtns');
  const savedEmp = employees[editingEmpIdx];
  if(isResigned(savedEmp)) {
    if(title) title.textContent = jp ? `${name} の閲覧（退職者）` : `${name} 보기（퇴사자）`;
    if(btns) btns.innerHTML = `<button class="btn btn-success btn-sm" onclick="reinstateEmp(${editingEmpIdx})">${jp?'在職に戻す':'재직 복귀'}</button><button class="btn btn-sm" onclick="cancelEmpForm()">${jp?'キャンセル':'취소'}</button>`;
    renderEmpFormFields(savedEmp, true);
  } else {
    if(title) title.textContent = name;
    renderActiveEmpBtns(editingEmpIdx);
  }
  showToast(gasUrl
    ? (jp?'保存 & Google同期 ✓':'저장 & Google 동기화 ✓')
    : (jp?'従業員情報を保存しました ✓':'사원 정보를 저장했습니다 ✓'), 's');
}

function deleteEmp(i) {
  const emp=employees[i];
  const jp=LANG==='JP';
  const msg=jp?`${emp.name} を削除しますか？`:`${emp.name}을(를) 삭제하시겠습니까?`;
  if(!confirm(msg)) return;
  // 삭제된 사원의 Primary Key를 재사용 불가 목록에 추가
  const deletedNo = String(emp.no).padStart(4, '0');
  if(!deletedEmpIds.includes(deletedNo)) {
    deletedEmpIds.push(deletedNo);
    gasDeletedEmpIds.push(deletedNo);
    localStorage.setItem(LS.deletedEmpIds, JSON.stringify(deletedEmpIds));
    if(typeof gasAddDeletedEmpId === 'function') gasAddDeletedEmpId(deletedNo, emp.leave || new Date().toISOString().split('T')[0]);
  }
  employees.splice(i, 1);
  localStorage.setItem(LS.emp, JSON.stringify(employees));
  if(gasUrl) {
    fetch(gasUrl,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({type:'employees',employees,...(typeof gasWriteAuth==='function'?gasWriteAuth():{})}),mode:'no-cors'}).catch(()=>{});
  }
  gasAppendLog('사원삭제', `${emp.name} (${deletedNo})`, '성공', '');
  if(currentEmpIdx === i) {
    currentEmpIdx = -1;
    loadPayrollForm();
    renderPaidBtn();
  } else if(currentEmpIdx > i) {
    currentEmpIdx--;
  }
  renderEmpSelect(); renderEmpList(); cancelEmpForm();
  showToast(jp?'削除しました':'삭제되었습니다');
}

// ══ 재직 복귀 ══
function reinstateEmp(idx) {
  const jp = LANG === 'JP';
  const msg = jp
    ? '在職に戻しますか？退職日と削除済みIDの記録が取り消されます。'
    : '재직으로 복귀하시겠습니까? 퇴사일과 삭제 ID 기록이 취소됩니다.';
  if(!confirm(msg)) return;

  const emp = employees[idx];
  const no = String(emp.no).padStart(4, '0');

  // 퇴사일 제거
  employees[idx] = { ...emp, leave: '' };

  // localStorage deletedEmpIds에서 제거
  deletedEmpIds = deletedEmpIds.filter(id => id !== no);
  gasDeletedEmpIds = gasDeletedEmpIds.filter(id => id !== no);
  localStorage.setItem(LS.deletedEmpIds, JSON.stringify(deletedEmpIds));

  // localStorage 사원 정보 저장
  localStorage.setItem(LS.emp, JSON.stringify(employees));

  // GAS 동기화
  if(gasUrl) {
    fetch(gasUrl,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({type:'employees',employees,...(typeof gasWriteAuth==='function'?gasWriteAuth():{})}),mode:'no-cors'}).catch(()=>{});
    if(typeof gasRemoveDeletedEmpId === 'function') gasRemoveDeletedEmpId(no);
  }
  gasAppendLog('재직복귀', `${emp.name} (${no})`, '성공', '');

  editingEmpIdx = -1;
  empFormDirty = false;
  const body = document.getElementById('empFormBody');
  if(body) body.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3);"><div style="font-size:36px;margin-bottom:10px;">👈</div><div>${jp?'左のリストから選択、または「新規」ボタンで登録してください。':'좌측 목록에서 선택하거나 「사원 추가」 버튼으로 등록해 주세요.'}</div></div>`;
  const formTitle = document.getElementById('empFormTitle');
  if(formTitle) formTitle.textContent = jp ? '従業員を選択してください' : '사원을 선택해 주세요';
  const btnsEl = document.getElementById('empFormBtns');
  if(btnsEl) btnsEl.innerHTML = '';

  renderEmpSelect();
  renderEmpList();
  showToast(jp ? '在職に戻しました ✓' : '재직으로 복귀했습니다 ✓', 's');
}


