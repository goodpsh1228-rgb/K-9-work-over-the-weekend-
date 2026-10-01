-- =============================================================
-- 추가: 휴가 계산기 (입대일·전역일, 휴가·외출·면회 기록)
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
--   ① members.enlist_date / discharge_date : 본인이 입력하는 입대일·전역일 (진행률 계산용)
--   ② leaves : 휴가 계산기의 달력 기록
--        kind    : comfort=위로, regular=정기, reward=포상, official=공가, annual=연가,
--                  outing=외출, visit=면회
--        subkind : 포상 → mileage(마일리지) / merit(가점)
--                  연가 → junior(일·이병) / corporal(상병) / sergeant(병장)
--        absence_id : "주말출근 제외로 보내기"를 눌러 만든 제외 기록 (취소·삭제되면 비워짐)
-- =============================================================
alter table members add column if not exists enlist_date date;
alter table members add column if not exists discharge_date date;

create table if not exists leaves (
  id          bigint generated always as identity primary key,
  member_id   bigint not null references members(id) on delete cascade,
  kind        text not null check (kind in ('comfort', 'regular', 'reward', 'official', 'annual', 'outing', 'visit')),
  subkind     text check (subkind is null or subkind in ('mileage', 'merit', 'junior', 'corporal', 'sergeant')),
  start_date  date not null,
  end_date    date not null,
  memo        text check (memo is null or length(memo) <= 100),
  absence_id  bigint references absences(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists leaves_by_member on leaves (member_id, start_date);
alter table leaves enable row level security;
comment on table leaves is '휴가 계산기 기록 (위로·정기·포상·공가·연가·외출·면회)';
