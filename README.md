# WisePay (給与Pro)

**버전: v1.6.1** | 일본 급여 명세·직원 관리 웹앱 (한국어/일본어 UI)

## 폴더 구조

```
WisePay/
├── index.html      # 화면 뼈대
├── css/styles.css  # 스타일
└── js/
    ├── state.js       # 전역 상태·localStorage 키
    ├── utils.js       # 모달, 토스트, 숫자 포맷
    ├── i18n.js        # 한/일 언어 전환
    ├── tax-tables.js  # 소득세표·표준보수월액
    ├── payroll.js     # 급여 계산·저장
    ├── rates.js       # 보험료율
    ├── employees.js   # 직원 관리
    ├── history.js     # 지급 이력·연간 일람
    ├── gas.js         # Google 스프레드시트 연동
    └── app.js         # 초기화·페이지 전환
```

## 실행 방법 (로컬 서버 필요)

`index.html`을 더블클릭만 하면 브라우저가 `js/*.js` 로드를 막을 수 있습니다. 아래 중 하나로 **프로젝트 폴더**를 연 뒤 브라우저에서 `http://localhost:...` 로 접속하세요.

### VS Code / Cursor

1. 확장 **Live Server** 설치 (없다면)
2. `index.html` 우클릭 → **Open with Live Server**

### 터미널 (Node 설치 시)

```bash
cd c:\Users\WiseWires\Documents\WisePay
npx --yes serve .
```

### Python

```bash
cd c:\Users\WiseWires\Documents\WisePay
python -m http.server 8080
```

브라우저: `http://localhost:8080`

## 원본

`Downloads\index.html` 은 그대로 두었습니다. 이 프로젝트가 분리·정리된 버전입니다.
