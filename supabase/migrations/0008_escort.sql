-- =============================================================
-- 추가: "선탑" 자리 (0005·0006·0007 내용 포함 — 이 파일 하나만 실행하면 됩니다)
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
--   선탑은 추첨하지 않고, 추첨 후 관리자가 "명단 수정"에서 1명을 지정합니다.
--   (동 출근자가 선탑을 함께 맡을 수 있음)
-- =============================================================
-- ① 0005 · 0006
alter table members add column if not exists is_driver boolean not null default false;
alter table posts drop constraint if exists posts_pool_check;
alter table posts add constraint posts_pool_check check (pool in ('clinic', 'general', 'driver', 'escort'));
insert into posts (name, pool, default_count, sort_order)
values ('주말 운전', 'driver', 1, 15)
on conflict (name) do nothing;
alter table absences drop constraint if exists absences_kind_check;
alter table absences add constraint absences_kind_check
  check (kind in ('leave', 'injury', 'outing', 'discharge'));

-- ② 주말 운전 희망
create table if not exists drive_wants (
  member_id   bigint not null references members(id) on delete cascade,
  duty_date   date not null,
  created_at  timestamptz not null default now(),
  primary key (member_id, duty_date)
);
alter table drive_wants enable row level security;
comment on table drive_wants is '주말 운전 희망 (운전병, 동 희망과 별도)';
-- 이전 방식(동 버튼처럼 운전을 고르던 응답)이 남아 있으면 정리
delete from responses where post_id in (select id from posts where pool = 'driver');

-- ③ 같은 날 같은 사람이 "다른 자리" 두 곳(동 + 운전)을 가질 수 있게
alter table assignments drop constraint if exists assignments_duty_date_member_id_key;
create unique index if not exists assignments_date_member_post on assignments (duty_date, member_id, post_id);

-- ④ 선탑 (pool = 'escort')
alter table posts drop constraint if exists posts_pool_check;
alter table posts add constraint posts_pool_check check (pool in ('clinic', 'general', 'driver', 'escort'));
insert into posts (name, pool, default_count, sort_order)
values ('선탑', 'escort', 1, 16)
on conflict (name) do nothing;
