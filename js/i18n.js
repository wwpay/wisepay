// 수정: 2026-06-23 09:32 — 연말정산 정산액 tip-nencho 툴팁 추가, t-nencho-hint 제거
'use strict';
function setTxt(id, jp, kr) {
  const el = document.getElementById(id);
  if (el) el.textContent = LANG === 'JP' ? jp : kr;
}
function setHtml(id, jp, kr) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = LANG === 'JP' ? jp : kr;
}

function toggleLang() {
  LANG = LANG === 'JP' ? 'KR' : 'JP';
  localStorage.setItem(LS.lang, LANG);
  applyLang();

  rerenderAll();

  // 사원 폼이 열려있으면 언어 반영하여 재렌더링 (f-no 입력란 존재 여부로 판단)
  if (document.getElementById('f-no')) {
    const jp = LANG === 'JP';
    const emp = editingEmpIdx >= 0 ? employees[editingEmpIdx] : null;
    const title = document.getElementById('empFormTitle');
    const btns  = document.getElementById('empFormBtns');
    if (title) title.textContent = editingEmpIdx >= 0
      ? emp.name
      : (jp ? '新規従業員登録' : '신규 사원 등록');
    if (btns) {
      if (editingEmpIdx >= 0 && !isResigned(emp)) {
        // 재직 사원 편집: renderActiveEmpBtns에 위임 (hasPay 체크 + 구조 포함)
        renderActiveEmpBtns(editingEmpIdx);
      } else if (editingEmpIdx >= 0 && isResigned(emp)) {
        // 퇴사자 열람: 재직 복귀 + 취소
        btns.style.display='flex'; btns.style.flexDirection=''; btns.style.alignItems=''; btns.style.gap='6px';
        btns.innerHTML = `<button class="btn btn-success btn-sm" onclick="reinstateEmp(${editingEmpIdx})">${jp?'在職に戻す':'재직 복귀'}</button><button class="btn btn-sm" onclick="cancelEmpForm()">${jp?'キャンセル':'취소'}</button>`;
      } else {
        // 신규 등록: 저장 + 취소
        btns.style.display='flex'; btns.style.flexDirection=''; btns.style.alignItems=''; btns.style.gap='6px';
        btns.innerHTML = `<button class="btn btn-success btn-sm" onclick="saveEmployee()">${jp?'保存':'저장'}</button><button class="btn btn-sm" onclick="cancelEmpForm()">${jp?'キャンセル':'취소'}</button>`;
      }
    }
    empFormDirty = false;
    renderEmpFormFields(emp);
  }

  showToast(
    LANG === 'JP' ? '日本語に切り替えました' : '한국어로 전환했습니다',
    's'
  );
}

