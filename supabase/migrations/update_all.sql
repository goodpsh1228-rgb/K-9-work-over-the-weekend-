-- 추가 업데이트 한 번에 (0002 + 0003 + 0004 + 0005 + 0006) — 여러 번 실행해도 안전합니다
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
alter table posts add constraint posts_pool_check check (pool in ('clinic', 'general', 'driver'));
insert into posts (name, pool, default_count, sort_order)
values ('주말 운전', 'driver', 1, 15)
on conflict (name) do nothing;
alter table absences drop constraint if exists absences_kind_check;
alter table absences add constraint absences_kind_check
  check (kind in ('leave', 'injury', 'outing', 'discharge'));
