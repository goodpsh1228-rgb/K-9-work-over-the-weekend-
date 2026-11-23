-- 추가: 순번 기록에 "자발 출근(volunteered)" 종류 — 희망 확정으로 출근한 사람은 그 바퀴 근무 1회로 인정
-- 사용법: Supabase SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
alter table rotation_log drop constraint if exists rotation_log_kind_check;
alter table rotation_log add constraint rotation_log_kind_check
  check (kind in ('served', 'skipped', 'volunteered'));
