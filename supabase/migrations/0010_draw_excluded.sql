-- =============================================================
-- 추가: 관리자가 지정하는 "추첨 제외" 인원 (날짜와 상관없이 다시 풀 때까지 제외)
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
--   draw_excluded        : true 이면 모든 근무일 추첨·투표·미응답 목록에서 빠짐
--   draw_excluded_reason : 제외 사유 (예: 파견, 장기 입원) — 선택
-- =============================================================
alter table members add column if not exists draw_excluded boolean not null default false;
alter table members add column if not exists draw_excluded_reason text check (draw_excluded_reason is null or length(draw_excluded_reason) <= 50);
