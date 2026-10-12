# WisePay (給与Pro) — Claude 작업 규칙

일본 급여명세·직원 관리 웹앱 (한/일 UI). 빌드 없는 HTML/CSS/JS + 구글 스프레드시트(GAS) 연동. 브랜치는 main 하나. 현재 버전은 README.md 맨 위.

## 이 파일들의 목적
Claude Code는 대화 내용을 자기 PC에만 저장한다. 그래서 CLAUDE.md(고정 정보)와 WORKLOG.md(작업 기록)를 git으로 공유해, 집↔회사 어느 PC에서든 같은 맥락으로 이어서 작업한다.
- 푸시와 풀은 사용자가 직접 한다 (빠뜨리면 사용자 책임). Claude는 푸시 여부를 걱정하지 않아도 된다
- Claude의 몫: 작업이 끝나면 (마무리라는 말이 없어도) WORKLOG.md를 최신으로 고쳐 둔다. 사용자가 푸시하기 전에 파일에 반영돼 있어야 다른 PC로 전달된다

## 시작할 때
1. 사용자가 먼저 `git pull`을 해 둔 상태로 시작한다 (집↔회사 PC 동기화는 사용자 몫)
2. 이 파일과 WORKLOG.md를 읽는다

## 구조
- `index.html`(PC) / `mobile.html`(모바일) / `css/styles.css`
- `js/` : state(전역 상태), utils, i18n(한/일), payroll(급여 계산), tax-tables, rates, employees, history(지급 이력·임금대장), vacation(유급휴가), roudou(労働保険 年度更新), santei(算定基礎届), auth·usermgmt·change-password(로그인), gas(스프레드시트 연동), backup, notifications, payment-statement, app(초기화·화면 전환)
- `WisePay_GAS.gs` : 스프레드시트 쪽 서버 코드
- `md_files/WisePay_GAS_Sheets구조_20260603.md` : 시트·컬럼 설명
- `수정히스토리.md` : 전체 수정 이력 (길어서 필요할 때만 열 것)

## 실행·적용
- 로컬 실행: 폴더에서 `npx --yes serve .` 또는 `python -m http.server 8080` → http://localhost:8080 (index.html 더블클릭은 안 됨)
- js/css/html 수정: 푸시 후 브라우저 Ctrl+Shift+R. GAS 재배포는 필요 없음
- `WisePay_GAS.gs` 수정: 스프레드시트 → 확장 프로그램 → Apps Script에 전체 붙여넣기·저장 → 배포 관리 → 기존 배포 편집 → 새 버전. **새 배포 만들기 금지** (주소가 바뀜)
- 공개 주소: https://wwpay.github.io/wisepay/ (비밀번호 재설정 메일 링크도 이 주소)

## 지킬 규칙
- 사용자에게는 한국어로 보고. UI 문구(일본어)·코드 주석은 그대로 둔다
- 날짜·시간은 JST. GAS에서는 `Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss")`
- 버전(SemVer): 버그 수정 PATCH / 기능 추가 MINOR / 대규모 변경 MAJOR. 올릴 때 README 맨 위 버전 + 수정히스토리.md의 `## vX.Y.Z`를 같이 고친다
- 수정이 끝나면 `### 요구사항` / `### 수정 내용` 두 항목으로 보고
- "마무리하자", "오늘은 여기까지" 등 종료 표현이 나오면 확인 없이 한 번에: ① WORKLOG.md 갱신(미완료 포함) ② 수정히스토리.md 상단에 이번 변경 추가 ③ 변경 파일을 모두 저장한다 (커밋·푸시는 사용자가 한다). 수정히스토리.md는 이때만 건드린다

## 되돌리면 안 되는 합의
- 労働保険 年度更新(`js/roudou.js`): 労災·雇用 기초액이 같으면 합산요율을 **한 번만** 곱한다 (따로 계산 후 합치기 금지). 검증값: 記入例4 78,083千円 → 確定1,366,452 / 概算1,288,369 / 一般拠出金1,561
- 유급휴가(`js/vacation.js`): 오래된 발생분부터 차감(FIFO), 소멸은 발생연도+2년 1/1. 검증값(기준일 2026-06-18, 1/1잔여·올해사용·남은연차·소멸예정): 0002 → 19.0/7.0/12.0/0.0, 0019 → 18.0/8.0/10.0/0.0
- 算定基礎届·労働保険 화면은 wiseadmin만 볼 수 있음 (wisejp 포함 다른 계정은 비노출). 労働保険에서 제외할 役員 사번은 config 키 `roudou_exclude_nos`
- 급여는 말일 마감, 익월 10일 지급 (휴일이면 앞당김)
- 서버 GET 요청은 `gasRequest()`(JSONP)로. fetch는 CORS에 막힘
- 공휴일 데이터는 GAS 시트에 2035년까지 들어 있음. 상여 데이터는 없음 (労働保険 賃金集計表 상여 3행은 수동 입력)
