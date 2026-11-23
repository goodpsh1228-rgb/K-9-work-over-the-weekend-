-- =============================================================
-- 추가: 순번제 (랜덤 차출 폐지) — 1단계: 데이터 창고
--   매달 첫째 주에 다음 달 한 달치를 투표 → 마감 후 관리자가 [한 달 차출하기] 한 번.
--   공석 = 정원 − 희망 확정. 후보 = 미희망자 + 미응답자 (제외자 빼고).
--   순번 = 높은 기수부터(members.cohort 가 작을수록 높은 기수), 달을 넘어 이어짐.
--   출근 불가인 사람은 자동으로 건너뛰고 "빚"으로 기록 → 다음 기회에 앞 순번으로 우선.
--   동은 관리자가 배정하므로, 순번으로 뽑힌 사람은 동이 비어 있는 상태로 저장됩니다.
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
-- =============================================================

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
