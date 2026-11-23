-- =============================================================
-- 추가: 한 달 차출 뒤에 추가된 근무일(임시공휴일 등)도 차출할 수 있게
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (0021 다음에, 여러 번 실행해도 안전)
--
-- 달라지는 점: record_monthly_draw 가 같은 달을 두 번째 불러도, 아직 추첨되지 않은 날이 있으면 그 날만 추가로 저장합니다.
--   · 날짜마다 draws(기본 키 = 날짜)가 중복을 막으므로, 같은 날은 절대 두 번 추첨되지 않습니다.
--   · 새로 저장된 날이 하나도 없으면 false 를 돌려주고 아무것도 바꾸지 않습니다(중복 실행 방지는 그대로).
-- =============================================================
create or replace function record_monthly_draw(
  p_month        text,
  p_executed_by  bigint,
  p_shortage     jsonb,
  p_days         jsonb,
  p_log          jsonb,
  p_repaid       jsonb,
  p_cycles       jsonb
)
returns boolean
language plpgsql
as $$
declare
  inserted integer;
  d jsonb;
  skip_dates text[] := '{}';
  any_new boolean := false;
begin
  insert into monthly_draws (month, executed_by, shortage)
  values (p_month, p_executed_by, coalesce(p_shortage, '{}'::jsonb))
  on conflict (month) do update
    set shortage = monthly_draws.shortage || excluded.shortage,
        executed_by = excluded.executed_by,
        executed_at = now();

  for d in select * from jsonb_array_elements(p_days) loop
    insert into draws (duty_date, triggered_by, executed_by, clinic_shortage, general_shortage)
    values ((d->>'date')::date, 'rotation', p_executed_by, coalesce((d->>'clinic_shortage')::int, 0), coalesce((d->>'general_shortage')::int, 0))
    on conflict (duty_date) do nothing;
    get diagnostics inserted = row_count;
    if inserted = 0 then
      skip_dates := array_append(skip_dates, d->>'date'); -- 이미 추첨된 날
      continue;
    end if;
    any_new := true;

    insert into assignments (duty_date, member_id, post_id, source)
    select (d->>'date')::date, (a->>'member_id')::bigint, (a->>'post_id')::bigint, a->>'source'
    from jsonb_array_elements(d->'assignments') as a;

    insert into rotation_picks (duty_date, pool, member_id, post_id)
    select (d->>'date')::date, x->>'pool', (x->>'member_id')::bigint, nullif(x->>'post_id', '')::bigint
    from jsonb_array_elements(d->'picks') as x;
  end loop;

  if not any_new then
    return false; -- 새로 저장된 날이 없음 (이미 모두 차출됨)
  end if;

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
