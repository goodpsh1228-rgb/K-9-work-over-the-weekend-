-- =============================================================
-- 추가: 제외 종류 "관리자 제외"(excused)
--   다가오는 근무일에 투표를 깜빡한 사람(미응답자) 중 그날 출근하지 않는 사람을
--   관리자가 근무일 화면에서 골라 그날 추첨에서만 빼는 기록입니다.
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
-- =============================================================
alter table absences drop constraint if exists absences_kind_check;
alter table absences add constraint absences_kind_check
  check (kind in ('leave', 'injury', 'outing', 'discharge', 'excused'));