function applyLang() {
  document.documentElement.lang = LANG === 'JP' ? 'ja' : 'ko';

  setTxt('t-appname', '給与Pro by Wisewires', '급여Pro by Wisewires');
  setTxt('t-nav-main', 'メイン', '메인');
  setTxt('t-nav-payroll', '給与明細', '급여 명세');
  setTxt('t-nav-history', '支給履歴', '지급 이력');
  setTxt('t-nav-annual', '賃金台帳', '임금 대장');
  setTxt('t-annual-title', '賃金台帳', '임금 대장');
  setTxt('t-nav-payment-statement', '源泉納付書', '원천세 납부서');
  setTxt('t-nav-setting', '設定', '설정');
  setTxt('t-nav-emp', '従業員管理', '사원 관리');
  setTxt('t-emp-add', '+ 新規', '+ 사원 추가');
  setTxt('t-nav-rates', '保険料率設定', '보험료율 설정');
  setTxt('t-nav-gas', 'データ管理', '데이터 관리');
  setTxt('t-nav-vacation', '有給休暇', '유급 휴가');

  // vacation page
  setTxt('t-vac-sel-label',     '従業員選択', '사원 선택');
  setTxt('t-vac-sel-all',      '全選択',     '전체 선택');
  setTxt('t-vac-sel-none',     '全解除',     '전체 해제');
  setTxt('vacInclNotAppliedBtn','非対象含む', '미대상 포함');
  setTxt('t-vac-confirm',      '確認',       '확인');
  setTxt('t-vac-back', '一覧へ戻る', '목록으로 돌아가기');
  setTxt('t-vac-modal-title', '有給取得入力', '유급휴가 사용 입력');
  setTxt('t-vac-date-label', '取得日', '사용 날짜');
  setTxt('t-vac-days-label', '取得日数', '사용 일수');
  setTxt('t-vac-r1', '1日', '1일');
  setTxt('t-vac-r05', '半日', '반차');
  setTxt('t-vac-reason-label', '事由（任意）', '사유 (선택)');
  setTxt('t-vac-modal-cancel', 'キャンセル', '취소');
  setTxt('t-vac-modal-save', '登録する', '등록하기');
  setTxt('t-vac-hide-not-applied', '対象外を非表示', '미적용 사원 숨김');

  setTxt('t-langbtn', '한국어로 전환', '日本語に切替');
  setTxt('t-ai-btn', '協会けんぽ 最新料率を取得', '協会けんぽ 최신 요율 가져오기');
  setTxt('t-discard-btn', '入力取消', '입력 취소');
  setTxt('t-save-btn', '保存', '저장');
  setTxt('t-today-btn', '今月', '이번 달');
  setTxt('t-print-btn', '印刷', '인쇄');
  setTxt('t-pdf-btn', 'PDF保存', 'PDF 저장');

  setTxt('t-net-label', '差引総支給額（手取り）', '차인지급액');
  setTxt('t-card-shikyuu', '支給', '지급');
  setTxt('t-card-kojo', '控除', '공제');

  setTxt('t-r-base', '基本給', '기본급');
  setTxt('t-r-ot', '残業手当', '잔업수당');
  setTxt('t-r-commute', '非課税通勤手当', '비과세 교통비');
  setTxt('t-r-kinmu', '勤務手当', '근무수당');
  setTxt('t-r-shokumu', '職務手当', '직무수당');
  setTxt('t-r-field', '現場手当', '현장수당');
  setHtml('t-r-hyo', '標準報酬月額<br>（手動指定・任意）', '표준보수월액<br>（수동지정・선택）');
  setTxt('t-r-total', '計', '합계');

  setTxt('t-k-kenko', '健康保険料', '건강보험료');
  setTxt('t-k-kaigo', '介護保険料', '개호보험료');
  setHtml('tip-kaigo',
    '40歳以上が対象。従業員設定で\'auto\'に設定すると生年月日基準で自動適用',
    '40세 이상 해당. 사원 설정에서 \'auto\'로 설정 시 생년월일 기준 자동 적용'
  );
  setTxt('t-k-kodomo', '子ども・子育て支援金', '자녀・육아지원금');
  setHtml('tip-kodomo',
    '2026年4月から適用。全国一律0.23%（労働者負担分）',
    '2026년 4월부터 적용. 전국 일률 0.23% (근로자 부담분)'
  );
  setTxt('t-k-nenkin', '厚生年金保険料', '후생연금보험료');
  setTxt('t-k-koyo', '雇用保険料', '고용보험료');
  setHtml('tip-koyo',
    '役員は通常対象外（支店長含む）。従業員設定で個別設定可能',
    '임원은 보통 비해당 (지점장 포함). 사원 설정에서 개별 설정 가능'
  );
  setTxt('t-k-shotoku', '所得税', '소득세');
  setTxt('t-k-jumin', '住民税', '주민세');
  setHtml('tip-jumin',
    '市区町村から送付される特別徴収税額通知書の月別金額を入力してください。<br>※ 月別金額の基準は「支給日」です。<br><br>例）6月分住民税 → 6月10日支給（5月分給与）から控除<br><br>※ 6月分は年間合計の端数調整により他月と金額が異なる場合があります。',
    '구청·시청에서 보내는 특별징수 통지서의 월별 금액을 입력하세요.<br>※ 월별 금액 기준은 \'지급일\'입니다.<br><br>예) 6월분 주민세 → 6월 10일 지급(5월분 급여)에서 공제<br><br>※ 6월분은 연간 합계의 단수 조정으로 다른 달과 금액이 다를 수 있습니다.'
  );
  setTxt('t-k-nencho', '年末調整精算額', '연말정산 정산액');
  setHtml('tip-nencho',
    '還付がある場合はマイナス(-)で入力してください',
    '환급이 있는 경우 마이너스(-)로 입력하세요'
  );
  setTxt('t-k-total', '計', '합계');

  setTxt('t-gas-title', '🔗 Google スプレッドシート連携設定', '🔗 Google 스프레드시트 연동 설정');
  setTxt('t-gas-cancel', 'キャンセル', '취소');

  setTxt('t-gas-page-title', 'Google連携設定', 'Google 연동 설정');
  setTxt('t-gas-desc', 'Google Apps Script を使って給与データをスプレッドシートに自動保存・同期できます。', 'Google Apps Script를 사용해 급여 데이터를 스프레드시트에 자동 저장·동기화할 수 있습니다.');
  setTxt('t-gas-step1-title', 'Google スプレッドシートを新規作成', 'Google 스프레드시트 새로 만들기');
  setTxt('t-gas-step1-desc', '「WisePay」という名前でスプレッドシートを作成してください。', '「WisePay」라는 이름으로 스프레드시트를 만들어 주세요.');
  setTxt('t-gas-step3-title', 'ウェブアプリとしてデプロイ', '웹 앱으로 배포');
  setHtml('t-gas-step3-desc',
    '「デプロイ」→「新しいデプロイ」→ 種類:「ウェブアプリ」<br>アクセス権限:「全員」→ デプロイ → <strong>URLをコピー</strong><br><span style="color:var(--orange);font-size:11px;">✅ exec = 「デプロイ」URL（アクセス:全員 必須）&nbsp;&nbsp;🧪 dev = 「テストデプロイ」URL（オーナーのみ・権限エラーが出やすい）</span>',
    '「배포」→「새 배포」→ 유형:「웹 앱」<br>액세스 권한:「전체」→ 배포 → <strong>URL 복사</strong><br><span style="color:var(--orange);font-size:11px;">✅ exec = 「배포」URL (액세스:전체 필수)&nbsp;&nbsp;🧪 dev = 「테스트 배포」URL (소유자만·권한 오류 잦음)</span>'
  );
  setTxt('t-gas-step4-title', 'WebアプリのURLを入力', '웹 앱 URL 입력');
  setTxt('t-backup-title', 'データバックアップ/復元', '데이터 백업/복원');
  setTxt('t-backup-emp-label', '従業員データ', '사원 데이터');
  setTxt('t-backup-emp-btn',   '👤 従業員データバックアップ', '👤 사원 데이터 백업');
  setTxt('t-restore-emp-btn',  '👤 従業員データ復元', '👤 사원 데이터 복원');
  setTxt('t-backup-pay-label', '給与データ', '급여 데이터');
  setTxt('t-backup-pay-btn',   '💴 給与データバックアップ', '💴 급여 데이터 백업');
  setTxt('t-restore-pay-btn',  '💴 給与データ復元', '💴 급여 데이터 복원');
  setTxt('t-backup-excel-btn', '📊 Excelバックアップ（全体）', '📊 Excel 백업 (전체)');
  setTxt('t-backup-file-desc', 'ファイル名: 従業員_backup_YYYYMMDD.json / 給与_backup_YYYYMMDD.json', '파일명: 사원_backup_YYYYMMDD.json / 급여_backup_YYYYMMDD.json');
  setTxt('t-freee-section-title', '給与データ(CSV) → Googleドライブ', '급여 데이터(CSV) → 구글 드라이브');
  setTxt('t-freee-file-btn',   'ファイル選択', '파일 선택');
  setTxt('freeeFileLabel',     'ファイル未選択', '선택된 파일 없음');
  setTxt('t-freee-upload-btn', 'アップロード', '업로드');
  setTxt('t-backup-auto-title', '📅 Googleドライブ 自動バックアップ', '📅 구글 드라이브 자동 백업');
  setTxt('t-backup-auto-desc',
    '毎週月曜日の午前9時に別のスプレッドシートへ自動バックアップされます（最大26個保持）。',
    '매주 월요일 오전 9시에 별도 스프레드시트로 자동 백업됩니다 (최대 26개 유지).'
  );
  setTxt('t-backup-folder-label', '💾 バックアップ保存フォルダ', '💾 백업 저장 폴더');
  renderBackupFolderStatus();
  try { _updatePayrollStatus(_payrollDataStatus); } catch(e) {}
  try { renderPaidBtn(); } catch(e) {}

  setTxt('t-reset-zone',  '⚠ 危険エリア',        '⚠ 위험 구역');
  setTxt('t-reset-title', 'ローカルデータ初期化', '로컬 데이터 초기화');
  setTxt('t-reset-btn',   '初期化',               '초기화');
  setHtml('t-reset-desc',
    '<div style="color:#6a9955;margin-bottom:4px;">&lt;!--</div><div style="padding-left:12px;"><div><span style="color:#6a9955;margin-right:10px;user-select:none;">1</span><span style="color:#d4d4d4;">ブラウザ(localStorage)に保存されたすべてのキャッシュデータを削除します。</span></div><div><span style="color:#6a9955;margin-right:10px;user-select:none;">2</span><span style="color:#d4d4d4;">削除後に再読み込みすると、Google Sheetsからデータを再取得します。</span></div><div><span style="color:#6a9955;margin-right:10px;user-select:none;">3</span><span style="color:#d4d4d4;">アプリの動作がおかしい場合やデータが壊れた場合のリセット用途でご使用ください。</span></div><div><span style="color:#6a9955;margin-right:10px;user-select:none;">4</span><span style="color:#4ec9b0;font-weight:600;">✅ Googleスプレッドシートのデータは削除されません。</span></div></div><div style="color:#6a9955;margin-top:6px;">--&gt;</div>',
    '<div style="color:#6a9955;margin-bottom:4px;">&lt;!--</div><div style="padding-left:12px;"><div><span style="color:#6a9955;margin-right:10px;user-select:none;">1</span><span style="color:#d4d4d4;">브라우저(localStorage)에 저장된 모든 캐시 데이터를 삭제합니다.</span></div><div><span style="color:#6a9955;margin-right:10px;user-select:none;">2</span><span style="color:#d4d4d4;">삭제 후 새로고침하면 Google Sheets에서 데이터를 다시 불러옵니다.</span></div><div><span style="color:#6a9955;margin-right:10px;user-select:none;">3</span><span style="color:#d4d4d4;">앱이 비정상 동작하거나 데이터가 꼬였을 때 리셋 용도로 사용하세요.</span></div><div><span style="color:#6a9955;margin-right:10px;user-select:none;">4</span><span style="color:#4ec9b0;font-weight:600;">✅ Google Sheets의 데이터는 삭제되지 않습니다.</span></div></div><div style="color:#6a9955;margin-top:6px;">--&gt;</div>'
  );

  setTxt('t-rates-page-title', '保険料率設定', '보험료율 설정');
  setTxt('t-rates-desc', '協会けんぽ東京都・2026年度の料率。改定時に更新してください。', '協会けんぽ 도쿄도・2026년도 요율. 개정 시 업데이트해 주세요.');
  setTxt('t-rates-current', '現在の適用料率', '현재 적용 요율');
  setTxt('t-rates-ai', '協会けんぽから最新料率を取得', '協会けんぽ 최신 요율 가져오기');
  setTxt('t-rates-save', '料率を保存', '요율 저장');

  setTxt('t-annual-sel-all',    '全選択',      '전체 선택');
  setTxt('t-annual-sel-clear',  '全解除',      '전체 해제');
  setTxt('annualInclLeftBtn',   '退職者含む',  '퇴사자 포함');
  setTxt('t-annual-confirm',    '確認',        '확인');

  // 지급이력 테이블 헤더는 renderHistory()가 LANG을 직접 참조해 동적으로 생성
  try { if (document.getElementById('page-history')?.classList.contains('active')) renderHistory(); } catch(e) {}

  setTxt('empFormTitle', '従業員を選択してください', '사원을 선택해 주세요');
  setTxt('t-emp-select-hint', '左のリストから従業員を選択するか、「新規」ボタンで登録してください。', '좌측 목록에서 사원을 선택하거나, 「사원 추가」 버튼으로 등록해 주세요。');

  setTxt('t-payroll-ph-main', '従業員を選択してください', '사원을 선택해 주세요');
  setTxt('t-payroll-ph-sub', '上のドロップダウンから従業員を選択すると給与明細が表示されます。', '위 드롭다운에서 사원을 선택하면 급여 명세가 표시됩니다.');
  setTxt('t-annual-ph-main', '従業員を選択してください', '사원을 선택해 주세요');
  setTxt('t-annual-ph-sub', '上の「従業員選択」ボタンから選択すると賃金台帳が表示されます。', '위 「사원 선택」 버튼으로 선택하면 임금 대장이 표시됩니다.');
  setTxt('t-hist-ph-main', '従業員を選択してください', '사원을 선택해 주세요');
  setTxt('t-hist-ph-sub', '上のドロップダウンから従業員または全員を選択すると支給履歴が表示されます。', '위 드롭다운에서 사원 또는 전체를 선택하면 지급 이력이 표시됩니다.');
  setTxt('t-rates-title', '適用保険料率（2026年度・東京都）', '적용 보험료율（2026년도・도쿄도）');
  setHtml('t-rt-kenko', '健康保険料率<br>（東京都）', '건강보험료율<br>（도쿄도）');
  setHtml('t-rt-kaigo', '介護保険料率<br>（全国一律）', '개호보험료율<br>（전국 일률）');
  setHtml('t-rt-kodomo', '子育て支援金率<br>（全国一律）', '자녀지원금율<br>（전국 일률）');
  setHtml('t-rt-nenkin', '厚生年金<br>保険料率', '후생연금<br>보험료율');
  setHtml('t-rt-koyo', '雇用保険料率<br>（労働者負担）', '고용보험료율<br>（근로자 부담）');
  setTxt('t-calc-title', '給与計算情報', '급여 계산 정보');
  setTxt('t-ci-kenko', '健康保険', '건강보험');
  setTxt('t-ci-nenkin', '厚生年金', '후생연금');
  setTxt('t-ci-koyo', '雇用保険', '고용보험');
  setTxt('t-ci-shotoku', '所得税', '소득세');
  setTxt('t-banner-msg', '【保険料率更新】2026年度 協会けんぽ（東京都）の保険料率が改定されました。', '【보험료율 업데이트】2026년도 協会けんぽ（東京都）의 보험료율이 개정되었습니다。');

  setTxt('t-mr-title', '✨ 最新保険料率（2026年度）', '✨ 최신 보험료율（2026년도）');
  setTxt('t-mr-desc', '2026年度 東京都・協会けんぽの確定料率です。', '2026년도 도쿄도・協会けんぽ의 확정 요율입니다。');
  setHtml('t-mr-src', '※ 出典：協会けんぽ東京支部（2026年2月16日発表）<br>※ 健康保険料率は毎年3月、雇用保険料率は毎年4月改定', '※ 출처：協会けんぽ東京支部（2026년 2월 16일 발표）<br>※ 건강보험료율은 매년 3월, 고용보험료율은 매년 4월 개정');
  setTxt('t-mr-cancel', 'キャンセル', '취소');
  setTxt('t-mr-apply', 'この料率を適用する', '이 요율을 적용');

  // payment-statement
  setTxt('t-ps-print',            '印刷',                          '인쇄');
  setTxt('t-ps-notice',
    '※ 本集計はWisePay給与データ基準であり、税理士報酬及び年末調整の反映方式により、freee・税務署申告額と差異が生じる場合があります。',
    '※ 본 집계는 WisePay 급여 데이터 기준이며, 税理士報酬 및 연말조정 반영 방식에 따라 freee/세무서 신고액과 차이가 있을 수 있습니다.'
  );
  setTxt('t-ps-col-kubun',        '区分',                          '구분');
  setTxt('t-ps-col-date',         '支払年月日',                    '지급년월일');
  setTxt('t-ps-col-ninzuu',       '人員',                          '인원');
  setTxt('t-ps-col-shiharai',     '支払額',                        '지급액');
  setTxt('t-ps-col-zei',          '税額',                          '세액');
  setTxt('t-ps-kyuyo',            '俸給・給与等',                  '급여등');
  setTxt('t-ps-shoyo',            '賞与（役員賞与を除く）',        '상여(임원상여 제외)');
  setTxt('t-ps-hiyatoi',          '日雇い労働者の賃金',            '일용노무자 임금');
  setTxt('t-ps-taisyoku',         '退職手当等',                    '퇴직금등');
  setTxt('t-ps-zeiri',            '税理士等の報酬',                '세무사등 보수');
  setTxt('t-ps-yakuin',           '役員賞与',                      '임원상여');
  setTxt('t-ps-nencho-fusoku',    '年末調整による不足税額',        '연말정산 부족세액');
  setTxt('t-ps-nencho-choka',     '年末調整による超過税額',        '연말정산 초과세액');
  setTxt('t-ps-honzei',           '本税',                          '본세');
  setTxt('t-ps-entai',            '延滞税',                        '연체세');
  setTxt('t-ps-goukei',           '合計額',                        '합계액');
  setTxt('t-ps-jiku-title',       '納期等の区分',                  '납기등의 구분');
  setTxt('t-ps-jiku-from-label',  '自',                            '부터');
  setTxt('t-ps-jiku-to-label',    '至',                            '까지');
  setTxt('ps-half1-label',        '1月〜6月',                      '1월~6월');
  setTxt('ps-half2-label',        '7月〜12月',                     '7월~12월');
  setTxt('t-ps-doujou',           '同上の支払確定年月日',          '상기 지급확정 연월일');
  setTxt('t-ps-zeiri-note',
    '税理士や弁護士等、専門家への報酬を支払った場合は源泉徴収の対象であり、別途「税理士等の報酬」欄への記載と、合計欄等への加算が必要になります。',
    '세무사·변호사 등 전문가에게 보수를 지급한 경우 원천징수 대상이 됩니다. 별도로 「税理士等の報酬」 란에 기재하고 합계란에 가산이 필요합니다.'
  );
  setTxt('t-ps-notice',
    '※ 本集計はWisePay給与データ基準です。年末調整・税理士報酬の反映方式によりfreee/税務署申告額と差異が生じる場合があります。',
    '※ 본 집계는 WisePay 급여 데이터 기준이며, 연말조정 반영 방식에 따라 freee/세무서 신고액과 차이가 있을 수 있습니다.'
  );
  try { if (typeof buildPsYearSel === 'function') buildPsYearSel(); } catch(e) {}

  updateGasStatus();

  // 언어 변경 시 현재 활성 페이지 상단 타이틀 즉시 갱신
  const _ap = document.querySelector('.page.active');
  if (_ap) {
    const _id = _ap.id.replace('page-', '');
    const _titles = {payroll:{JP:'給与明細',KR:'급여 명세'},history:{JP:'支給履歴',KR:'지급 이력'},employees:{JP:'従業員管理',KR:'사원 관리'},rates:{JP:'保険料率設定',KR:'보험료율 설정'},annual:{JP:'賃金台帳',KR:'임금 대장'},gas:{JP:'データ管理',KR:'데이터 관리'},notifications:{JP:'通知',KR:'알림'}};
    const _t = _titles[_id];
    const _el = document.getElementById('topbar-title');
    if (_t && _el) _el.textContent = _t[LANG];
  }
}

