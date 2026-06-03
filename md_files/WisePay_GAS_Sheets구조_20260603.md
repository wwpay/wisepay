# WisePay GAS / Google Sheets 구조 상세

> GAS 파일: WisePay_GAS.gs  
> 통신 방식: doPost (JSON body의 type 필드) / doGet (URL ?action= 파라미터)

---

## Google Sheets 시트 목록

| 시트명 | 상수명 | 역할 |
|---|---|---|
| 사원정보 | SHEET_EMP | 사원 마스터 데이터 |
| 급여데이터 | SHEET_PAY | 월별 급여 입력값 |
| 보험료율데이터 | SHEET_RATE | rateHistory 이력 |
| WisePay로그 | SHEET_LOG | 조작 로그 |
| users | SHEET_USERS | 로그인 계정 정보 |
| deleted_emp_ids | SHEET_DELETED | 퇴사/삭제 사원 ID |
| 지급완료이력 | SHEET_PAID | 송금완료 기록 |
| 급여스냅샷 | SHEET_SNAP | 송금완료 시 회계 증빙 |
| 백업이력 | — | 자동 백업 기록 |

---

## 시트별 컬럼 상세

### 사원정보 (SHEET_EMP)
| 컬럼 | 내용 |
|---|---|
| no | 사원번호 (Primary Key, 4자리, 재사용 불가) |
| name | 성명 |
| kana | 이름 가나 (フリガナ) |
| join | 입사일 (YYYY-MM-DD) |
| leave | 퇴사일 (YYYY-MM-DD, 없으면 공백) |
| birth | 생년월일 (YYYY-MM-DD) |
| hyo | 표준보수월액(標準報酬月額) |
| families | 부양가족 JSON 배열 |
| deleted | 소프트 삭제 플래그 (true/false) |

### 급여데이터 (SHEET_PAY)
| 컬럼 | 필드ID | 내용 |
|---|---|---|
| emp_no | — | 사원번호 |
| year | — | 급여 귀속 연도 |
| month | — | 급여 귀속 월 |
| r-base | 기본급 | 月給 |
| r-ot | 잔업수당 | 残業代 |
| r-kintai | 근태수당 | 勤怠調整 |
| r-commute | 비과세 교통비 | 非課税通勤費 |
| r-commutetax | 과세 교통비 | 課税通勤費 |
| r-kinmu | 근무수당 | 勤務手当 |
| r-shokumu | 직무수당 | 職務手当 |
| r-field | 현장수당 | 現場手当 |
| r-hyo | 표준보수월액 오버라이드 | 入力値 (없으면 사원정보 기준) |
| k-jumin | 주민세 | 住民税 |
| k-nencho | 연말정산 정산액 | 年末調整 |
| _net | 차인지급액 | 실수령액 (계산값) |

### 보험료율데이터 (SHEET_RATE)
| 컬럼 | 내용 |
|---|---|
| from | 적용 시작 연월 (YYYY-MM) |
| kenko | 건강보험료율 (협회けんぽ 도쿄도, 근로자 부담분) |
| kaigo | 개호보험료율 (40세 이상 적용) |
| kodomo | 자녀·육아지원금 요율 (2026년 4월~) |
| nenkin | 후생연금보험료율 |
| koyo | 고용보험료율 (근로자 부담분) |

### 지급완료이력 (SHEET_PAID)
| 컬럼 | 내용 |
|---|---|
| year | 급여 귀속 연도 |
| month | 급여 귀속 월 |
| paidAt | 송금완료 처리 일시 (JST ISO string) |
| confirmedBy | 처리자 ID |

### 급여스냅샷 (SHEET_SNAP)
송금완료 시 해당 월 전 사원 급여 데이터 스냅샷 저장  
(회계 증빙용, 이후 수정 불가)

| 컬럼 | 내용 |
|---|---|
| snap_at | 스냅샷 생성 일시 |
| year | 급여 귀속 연도 |
| month | 급여 귀속 월 |
| emp_no | 사원번호 |
| (급여데이터 전 필드) | 당시 급여 데이터 전체 |

### WisePay로그 (SHEET_LOG)
| 컬럼 | 내용 |
|---|---|
| 일시 | JST 기준 작업 일시 |
| 작업종류 | save / markPaid / deleteEmp 등 |
| 대상 | 사원번호 또는 연월 |
| 결과 | success / error |
| 비고 | 상세 메모 |

