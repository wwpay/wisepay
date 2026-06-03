# WisePay 웹앱 개발 종합 — 기능별 정리

> 앱 정식명: 「給与Pro by Wisewires」/ 약칭: WisePay（와이즈페이）  
> 배포 URL: https://wwpay.netlify.app  
> GitHub: lucky4694-github/WisePay

---

## 🏗 아키텍처

```
웹앱 (HTML/JS, Netlify 배포)
        ↕
Google Apps Script (GAS)
        ↕
Google Sheets (데이터 저장)
```

**파일 구조:**
```
WisePay/
├── index.html
├── css/styles.css
└── js/
    ├── state.js
    ├── utils.js
    ├── i18n.js         ← 한/일 언어 전환
    ├── tax-tables.js
    ├── payroll.js      ← 급여 계산 로직
    ├── rates.js        ← 보험료 요율
    ├── employees.js    ← 사원 관리
    ├── history.js
    ├── gas.js          ← Google Sheets 연동
    └── app.js
```

---

## 👤 사원 관리

- 사원번호(empNo)를 고유 키로 사용 (index 기반 금지)
- 삭제: 소프트 삭제 방식 (`deleted: true` 플래그)
- 부양가족 관리 포함 (자녀 수 등)
- 사원 선택 드롭다운: 체크박스 형태, 1항목씩 세로 나열

