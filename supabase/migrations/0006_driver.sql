-- =============================================================
-- 추가: 운전병 + "주말 운전" 자리
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
--   ① members.is_driver : 운전병 여부 (기본 false)
--   ② posts.pool 에 'driver'(운전병 전용 자리) 허용
--   ③ "주말 운전" 자리 추가 (기본 1명, 진료실 바로 다음 순서)
--   ④ (0005를 아직 안 했을 경우를 위해) 제외 종류 외출·면회, 전역 면제도 함께 적용
-- =============================================================
alter table members add column if not exists is_driver boolean not null default false;

alter table posts drop constraint if exists posts_pool_check;
alter table posts add constraint posts_pool_check check (pool in ('clinic', 'general', 'driver', 'escort'));

insert into posts (name, pool, default_count, sort_order)
values ('주말 운전', 'driver', 1, 15)
on conflict (name) do nothing;

alter table absences drop constraint if exists absences_kind_check;
alter table absences add constraint absences_kind_check
  check (kind in ('leave', 'injury', 'outing', 'discharge'));