### users (SHEET_USERS)
| 컬럼 | 내용 |
|---|---|
| id | 로그인 ID |
| hash | SHA-256 해시 비밀번호 |
| role | admin / viewer |
| sessionType | persistent / session |

### deleted_emp_ids (SHEET_DELETED)
| 컬럼 | 내용 |
|---|---|
| emp_no | 삭제/퇴사 사원번호 |
| leave_date | 퇴사일 |

### 백업이력
| 컬럼 | 내용 |
|---|---|
| timestamp | 백업 생성 일시 (yyyyMMdd) |
| filename | 백업 스프레드시트명 |
| fileId | Google Drive 파일 ID |

---

## doPost 액션 목록

| type 값 | 기능 |
|---|---|
| saveAll | 전체 데이터 저장 (사원+급여+요율) |
| savePayrolls | 급여데이터만 저장 |
| saveEmployees | 사원정보만 저장 |
| markPaid | 송금완료 처리 + 스냅샷 저장 |
| addDeletedEmpId | 퇴사 사원 ID 추가 |
| removeDeletedEmpId | 삭제 사원 ID 제거 |
| appendLog | 조작 로그 추가 |
| updateUsers | 사용자 계정 수정 |
| sendReminderEmail | 송금 독촉 이메일 발송 |
| sendDataInputReminder | 급여 미입력 알림 이메일 발송 |
| sendPayConfirmReminder | 송금완료 버튼 독촉 이메일 발송 |

## doGet 액션 목록

| action 값 | 기능 |
|---|---|
| getAll | 전체 데이터 조회 (사원+급여+요율+지급완료이력+삭제ID) |
| getUsers | 사용자 목록 조회 |
| scrapeRates | 협회けんぽ 최신 요율 스크래핑 |
| testConnection | 연결 테스트 |

---

## GAS 주요 함수 목록

| 함수 | 역할 |
|---|---|
| doPost(e) | POST 요청 라우터 |
| doGet(e) | GET 요청 라우터 |
| getAllData(ss) | 전체 데이터 조회 |
| getPaidYMs(ss) | 지급완료 연월 목록 조회 |
| getDeletedEmpIds(ss) | 삭제 사원 ID 목록 조회 |
| saveSheet(name, data) | 시트에 데이터 저장 |
| getSheet(name) | 시트 취득 (없으면 생성) |
| sheetToObjects(sheet) | 시트 → JS 객체 배열 변환 |
| gasAppendLog(...) | 로그 기록 |
| backupWeekly() | 주간 자동 백업 (트리거) |
| sendPayrollReminderEmail | 송금 독촉 이메일 |
| sendDataInputReminderEmail | 급여 미입력 이메일 |
| sendPayConfirmReminderEmail | 송금완료 버튼 독촉 이메일 |
| sendConfirmationEmail | 송금완료 확정 통지 이메일 |
| scrapeRates() | 협회けんぽ 요율 스크래핑 |
| importPayrolls(data) | freee CSV 데이터 반영 |

---

## GAS 설정 정보

### 배포 정보
- 실행 대상: 나(lucky4694@gmail.com)
- 액세스 권한: 모든 사용자
- URL 형식: https://script.google.com/macros/s/{ID}/exec

### appsscript.json OAuth 범위
```json
{
  "oauthScopes": [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
  ]
}
```

### 자동 트리거
| 함수 | 실행 주기 |
|---|---|
| backupWeekly | 매주 월요일 오전 9시 (JST) |

### 백업 저장 위치
- 구글 드라이브 폴더: 125mzhl1EVBbHklwN9RiBN4vNnZbSBBsI
- 파일명: WisePay_backup_YYYYMMDD
- 보관: 최대 26개 (6개월 분량)

---

## GAS 수정 후 배포 절차

1. WisePay_GAS.gs 수정 후 커밋&푸시
2. Google Sheets → 확장 프로그램 → Apps Script
3. 전체 선택(Ctrl+A) 후 붙여넣기 → Ctrl+S 저장
4. 배포 → 배포 관리 → 기존 배포 연필 아이콘
5. 버전: **새 버전** 선택 → 배포

> ⚠️ "새 배포"(완전 새로 만들기)를 하면 URL이 바뀜  
> 반드시 기존 배포를 **편집**해야 URL 유지

---

*최종 업데이트: 2026-06-03*
