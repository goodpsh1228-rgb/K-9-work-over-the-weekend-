-- =============================================================
-- 2단계: 데이터 창고(데이터베이스) 설계 — 표(테이블) 만들기
--
-- 사용법: Supabase 대시보드 → SQL Editor → 이 파일 내용 전체를 붙여넣고 → Run
--
-- 용어
--   표(table)       : 엑셀 시트 한 장과 비슷합니다. 줄(행) = 기록 1건, 칸(열) = 항목
--   기본 키(PK)     : 한 줄을 구분하는 고유 번호/값. 중복될 수 없습니다.
--   외래 키(FK)     : 다른 표의 줄을 가리키는 칸. 없는 사람/동을 가리킬 수 없게 막아 줍니다.
--   check 제약      : 칸에 들어갈 수 있는 값을 제한하는 규칙 (예: 인원 수는 0 이상)
--
-- 날짜/시간 원칙
--   - 근무일, 휴가 시작·종료일 같은 "달력 날짜"는 date 형식(한국 날짜 그대로)으로 저장합니다.
--   - "언제 했는지" 같은 순간 기록은 timestamptz(시간대 포함 시각)로 저장합니다.
-- =============================================================


-- -------------------------------------------------------------
-- 공통 도구: 줄이 수정될 때 updated_at(수정 시각)을 자동으로 갱신
-- -------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -------------------------------------------------------------
-- 1) members : 인원
--    이름(표시 이름)과 비밀번호 해시만 저장합니다. (군번·연락처 등은 저장하지 않음)
-- -------------------------------------------------------------
create table members (
  id                    bigint generated always as identity primary key,
  name                  text not null unique                        -- 표시 이름 (동명이인은 홍길동A/홍길동B)
                        check (length(trim(name)) between 1 and 30),
  password_hash         text not null,                              -- 비밀번호 "해시"만 저장 (원문 저장 안 함)
  must_change_password  boolean not null default true,              -- 첫 로그인 / 초기화 후 비밀번호 변경 강제
  is_clinic             boolean not null default false,             -- 진료반 여부 (진료실 추첨 대상)
  is_admin              boolean not null default false,             -- 관리자 여부
  is_active             boolean not null default true,              -- false = 비활성(전출·전역). 로그인·추첨에서 빠짐
  failed_login_count    integer not null default 0,                 -- 연속 로그인 실패 횟수
  locked_until          timestamptz,                                -- 이 시각까지 로그인 차단 (실패 누적 시)
  session_version       integer not null default 1,                 -- 비밀번호 초기화·비활성화 시 1 증가 → 기존 로그인 강제 종료
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger members_updated_at before update on members
  for each row execute function set_updated_at();
comment on table members is '인원: 이름 + 비밀번호 해시만 저장. 삭제하지 않고 is_active=false 로 비활성화';


-- -------------------------------------------------------------
-- 2) posts : 근무 자리(진료실, 관리 1동 …) 설정
--    동 이름과 기본 인원을 코드에 고정하지 않고 이 표에서 관리합니다.
--    pool(추첨 풀)
--      'clinic'  = 진료반 전용 추첨 (진료실)
--      'general' = 일반 추첨 (진료반을 제외한 나머지)
-- -------------------------------------------------------------
create table posts (
  id              bigint generated always as identity primary key,
  name            text not null unique check (length(trim(name)) between 1 and 30),
  pool            text not null check (pool in ('clinic', 'general')),
  default_count   integer not null check (default_count between 0 and 50),  -- 기본 필요 인원
  sort_order      integer not null default 0,                               -- 화면·카톡 명단에 보이는 순서
  is_active       boolean not null default true,                            -- false = 더 이상 쓰지 않는 자리 (과거 명단 보존용)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger posts_updated_at before update on posts
  for each row execute function set_updated_at();
comment on table posts is '근무 자리 설정: 진료실(clinic) + 일반 동(general). 이름·기본 인원은 설정 화면에서 변경';

-- 기본값 넣기 (계획서 6장)
insert into posts (name, pool, default_count, sort_order) values
  ('진료실',    'clinic',  2, 10),
  ('관리 1동',  'general', 1, 20),
  ('관리 2동',  'general', 3, 30),
  ('관리 3동',  'general', 4, 40),
  ('훈련동',    'general', 4, 50),
  ('종모견동',  'general', 2, 60),
  ('분만실',    'general', 1, 70);


-- -------------------------------------------------------------
-- 3) duty_day_overrides : 근무일 수동 수정 (관리자 설정이 자동 생성보다 우선)
--    주말·공휴일은 코드가 계산해서 자동으로 만들고(4단계),
--    관리자가 "추가"하거나 "삭제"한 날만 이 표에 기록합니다.
--      kind = 'add'    : 근무일 추가 (임시공휴일, 평일 출근 등)
--      kind = 'remove' : 자동 생성된 근무일 삭제 (근무 없는 날)
-- -------------------------------------------------------------
create table duty_day_overrides (
  duty_date     date primary key,                                   -- 날짜 하나당 설정 하나
  kind          text not null check (kind in ('add', 'remove')),
  note          text,                                               -- 메모 (예: "임시공휴일")
  created_by    bigint references members(id),
  created_at    timestamptz not null default now()
);
comment on table duty_day_overrides is '근무일 수동 추가(add)/삭제(remove). 자동 생성(주말·공휴일)보다 우선';


-- -------------------------------------------------------------
-- 4) duty_day_post_counts : 특정 날짜만 자리별 인원을 다르게
--    여기 없는 자리는 posts.default_count(기본 인원)를 씁니다.
-- -------------------------------------------------------------
create table duty_day_post_counts (
  duty_date     date not null,
  post_id       bigint not null references posts(id),
  required_count integer not null check (required_count between 0 and 50),
  created_by    bigint references members(id),
  created_at    timestamptz not null default now(),
  primary key (duty_date, post_id)
);
comment on table duty_day_post_counts is '날짜별 자리 인원 변경(override). 없으면 posts.default_count 사용';


