-- 추가 업데이트 한 번에 (0002 + 0003 + 0004 + 0005 + 0006 + 0007 + 0008 + 0009 + 0011 + 0012) — 여러 번 실행해도 안전합니다
alter table responses add column if not exists post_id bigint references posts(id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'responses_post_matches_choice') then
    delete from responses where choice = 'want' and post_id is null;
    alter table responses add constraint responses_post_matches_choice
      check ((choice = 'want' and post_id is not null) or (choice = 'decline' and post_id is null));
  end if;
end $$;
create index if not exists responses_by_date_post on responses (duty_date, post_id);

create or replace function record_draw(p_duty_date date, p_triggered_by text, p_executed_by bigint,
  p_clinic_shortage integer, p_general_shortage integer, p_assignments jsonb)
returns boolean language plpgsql as $$
declare inserted integer;
begin
  insert into draws (duty_date, triggered_by, executed_by, clinic_shortage, general_shortage)
  values (p_duty_date, p_triggered_by, p_executed_by, p_clinic_shortage, p_general_shortage)
  on conflict (duty_date) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return false; end if;
  insert into assignments (duty_date, member_id, post_id, source)
  select p_duty_date, (a->>'member_id')::bigint, (a->>'post_id')::bigint, a->>'source'
  from jsonb_array_elements(p_assignments) as a;
  return true;
end $$;
revoke all on function record_draw(date, text, bigint, integer, integer, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function record_draw(date, text, bigint, integer, integer, jsonb) from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function record_draw(date, text, bigint, integer, integer, jsonb) from authenticated'; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function record_draw(date, text, bigint, integer, integer, jsonb) to service_role'; end if;
end $$;

alter table members add column if not exists rank text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'members_rank_check') then
    alter table members add constraint members_rank_check check (rank in ('이병', '일병', '상병', '병장'));
  end if;
end $$;
alter table responses drop constraint if exists responses_member_id_fkey;
alter table responses add constraint responses_member_id_fkey foreign key (member_id) references members(id) on delete cascade;
alter table absences drop constraint if exists absences_member_id_fkey;
alter table absences add constraint absences_member_id_fkey foreign key (member_id) references members(id) on delete cascade;
alter table absences alter column created_by drop not null;
alter table absences drop constraint if exists absences_created_by_fkey;
alter table absences add constraint absences_created_by_fkey foreign key (created_by) references members(id) on delete set null;
alter table audit_logs drop constraint if exists audit_logs_actor_id_fkey;
alter table audit_logs add constraint audit_logs_actor_id_fkey foreign key (actor_id) references members(id) on delete set null;
alter table audit_logs drop constraint if exists audit_logs_target_member_id_fkey;
alter table audit_logs add constraint audit_logs_target_member_id_fkey foreign key (target_member_id) references members(id) on delete set null;
alter table duty_day_overrides drop constraint if exists duty_day_overrides_created_by_fkey;
alter table duty_day_overrides add constraint duty_day_overrides_created_by_fkey foreign key (created_by) references members(id) on delete set null;
alter table duty_day_post_counts drop constraint if exists duty_day_post_counts_created_by_fkey;
alter table duty_day_post_counts add constraint duty_day_post_counts_created_by_fkey foreign key (created_by) references members(id) on delete set null;
alter table draws drop constraint if exists draws_executed_by_fkey;
alter table draws add constraint draws_executed_by_fkey foreign key (executed_by) references members(id) on delete set null;

-- ── 0005 + 0006: 제외 종류 추가, 운전병 ──
alter table members add column if not exists is_driver boolean not null default false;
alter table posts drop constraint if exists posts_pool_check;
alter table posts add constraint posts_pool_check check (pool in ('clinic', 'general', 'driver', 'escort'));
insert into posts (name, pool, default_count, sort_order)
values ('주말 운전', 'driver', 1, 15)
on conflict (name) do nothing;
alter table absences drop constraint if exists absences_kind_check;
alter table absences add constraint absences_kind_check
  check (kind in ('leave', 'injury', 'outing', 'discharge', 'excused', 'training', 'duty_off', 'work_off', 'outpatient', 'lineup'));

-- ── 0007: 주말 운전 따로 ──
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

-- ── 0008: 선탑 ──
-- ④ 선탑 (pool = 'escort')
alter table posts drop constraint if exists posts_pool_check;
alter table posts add constraint posts_pool_check check (pool in ('clinic', 'general', 'driver', 'escort'));
insert into posts (name, pool, default_count, sort_order)
values ('선탑', 'escort', 1, 16)
on conflict (name) do nothing;

-- ── 0009: 휴가 계산기 ──
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


-- ── 0011: 관리자 제외 ──
alter table absences drop constraint if exists absences_kind_check;
alter table absences add constraint absences_kind_check
  check (kind in ('leave', 'injury', 'outing', 'discharge', 'excused', 'training', 'duty_off', 'work_off', 'outpatient', 'lineup'));

-- ── 0012: 계급 수동 변경 ──
alter table members add column if not exists rank_manual_on date;


-- ── 0013: 휴가 계획 (실제 휴가와 구분) ──
alter table leaves add column if not exists planned boolean not null default false;

-- ── 0014: 라인업 불참 사유 + 상세 ──
alter table absences add column if not exists detail text check (detail is null or length(detail) <= 100);

-- ── 0015: 기수·반 ──
alter table members add column if not exists cohort integer check (cohort is null or cohort between 1 and 9999);
alter table members add column if not exists squad text check (squad is null or squad in ('미용반', '진료반', '훈련반', '관리반', '분만반'));
update members set squad = '진료반' where is_clinic and squad is null;

