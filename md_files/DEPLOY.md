# WisePay 수정 후 적용 절차

수정 유형에 따라 필요한 작업이 다릅니다. 아래에서 해당 항목을 확인하세요.

---

## 수정 유형 판단

| 수정된 파일 | 유형 |
|---|---|
| `js/*.js`, `css/*.css`, `index.html` | **A: 프런트엔드만** |
| `WisePay_GAS.gs` | **B: GAS만** |
| 둘 다 | **A + B 모두** |

---

## A. 프런트엔드 수정 후 (js / css / html)

### 1. 최신 코드 받기 (다른 PC에서 작업할 때만)
```
git pull origin main
```
→ 같은 PC에서 계속 작업 중이면 이 단계는 생략

### 2. GitHub Pages 반영 대기
- Push 완료 후 **1~2분** 기다린다
- `https://github.com/lucky4694-github/WisePay/actions` 에서 초록 체크 확인 가능

### 3. 브라우저 강력 새로고침
- **Ctrl + Shift + R** (Windows / Chrome · Edge)
- **Cmd + Shift + R** (Mac · Chrome)
- → 브라우저 캐시를 무시하고 최신 파일을 다시 받아옴

### ※ Live Server로 로컬 테스트하는 경우
- VS Code에서 파일 저장 → Live Server가 자동으로 새로고침
- 캐시 문제가 있으면 **Ctrl + Shift + R**
- Live Server 재기동이 필요한 경우: VS Code 우하단 "Go Live" 버튼 클릭 → 재클릭

> **GAS 재배포 불필요.** 프런트엔드 수정은 Google Apps Script와 무관합니다.

---

## B. GAS 수정 후 (WisePay_GAS.gs)

### 1. 최신 코드 받기 (다른 PC에서 작업할 때만)
```
git pull origin main
```

### 2. Google Apps Script 편집기 열기
- Google Drive → WisePay 스프레드시트 열기
- 메뉴: **확장 프로그램 → Apps Script**

### 3. 코드 복사·붙여넣기
- `WisePay_GAS.gs` 파일 전체 내용을 복사
- Apps Script 편집기의 `코드.gs` 탭에 전체 선택(Ctrl+A) 후 붙여넣기
- **Ctrl + S** 로 저장

### 4. 새 배포
- 우상단 **배포** 버튼 → **배포 관리**
- 기존 배포 옆 연필(편집) 아이콘 클릭
- 버전: **"새 버전"** 선택
- **배포** 클릭

> ⚠️ "새 배포"(완전히 새로 만들기)를 하면 URL이 바뀝니다.  
> 반드시 기존 배포를 **편집**해서 새 버전으로 올려야 URL이 유지됩니다.

### 5. 브라우저 강력 새로고침
- **Ctrl + Shift + R**

---

## 브라우저를 완전히 껐다 켜야 하는 경우

아래 상황에서는 Ctrl+Shift+R만으로 부족할 수 있습니다:

- Service Worker 캐시 문제 (보통 해당 없음)
- 브라우저 확장 프로그램이 간섭하는 경우
- 위 방법으로도 변경이 반영되지 않을 때

그래도 해결 안 되면: **Chrome 설정 → 개인 정보 → 인터넷 사용 기록 삭제** (캐시된 이미지/파일만 체크)

---

## 체크리스트 요약

### 프런트엔드(js/css/html)만 수정
- [ ] (타 PC라면) `git pull origin main`
- [ ] GitHub Actions 초록 체크 확인 (1~2분)
- [ ] **Ctrl + Shift + R**
- [ ] GAS 재배포 → ❌ 불필요

### GAS만 수정
- [ ] (타 PC라면) `git pull origin main`
- [ ] Apps Script 편집기에 전체 붙여넣기 + Ctrl+S
- [ ] 배포 관리 → 기존 배포 편집 → 새 버전 → 배포
- [ ] **Ctrl + Shift + R**

### 둘 다 수정
- [ ] 위 두 항목 모두 순서대로 실행
