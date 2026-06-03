# WisePay 웹앱 개발 종합 — 개발 히스토리 (시간순)

> 앱 정식명: 「給与Pro by Wisewires」/ 약칭: WisePay（와이즈페이）  
> 개발자: Wisewires 주식회사 일본지점 지점장  
> 목적: 일본 노동법 기반 급여 계산 웹앱 (소규모 사업장용)

---

## 1단계 — 기획 및 설계
**관련 채팅:** [일본 급여 계산 프로그램 개발](https://claude.ai/chat/6e85f533-c7f1-4d6f-8f63-956c155c9756)

- Gemini가 초안 제작한 파일 존재
- 구글 드라이브(Google Sheets) DB 연동 방식으로 결정
  - 이유: 급여 데이터는 브라우저 캐시 삭제 시 증발하는 localStorage 부적합
  - Sheets = 무료, 엑셀로도 열림, 자동 백업
- 기술 스택 결정: 웹앱(HTML/JS) + Google Apps Script(GAS) + Google Sheets
- 아키텍처:
  ```
  웹앱 (브라우저) ↕ GAS ↕ Google Sheets
  ```
- 기능 범위: 월급 + 수당 + 공제 + 근태 입력
- UI 언어: 한국어 기본 + 일본어 전환

---

## 2단계 — GAS 배포 및 연동
**관련 채팅:** [일본 급여 계산 프로그램 개발2](https://claude.ai/chat/b663e349-c74a-492d-842e-d807660b00eb)

- GAS 코드(WisePay_GAS.gs) → Google Apps Script에 붙여넣기 후 배포
- Dev URL vs exec URL 차이 확인
  | | Dev URL | 정식(exec) URL |
  |---|---|---|
  | 용도 | 개발/테스트 | 실제 운영 |
  | 데이터 저장 | 본인만 가능 | 모든 접속자 가능 |
  | GAS 코드 반영 | 즉시 자동 반영 | 재배포 필요 |
- 정식 URL 형태: `https://script.google.com/macros/s/AKfycb.../exec`
- 결론: 개발 중엔 Dev, 운영 시 exec URL 사용

---

## 3단계 — 보험료 요율 관련 논의
**관련 채팅:** [일본 급여관리 수동 입력 문제](https://claude.ai/chat/2a86f641-0691-4111-b399-f7671425c8f0)

- 기존 사용 서비스: A-SaaS → freee 인사노무
- 문제: 표준보수월액(標準報酬月額)이 수동입력 → 조정 누락 시 세금 오류 발생
- 수동입력 이유 (일본 법적 구조):
  - 협회けんぽ에 届出 수리 후에야 효력 발생
  - 随時改定 요건: 고정급 변경 + 3개월 연속 + 2등급 이상 차이 → 자동화 시 법적 위험
  - SaaS 설계 철학: 담당자가 최종 확인하는 구조 선호
- WisePay 방향: 자동 계산 + "随時改定 해당 가능성 있음 ⚠️" 알림 방식
- 보험료 요율 전면 수정 필요성 확인
- CC 혹사 관련 에피소드 (글씨 깨짐 → 한자 출력이었음 😄)

---

## 4단계 — Netlify 배포
**관련 채팅:** [Netlify 배포 순서](https://claude.ai/chat/3f916c82-6ac5-4787-b407-73b443fe0dbe)

- GitHub 저장소: `lucky4694-github/WisePay`
- Netlify 배포 완료: **https://wwpay.netlify.app**
- 배포 설정:
  - Build command: 비워둠
  - Publish directory: `/` (루트)
- 배포 후 데이터 없음 현상 → localhost와 wwpay.netlify.app은 다른 origin → localStorage 별도
- 해결: Google 연동 설정에서 GAS exec URL 입력
- 보안: 간단한 비밀번호 방식 추가 (테스트용: `1111`)
  - 사용자: 지점장 + 세무사 2명만 → 복잡한 로그인 불필요

---

## 5단계 — 데이터 불일치 트러블슈팅
**관련 채팅:** [구글 시트와 웹앱 데이터 불일치](https://claude.ai/chat/4f0871ff-41e7-4099-8590-099cc3c8b816)

- 문제: 구글 시트에 자녀 1명인데 웹앱에 2명 표시
- 원인 후보: 자녀 배열 누적(push), state merge 중복, useEffect 이중 호출
- 임금대장 지급일 기준 확인:
  - 익월 10일 지급인 경우 → 지급일 기준으로 귀속 연도 결정
  - 25년 임금대장 = 24년 12월분 ~ 25년 11월분
  - 필터링 로직: `payDate.getFullYear() === targetYear`

---

## 6단계 — 백업 기능 설계
**관련 채팅:** [Wisepay 백업 파일 활용 방법](https://claude.ai/chat/4d50a8b3-b19c-4ed1-aee1-7bee85674651)

- JSON 백업: WisePay 복원 전용 (앱 구조 그대로 저장)
- Excel 백업: 사람이 열람하는 용도 (세무사 공유 등)
- 3중 백업 전략 기획:
  | 방식 | 자동/수동 | 역할 |
  |---|---|---|
  | 구글 시트 복사본 | 자동 (매주 GAS) | 빠른 복원 |
  | JSON 파일 | 수동 (주 1회 알림) | 완전 복원 |
  | Excel 파일 | 수동 (주 1회 알림) | 열람·공유용 |
- 부분 복원 기능 설계:
  - 사원 선택 (체크박스, 기본값: 전체)
  - 월 선택 (1월~12월, 기본값: 전체)
  - 조합 복원 가능 (특정 사원 × 특정 월)
  - 확인 팝업: "선택한 N명 × M개월 데이터를 덮어씁니다"

---

## 7단계 — Undo 기능 논의 및 철회
**관련 채팅:** [Wisepay undo 기능 구현 고민](https://claude.ai/chat/c4f39bc6-a4ce-4596-a580-77487f272136) / [오른쪽 아래 에러 해결](https://claude.ai/chat/7c41837e-3299-4253-9086-8fff9faaaf17)

- 초기 설계: Command 패턴 기반 Undo/Redo (undoStack + redoStack)
  - 대상: 셀 편집, 행 추가/삭제, 일괄 편집 전부
  - 스택 최대 50개
  - sessionStorage 백업
  - Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z 키바인딩
  - 저장 전 새로고침 경고 (beforeunload)
- CC가 구현 완료
- 재검토 후 결론: **Undo 기능 전체 제거**
  - 이유: 너무 높은 수준, 유지보수 복잡
  - 대안: 사원/급여 분리 백업 + 부분 복원으로 대체

---

## 8단계 — git 충돌 해결 및 백업 분리
**관련 채팅:** [오른쪽 아래 에러 해결](https://claude.ai/chat/7c41837e-3299-4253-9086-8fff9faaaf17)

- git pull 에러: untracked files 충돌 (backup 폴더 파일)
  - 해결: 로컬 파일 이름 변경(.bak) 후 pull
- 사원 선택 드롭다운 UI 버그 수정 (항목이 가로로 나열되던 문제)
- 백업 분리 구현 (CC 프롬프트 확정):
  - [사원 백업] → `사원_backup_YYYYMMDD.json`
  - [급여 백업] → `급여_backup_YYYYMMDD.json`
  - 복원 시 상대방 데이터 절대 건드리지 않음
  - 확인 다이얼로그 필수

---

*최종 업데이트: 2026-05-27*
