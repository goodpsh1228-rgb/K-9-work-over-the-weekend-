-- =============================================================
-- 추가: 라인업 불참(사유 직접 입력) 종류 "lineup"
--   absences.kind 에 lineup 추가. 사유는 absences.detail 에 직접 입력한 글로 저장됩니다.
--   (전역 1개월 전 면제는 이제 휴가 계산기에 입력한 전역일로 자동 적용되므로 SQL 변경 없음)
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
-- =============================================================
alter table absences drop constraint if exists absences_kind_check;
alter table absences add constraint absences_kind_check
  check (kind in ('leave', 'injury', 'outing', 'discharge', 'excused', 'training', 'duty_off', 'work_off', 'outpatient', 'lineup'));