-- -------------------------------------------------------------
-- 5) responses : 근무일별 희망/미희망 응답
--    한 사람은 한 근무일에 응답 하나만 가집니다 (기본 키가 사람+날짜).
--    응답을 "취소"하면 이 줄을 지웁니다 → 미응답 상태.
--    제외(휴가·부상)와 미응답은 여기에 저장하지 않고 계산합니다.
-- -------------------------------------------------------------
create table responses (
  member_id     bigint not null references members(id),
  duty_date     date not null,
  choice        text not null check (choice in ('want', 'decline')),  -- want=희망, decline=미희망
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (member_id, duty_date)
);
create index responses_by_date on responses (duty_date);
create trigger responses_updated_at before update on responses
  for each row execute function set_updated_at();
comment on table responses is '희망(want)/미희망(decline) 응답. 사람+날짜당 1개. 줄이 없으면 미응답';


-- -------------------------------------------------------------
-- 6) absences : 휴가·부상(제외) 기간
--    근무일이 시작일~종료일(양 끝 포함)에 걸치면 그 근무일에서 제외됩니다.
-- -------------------------------------------------------------
create table absences (
  id            bigint generated always as identity primary key,
  member_id     bigint not null references members(id),
  kind          text not null check (kind in ('leave', 'injury')),    -- leave=휴가, injury=부상
  start_date    date not null,
  end_date      date not null,
  created_by    bigint not null references members(id),               -- 입력자 (본인 또는 관리자)
  created_at    timestamptz not null default now(),
  check (end_date >= start_date)                                      -- 종료일이 시작일보다 앞설 수 없음
);
create index absences_by_member on absences (member_id, start_date, end_date);
comment on table absences is '휴가·부상 제외 기간(시작·종료일 포함). 입력자(created_by) 기록';


-- -------------------------------------------------------------
-- 7) draws : 추첨 실행 기록 (근무일당 딱 1번)
--    duty_date 가 기본 키이므로, 같은 날짜로 두 번 추첨하려 하면
--    데이터베이스가 두 번째를 거부합니다. → 중복 추첨 방지(멱등성)
-- -------------------------------------------------------------
create table draws (
  duty_date         date primary key,
  triggered_by      text not null check (triggered_by in ('cron', 'visit', 'manual')),
                    -- cron=정기 자동 실행, visit=접속 시 안전장치, manual=관리자 수동 버튼
  executed_by       bigint references members(id),                    -- 수동 실행한 관리자 (자동이면 비어 있음)
  clinic_shortage   integer not null default 0 check (clinic_shortage >= 0),   -- 진료실 인원 부족 수
  general_shortage  integer not null default 0 check (general_shortage >= 0),  -- 일반 인원 부족 수
  executed_at       timestamptz not null default now()
);
comment on table draws is '추첨 실행 기록. 근무일당 1건(기본 키)으로 중복 추첨을 데이터베이스가 막음';


-- -------------------------------------------------------------
-- 8) assignments : 확정 명단 (누가, 어느 자리에)
--    source(꼬리표)
--      'wanted'  = 희망 확정
--      'drafted' = 차출
--      'admin'   = 관리자 수정
--    한 사람은 한 근무일에 한 자리만 가질 수 있습니다.
-- -------------------------------------------------------------
create table assignments (
  id            bigint generated always as identity primary key,
  duty_date     date not null references draws(duty_date),            -- 추첨이 끝난 날만 명단이 있음
  member_id     bigint not null references members(id),
  post_id       bigint not null references posts(id),
  source        text not null check (source in ('wanted', 'drafted', 'admin')),
  created_at    timestamptz not null default now(),
  unique (duty_date, member_id)                                       -- 같은 날 같은 사람 중복 배정 금지
);
create index assignments_by_date on assignments (duty_date, post_id);
comment on table assignments is '확정 명단. 꼬리표 wanted=희망 확정, drafted=차출, admin=관리자 수정';


-- -------------------------------------------------------------
-- 9) audit_logs : 변경 이력
--    누가(actor), 언제(created_at), 무엇을(action), 어떻게(details)
--    예) action = 'assignment.replace', 'member.grant_admin', 'member.deactivate'
-- -------------------------------------------------------------
create table audit_logs (
  id                bigint generated always as identity primary key,
  actor_id          bigint references members(id),                    -- 비어 있으면 시스템(자동 추첨, 비상 복구 등)
  action            text not null,
  target_member_id  bigint references members(id),
  duty_date         date,
  details           jsonb not null default '{}'::jsonb,               -- 변경 전/후 등 상세 내용
  created_at        timestamptz not null default now()
);
create index audit_logs_by_time on audit_logs (created_at desc);
comment on table audit_logs is '변경 이력: 누가·언제·무엇을·어떻게';


-- -------------------------------------------------------------
-- 보안: 모든 표에 RLS(행 단위 보안)를 켭니다.
--   허용 규칙(policy)을 하나도 만들지 않았으므로,
--   공개 키(publishable/anon)로는 어떤 표도 읽거나 쓸 수 없습니다.
--   우리 서버만 비밀 키(SUPABASE_SECRET_KEY)로 접근합니다.
-- -------------------------------------------------------------
alter table members              enable row level security;
alter table posts                enable row level security;
alter table duty_day_overrides   enable row level security;
alter table duty_day_post_counts enable row level security;
alter table responses            enable row level security;
alter table absences             enable row level security;
alter table draws                enable row level security;
alter table assignments          enable row level security;
alter table audit_logs           enable row level security;
