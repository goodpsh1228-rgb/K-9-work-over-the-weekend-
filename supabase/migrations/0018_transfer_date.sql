-- =============================================================
-- 추가: 전입일 (정기휴가 일정 계산용)
--   members.transfer_date : 부대 전입일. 전입일로부터 6주마다 정기휴가(2박3일) 14번,
--   마지막(14번째) 정기휴가 시작 2주 뒤에 위로휴가 하루가 한 번 나옵니다 (휴가 계산기 "복무 정보" 배너에 표시).
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
-- =============================================================
alter table members add column if not exists transfer_date date;
comment on column members.transfer_date is '전입일 (정기휴가 6주 간격 계산 기준)';
