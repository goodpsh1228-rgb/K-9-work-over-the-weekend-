-- =============================================================
-- 추가: 운전 지정 (운전병끼리 돌아가며 맡는 운전 담당 날짜)
--   drive_duties : 누가(member_id) 며칠부터 며칠까지(start_date~end_date, 양 끝 포함) 운전하는지
--   홈 "내일 운전병" 표시, 운전하는 날은 1차 명단(1차탑승)에서 제외하는 데 쓰입니다.
--   (주말출근 추첨의 "주말 운전" 자리와는 별개입니다)
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
-- =============================================================
create table if not exists drive_duties (
  id          bigint generated always as identity primary key,
  member_id   bigint not null references members(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  created_by  bigint references members(id) on delete set null,   -- 입력자 (운전병 또는 관리자)
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists drive_duties_by_date on drive_duties (start_date, end_date);
alter table drive_duties enable row level security;
comment on table drive_duties is '운전 지정 (운전병이 운전하는 기간, 양 끝 포함)';
