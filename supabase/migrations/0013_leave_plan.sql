-- =============================================================
-- 추가: 휴가 계획 (실제 휴가와 구분)
--   leaves.planned = true  → "계획" (달력에 점선으로만 표시, 사용 현황·주말출근 제외에는 반영 안 됨)
--   leaves.planned = false → "실제 휴가" (지금까지처럼 사용 현황에 반영, 주말출근 제외로 보낼 수 있음)
--   계획은 "실제로 확정" 버튼을 누르면 실제 휴가로 바뀝니다.
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
-- =============================================================
alter table leaves add column if not exists planned boolean not null default false;
