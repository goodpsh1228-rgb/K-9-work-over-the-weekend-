-- =============================================================
-- 추가: 제외 종류에 "외출·면회", "전역 1개월 전 면제" 추가
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
--   leave=휴가, injury=부상, outing=외출·면회, discharge=전역 1개월 전 면제
-- =============================================================
alter table absences drop constraint if exists absences_kind_check;
alter table absences add constraint absences_kind_check
  check (kind in ('leave', 'injury', 'outing', 'discharge'));
