-- =============================================================
-- 6단계 추가: 추첨 결과를 "한 번에, 딱 한 번만" 저장하는 함수
--
-- 사용법: Supabase 대시보드 → SQL Editor → 이 파일 내용 전체를 붙여넣고 → Run (한 번만)
--
-- record_draw(...) 가 하는 일
--   1) draws 표에 그 날짜의 추첨 기록을 넣습니다.
--      이미 기록이 있으면(누가 먼저 추첨함) 아무것도 하지 않고 false 를 돌려줍니다. → 중복 추첨 방지
--   2) 기록이 새로 들어갔을 때만 확정 명단(assignments)을 넣고 true 를 돌려줍니다.
--   두 작업은 하나의 묶음(트랜잭션)이라, 중간에 실패하면 둘 다 없던 일이 됩니다.
-- =============================================================

create or replace function record_draw(
  p_duty_date        date,
  p_triggered_by     text,
  p_executed_by      bigint,
  p_clinic_shortage  integer,
  p_general_shortage integer,
  p_assignments      jsonb      -- [{"member_id":1,"post_id":2,"source":"wanted"}, ...]
)
returns boolean
language plpgsql
as $$
declare
  inserted integer;
begin
  insert into draws (duty_date, triggered_by, executed_by, clinic_shortage, general_shortage)
  values (p_duty_date, p_triggered_by, p_executed_by, p_clinic_shortage, p_general_shortage)
  on conflict (duty_date) do nothing;

  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false; -- 이미 추첨된 날
  end if;

  insert into assignments (duty_date, member_id, post_id, source)
  select p_duty_date,
         (a->>'member_id')::bigint,
         (a->>'post_id')::bigint,
         a->>'source'
  from jsonb_array_elements(p_assignments) as a;

  return true;
end;
$$;

-- 보안: 이 함수는 우리 서버(비밀 키)만 부를 수 있게 합니다.
revoke all on function record_draw(date, text, bigint, integer, integer, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function record_draw(date, text, bigint, integer, integer, jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function record_draw(date, text, bigint, integer, integer, jsonb) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function record_draw(date, text, bigint, integer, integer, jsonb) to service_role';
  end if;
end;
$$;
