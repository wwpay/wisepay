'use strict';
// 수정: 2026-06-08 09:35 — vacationData 전역 변수 및 LS.vacation 키 추가
let LANG = 'KR';
const _initNow = new Date();
const _initNowM = _initNow.getMonth() + 1; // 1-12
let currentYear  = _initNowM === 1 ? _initNow.getFullYear() - 1 : _initNow.getFullYear();
let currentMonth = _initNowM === 1 ? 12 : _initNowM - 1;
let currentEmpIdx = -1; // -1 = 미선택
let editingEmpIdx = -1;
let tempFamilies = [];
// GAS URL — 코드에 고정값으로 관리. UI에서 변경 불가.
const GAS_URL = 'https://script.google.com/macros/s/AKfycbw4ENHtGwZEx8YUCU9ILnXNwrPwK-y8BQr7uHIu2-YZzT8eS3Qm9XB1K3VgImLbLNLE8A/exec';
let gasUrl = GAS_URL;
let rates = { kenko:9.85, kaigo:1.62, kodomo:0.23, nenkin:18.30, koyo:0.50 };
// 월별 요율 이력 [{from:'2026-01', kenko:9.91, kaigo:1.60, ...}, ...]
// from: 'YYYY-MM' 형식, 해당 월부터 적용
// rate history — each entry is effective from the 'from' month onwards
// kenko/kaigo: changes with March payroll (health insurance fiscal year)
// koyo: changes from April (employment insurance fiscal year)
let rateHistory = [
  { from:'2024-03', kenko:9.98, kaigo:1.60, kodomo:0.00, nenkin:18.30, koyo:0.60 }, // R6 health change
  { from:'2024-04', kenko:9.98, kaigo:1.60, kodomo:0.00, nenkin:18.30, koyo:0.60 }, // R6 employment (no change)
  { from:'2025-03', kenko:9.91, kaigo:1.59, kodomo:0.00, nenkin:18.30, koyo:0.60 }, // R7 health change
  { from:'2025-04', kenko:9.91, kaigo:1.59, kodomo:0.00, nenkin:18.30, koyo:0.55 }, // R7 employment change
  { from:'2026-03', kenko:9.85, kaigo:1.62, kodomo:0.00, nenkin:18.30, koyo:0.55 }, // R8 health change
  { from:'2026-04', kenko:9.85, kaigo:1.62, kodomo:0.23, nenkin:18.30, koyo:0.50 }, // R8 employment + kodomo
];
let employees = [];
// 각 입력란의 이전 값 저장용 (ESC 복원)
const prevValues = {};

const LS = { emp:'kyuyo_emp', rates:'kyuyo_rates', rateHistory:'kyuyo_rate_history', gas:'kyuyo_gas', lang:'kyuyo_lang', deletedEmpIds:'kyuyo_deleted_emp_ids', paidYMs:'kyuyo_paid_yms', paidDetails:'kyuyo_paid_details', vacation:'kyuyo_vacation' };
// emp.no: 앱 전체의 Primary Key — 사원·급여 데이터 연결 기준, 재사용 불가
let deletedEmpIds = [];    // localStorage 기반 삭제 ID 목록 (하위 호환)
let gasDeletedEmpIds = []; // GAS deleted_emp_ids 시트 기반 목록 (우선 기준)
let paidYMs     = new Set(); // 지급완료된 연월 집합 — "YYYY-MM" 형식
let paidDetails = {};        // 지급완료 시각 맵 — { "YYYY-MM": paidAt ISO string }
let vacationData = {};    // { empNo: [...records] } — 유급휴가 데이터
let payrollDirty = false; // 급여명세 미저장 여부
let _pendingScrapedRates = null; // 스크래핑 결과 임시 보관

const PFIELDS = ['r-base','r-ot','r-kintai','r-commute','r-commutetax','r-kinmu','r-shokumu','r-field','r-hyo','k-jumin','k-nencho'];