-- ── 0016: 라인업 불참(사유 직접 입력) ──
alter table absences drop constraint if exists absences_kind_check;
alter table absences add constraint absences_kind_check
  check (kind in ('leave', 'injury', 'outing', 'discharge', 'excused', 'training', 'duty_off', 'work_off', 'outpatient', 'lineup'));


-- ── 0017: 운전 지정 ──
create table if not exists drive_duties (
  id          bigint generated always as identity primary key,
  member_id   bigint not null references members(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  created_by  bigint references members(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists drive_duties_by_date on drive_duties (start_date, end_date);
alter table drive_duties enable row level security;

-- 0018 전입일
alter table members add column if not exists transfer_date date;
comment on column members.transfer_date is '전입일 (정기휴가 6주 간격 계산 기준)';

-- 0019 순번제
-- ① 순번표는 3개: general(일반 동), clinic(진료실), driver(주말 운전)
--    rotation_state : 순번표별 현재 "바퀴 번호". 한 바퀴를 다 돌면 1 올라감.
create table if not exists rotation_state (
  pool        text primary key check (pool in ('general', 'clinic', 'driver')),
  cycle       integer not null default 1 check (cycle >= 1),
  updated_at  timestamptz not null default now()
);
insert into rotation_state (pool) values ('general'), ('clinic'), ('driver')
on conflict (pool) do nothing;
alter table rotation_state enable row level security;
comment on table rotation_state is '순번표별 현재 바퀴 번호(cycle)';

-- ② rotation_log : 순번 기록 (누가 몇 번째 바퀴에서 근무/건너뜀)
--    kind = 'served'  : 순번으로 근무가 배정됨
--    kind = 'skipped' : 순번이었지만 출근 불가라 건너뜀 → 빚. repaid_at 이 비어 있으면 아직 안 갚은 빚
--    "지금 누구 차례인가"는 이 기록에서 계산합니다 (별도 포인터를 저장하지 않아 어긋날 일이 없음).
create table if not exists rotation_log (
  id          bigint generated always as identity primary key,
  pool        text not null check (pool in ('general', 'clinic', 'driver')),
  member_id   bigint not null references members(id) on delete cascade,
  duty_date   date not null,                                   -- 배정되었거나 건너뛴 근무일
  cycle       integer not null check (cycle >= 1),             -- 그때의 바퀴 번호
  kind        text not null check (kind in ('served', 'skipped')),
  reason      text,                                            -- 건너뛴 이유 (예: 휴가, 교육)
  repaid_at   timestamptz,                                     -- skipped 빚을 갚은 시각 (갚으면 채움)
  created_at  timestamptz not null default now()
);
create index if not exists rotation_log_by_pool on rotation_log (pool, cycle, created_at);
create index if not exists rotation_log_by_member on rotation_log (member_id, pool);
-- 같은 근무일·순번표에서 같은 사람이 같은 종류로 두 번 기록되지 않게
create unique index if not exists rotation_log_unique on rotation_log (pool, duty_date, member_id, kind);
alter table rotation_log enable row level security;
comment on table rotation_log is '순번 기록: served=배정, skipped=건너뜀(빚, repaid_at 비면 미상환)';

-- ③ rotation_picks : 순번으로 뽑힌 사람 (동은 관리자가 나중에 배정 → post_id 비어 있을 수 있음)
--    관리자가 동을 정하면 assignments(확정 명단)에 source='rotation' 으로 들어갑니다.
create table if not exists rotation_picks (
  id          bigint generated always as identity primary key,
  duty_date   date not null,
  pool        text not null check (pool in ('general', 'clinic', 'driver')),
  member_id   bigint not null references members(id) on delete cascade,
  post_id     bigint references posts(id),                     -- 비어 있음 = 아직 동 미배정
  created_at  timestamptz not null default now(),
  unique (duty_date, pool, member_id)
);
create index if not exists rotation_picks_by_date on rotation_picks (duty_date, pool);
alter table rotation_picks enable row level security;
comment on table rotation_picks is '순번으로 뽑힌 사람. post_id 가 비면 관리자가 동을 배정해야 함';

-- ④ monthly_draws : 한 달 차출 실행 기록 (한 달에 한 번만 — 기본 키가 중복을 막음)
--    month = 근무 대상 달 ('2026-12' 형식)
create table if not exists monthly_draws (
  month         text primary key check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  executed_by   bigint references members(id) on delete set null,
  shortage      jsonb not null default '{}'::jsonb,            -- 후보 부족 등 (예: {"2026-12-05": 1})
  executed_at   timestamptz not null default now()
);
alter table monthly_draws enable row level security;
comment on table monthly_draws is '한 달 차출 실행 기록. 대상 달당 1건';

-- ⑤ 기존 표에서 "순번" 꼬리표를 쓸 수 있게
alter table assignments drop constraint if exists assignments_source_check;
alter table assignments add constraint assignments_source_check
  check (source in ('wanted', 'drafted', 'admin', 'rotation'));
alter table draws drop constraint if exists draws_triggered_by_check;
alter table draws add constraint draws_triggered_by_check
  check (triggered_by in ('cron', 'visit', 'manual', 'rotation'));

-- 0020 자발 출근 인정
alter table rotation_log drop constraint if exists rotation_log_kind_check;
alter table rotation_log add constraint rotation_log_kind_check
  check (kind in ('served', 'skipped', 'volunteered'));
