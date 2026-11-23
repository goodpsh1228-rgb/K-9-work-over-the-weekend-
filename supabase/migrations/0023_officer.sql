-- =============================================================
-- 추가: 간부 계정 (members.is_officer)
--   간부 = 관리자 기능을 쓸 수 있지만(is_admin 도 함께 켬), 본인은 주말출근·순번·기수·전역일·휴가 계산기 대상이 아닌 계정.
--   간부는 투표·추첨·순번·라인업 인원·통계·반별 휴가 TO 인원에서 모두 빠집니다.
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
-- =============================================================
alter table members add column if not exists is_officer boolean not null default false;
comment on column members.is_officer is '간부 계정: 관리자 기능 사용 가능, 주말출근·순번·기수·전역일·휴가 계산기 대상 아님';