**관련 채팅:** [일본 급여 계산 프로그램 개발](https://claude.ai/chat/6e85f533-c7f1-4d6f-8f63-956c155c9756)

---

## 💴 급여 계산

- 기본급 + 각종 수당 + 공제 항목
- 근태 입력 (출근일수, 잔업시간 등) → 자동 계산
- 사회보험료 공제: 건강보험 + 후생연금 + 고용보험
- 소득세 원천징수 계산
- 다국어 UI: 한국어 기본 + 일본어 전환

**표준보수월액(標準報酬月額):**
- 수동입력 유지 (법적 이유: 협会けんぽ 届出 후 효력 발생)
- 随時改定 해당 가능성 알림 ⚠️ 방식 채택
- 定時決定: 매년 4~6월 평균 기준 9월 갱신

**임금대장 출력:**
- 지급일 기준으로 연도 귀속 결정
- 익월 10일 지급 시: 25년 대장 = 24년 12월분 ~ 25년 11월분

**관련 채팅:** [일본 급여관리 수동 입력 문제](https://claude.ai/chat/2a86f641-0691-4111-b399-f7671425c8f0) / [구글 시트와 웹앱 데이터 불일치](https://claude.ai/chat/4f0871ff-41e7-4099-8590-099cc3c8b816)

---

## ☁️ Google Sheets 연동 (GAS)

- GAS 파일: `WisePay_GAS.gs`
- 배포 방식:
  - 개발 중: Dev URL (코드 수정 즉시 반영, 본인만 접근)
  - 운영 중: exec URL (재배포 필요, 모든 접속자 가능)
- 연동 설정: 앱 내 "Google 연동 설정" 페이지에 exec URL 입력
- 저장: 명시적 저장 버튼 클릭 시에만 Sheets에 write
- 구글 시트 자동 백업: 매주 GAS로 6개월치 복사본 생성 (기획)

**관련 채팅:** [일본 급여 계산 프로그램 개발2](https://claude.ai/chat/b663e349-c74a-492d-842e-d807660b00eb)

---

## 🌐 Netlify 배포

- URL: **https://wwpay.netlify.app**
- GitHub 연동 자동 배포 (main 브랜치 push → 자동 반영)
- 빌드 설정: Build command 없음, Publish directory: `/`
- 데이터: localStorage가 아닌 Google Sheets 사용 (origin 달라도 데이터 유지)

**관련 채팅:** [Netlify 배포 순서](https://claude.ai/chat/3f916c82-6ac5-4787-b407-73b443fe0dbe)

---

## 🔐 인증

- 현재: 단순 비밀번호 방식 (테스트용: `1111`)
- 사용자: 지점장 + 세무사 2명
- GAS URL은 코드에 내장 (접속자가 설정 불필요)
- 로그인 기능: 개발 편의상 일시 제거, 필요 시 재추가 예정

**관련 채팅:** [Netlify 배포 순서](https://claude.ai/chat/3f916c82-6ac5-4787-b407-73b443fe0dbe)

---

## 💾 백업 및 복원

### 백업 파일 종류

| 파일 | 내용 | 용도 |
|---|---|---|
| `사원_backup_YYYYMMDD.json` | employees | WisePay 사원 복원 전용 |
| `급여_backup_YYYYMMDD.json` | payrolls + rateHistory | WisePay 급여 복원 전용 |
| Excel 파일 | 사원/급여 표 형태 | 열람·세무사 공유용 |

### 부분 복원 기능

복원 흐름:
```
JSON 파일 선택
  → 사원 선택 (체크박스, 기본값: 전체)
    → 월 선택 (1~12월, 기본값: 전체)
      → 확인 팝업
        → 복원 실행
```

- 사원 매칭 기준: 사원번호(empNo)
- 확인 팝업: "선택한 N명 × M개월 데이터를 덮어씁니다. 계속하시겠습니까?"
- 사원 복원 시 급여 데이터 불변, 반대도 마찬가지

### CC 프롬프트 (백업 분리 구현용)

```
현재 WisePay의 JSON 백업 기능을 사원 백업과 급여 백업으로 분리해줘.

현재 구조:
백업 버튼 1개 → 하나의 JSON 파일에 employees, payrolls, rateHistory 전부 저장

변경 후 구조:
버튼 2개로 분리

[사원 백업 버튼] → 사원_backup_YYYYMMDD.json 파일 생성
{
  "exportedAt": "...",
  "employees": [...]
}

[급여 백업 버튼] → 급여_backup_YYYYMMDD.json 파일 생성
{
  "exportedAt": "...",
  "payrolls": [...],
  "rateHistory": [...]
}

복원 기능도 동일하게 분리:
- 사원 복원 버튼 → 사원_backup_*.json 파일을 읽어서 employees만 덮어씀
- 급여 복원 버튼 → 급여_backup_*.json 파일을 읽어서 payrolls와 rateHistory만 덮어씀
- 복원 시 상대방 데이터는 절대 건드리지 않음

복원 시 확인 다이얼로그 필수:
⚠️ 사원 데이터를 복원하면 현재 사원 데이터가 백업 시점으로 되돌아갑니다. 계속하시겠습니까?
[취소] [복원]

기존 JSON 백업 버튼(전체 통합)은 삭제해도 됨.
```

**관련 채팅:** [Wisepay 백업 파일 활용 방법](https://claude.ai/chat/4d50a8b3-b19c-4ed1-aee1-7bee85674651) / [오른쪽 아래 에러 해결](https://claude.ai/chat/7c41837e-3299-4253-9086-8fff9faaaf17)

---

## ↩️ Undo 기능 (제거됨)

- 설계 → CC 구현 → 재검토 → **전체 제거 결정**
- 제거 이유: 과도한 복잡성, 유지보수 부담
- 대체: 사원/급여 분리 백업 + 부분 복원 기능

**관련 채팅:** [Wisepay undo 기능 구현 고민](https://claude.ai/chat/c4f39bc6-a4ce-4596-a580-77487f272136)

---

## 🐛 트러블슈팅 기록

| 문제 | 원인 | 해결 |
|---|---|---|
| 배포 후 데이터 없음 | localhost ≠ wwpay.netlify.app (다른 origin, localStorage 별도) | Google 연동 설정에서 exec URL 입력 |
| GAS timeout 에러 | Dev URL 사용 (본인 외 접근 불가) | exec URL로 교체 |
| 자녀 데이터 2명 표시 | 배열 누적(push) 또는 state merge 중복 | 덮어쓰기(=) 방식으로 수정 |
| git pull 충돌 | backup 폴더 untracked files 충돌 | .bak으로 이름 변경 후 pull |
| 드롭다운 항목 가로 나열 | CSS display 미설정 | display: block + align-items: center |

---

## 📌 개발 규칙 (CC 협업)

- CC 프롬프트는 항상 **코드블록 하나**에 담을 것 (복사 아이콘 한 번으로 전체 복사)
- 큰 수정은 단계별로 나눠서 시킬 것 (한 번에 전체 수정 시 어디서 깨졌는지 찾기 어려움)
- 사원 식별자는 항상 empNo 사용 (index 기반 금지)

---

*최종 업데이트: 2026-05-27*
