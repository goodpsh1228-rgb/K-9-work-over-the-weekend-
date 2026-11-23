-- =============================================================
-- 추가: 한 달 차출 결과를 "한 번에, 딱 한 번만" 저장하는 함수 (순번제)
--
-- 사용법: Supabase 대시보드 → SQL Editor → 이 파일 내용 전체를 붙여넣고 → Run
--   (먼저 0019, 0020 이 실행되어 있어야 합니다. 여러 번 실행해도 안전)
--
-- record_monthly_draw(...) 가 하는 일 (모두 한 묶음 = 하나라도 실패하면 전부 없던 일)
--   1) monthly_draws 에 그 달 기록을 넣습니다. 이미 있으면 false 를 돌려주고 끝 → 중복 차출 방지
--   2) 날짜마다 draws(추첨 기록) + assignments(확정 명단: 희망 확정·진료실·운전) + rotation_picks(순번으로 뽑힌 사람)
--      · 이미 추첨 기록이 있는 날은 건너뜁니다
--   3) rotation_log(근무·건너뜀·자발 기록)를 넣고, 갚은 빚에는 repaid_at 을 채웁니다
--   4) rotation_state(바퀴 번호)를 갱신합니다
-- =============================================================
create or replace function record_monthly_draw(
  p_month        text,
  p_executed_by  bigint,
  p_shortage     jsonb,   -- {"2026-12-05": 1, ...}
  p_days         jsonb,   -- [{date, clinic_shortage, general_shortage, assignments:[{member_id,post_id,source}], picks:[{pool,member_id,post_id}]}]
  p_log          jsonb,   -- [{pool, member_id, duty_date, cycle, kind, reason}]
  p_repaid       jsonb,   -- [{pool, member_id, duty_date}]  갚은 빚 (건너뛰었던 날짜)
  p_cycles       jsonb    -- {"general": 2, "clinic": 1, "driver": 1}
)
returns boolean
language plpgsql
as $$
declare
  inserted integer;
  d jsonb;
  skip_dates text[] := '{}';
begin
  insert into monthly_draws (month, executed_by, shortage)
  values (p_month, p_executed_by, coalesce(p_shortage, '{}'::jsonb))
  on conflict (month) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false; -- 이미 차출된 달
  end if;

  for d in select * from jsonb_array_elements(p_days) loop
    insert into draws (duty_date, triggered_by, executed_by, clinic_shortage, general_shortage)
    values ((d->>'date')::date, 'rotation', p_executed_by, coalesce((d->>'clinic_shortage')::int, 0), coalesce((d->>'general_shortage')::int, 0))
    on conflict (duty_date) do nothing;
    get diagnostics inserted = row_count;
    if inserted = 0 then
      skip_dates := array_append(skip_dates, d->>'date'); -- 예전 방식으로 이미 추첨된 날
      continue;
    end if;

    insert into assignments (duty_date, member_id, post_id, source)
    select (d->>'date')::date, (a->>'member_id')::bigint, (a->>'post_id')::bigint, a->>'source'
    from jsonb_array_elements(d->'assignments') as a;

    insert into rotation_picks (duty_date, pool, member_id, post_id)
    select (d->>'date')::date, x->>'pool', (x->>'member_id')::bigint, nullif(x->>'post_id', '')::bigint
    from jsonb_array_elements(d->'picks') as x;
  end loop;

  -- 건너뛴 날(skip_dates)의 순번 기록은 넣지 않음
  insert into rotation_log (pool, member_id, duty_date, cycle, kind, reason)
  select l->>'pool', (l->>'member_id')::bigint, (l->>'duty_date')::date, (l->>'cycle')::int, l->>'kind', l->>'reason'
  from jsonb_array_elements(p_log) as l
  where not ((l->>'duty_date') = any (skip_dates))
  on conflict do nothing;

  update rotation_log r
     set repaid_at = now()
   from jsonb_array_elements(p_repaid) as x
  where r.pool = x->>'pool'
    and r.member_id = (x->>'member_id')::bigint
    and r.duty_date = (x->>'duty_date')::date
    and r.kind = 'skipped'
    and r.repaid_at is null;

  update rotation_state s
     set cycle = greatest(s.cycle, (p_cycles->>s.pool)::int), updated_at = now()
  where p_cycles ? s.pool;

  return true;
end;
$$;

-- 보안: 이 함수는 우리 서버(비밀 키)만 부를 수 있게 합니다.
revoke all on function record_monthly_draw(text, bigint, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function record_monthly_draw(text, bigint, jsonb, jsonb, jsonb, jsonb, jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function record_monthly_draw(text, bigint, jsonb, jsonb, jsonb, jsonb, jsonb) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function record_monthly_draw(text, bigint, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role';
  end if;
end;
$$;
