-- =============================================================
-- 추가: 계급 저장 + 인원 삭제 지원
--
-- 사용법: Supabase 대시보드 → SQL Editor → 이 파일 내용 전체를 붙여넣고 → Run (한 번만)
--
-- 1) members 에 rank(계급) 칸 추가: 이병 / 일병 / 상병 / 병장 (비워 둘 수 있음)
--    월요일에는 상병·병장만, 화요일부터는 일병·이병(과 계급 미지정)도 투표할 수 있습니다.
-- 2) 인원을 삭제할 수 있도록 연결 규칙 변경
--    - 그 사람의 응답·휴가 기록은 함께 삭제
--    - 그 사람이 "입력자/실행자"로 남은 기록(다른 사람 휴가 대리 입력, 변경 이력 등)은 남기고 입력자만 비움
--    - 확정 명단(assignments)에 한 번이라도 들어간 사람은 과거 명단 보존을 위해 삭제를 막습니다
--      (화면에서는 이 경우 자동으로 "비활성화"로 처리합니다)
-- =============================================================

alter table members
  add column rank text check (rank in ('이병', '일병', '상병', '병장'));
comment on column members.rank is '계급 (이병/일병/상병/병장). 월요일 투표는 상병·병장만';

-- 응답: 사람 삭제 시 함께 삭제
alter table responses drop constraint responses_member_id_fkey;
alter table responses add constraint responses_member_id_fkey
  foreign key (member_id) references members(id) on delete cascade;

-- 휴가·부상: 본인 삭제 시 함께 삭제, 입력자 삭제 시 입력자만 비움
alter table absences drop constraint absences_member_id_fkey;
alter table absences add constraint absences_member_id_fkey
  foreign key (member_id) references members(id) on delete cascade;
alter table absences alter column created_by drop not null;
alter table absences drop constraint absences_created_by_fkey;
alter table absences add constraint absences_created_by_fkey
  foreign key (created_by) references members(id) on delete set null;

-- 변경 이력: 기록은 남기고 사람만 비움 (상세 내용에 이름이 남아 있음)
alter table audit_logs drop constraint audit_logs_actor_id_fkey;
alter table audit_logs add constraint audit_logs_actor_id_fkey
  foreign key (actor_id) references members(id) on delete set null;
alter table audit_logs drop constraint audit_logs_target_member_id_fkey;
alter table audit_logs add constraint audit_logs_target_member_id_fkey
  foreign key (target_member_id) references members(id) on delete set null;

-- 근무일 설정·추첨 기록의 "누가 했는지"도 비움
alter table duty_day_overrides drop constraint duty_day_overrides_created_by_fkey;
alter table duty_day_overrides add constraint duty_day_overrides_created_by_fkey
  foreign key (created_by) references members(id) on delete set null;
alter table duty_day_post_counts drop constraint duty_day_post_counts_created_by_fkey;
alter table duty_day_post_counts add constraint duty_day_post_counts_created_by_fkey
  foreign key (created_by) references members(id) on delete set null;
alter table draws drop constraint draws_executed_by_fkey;
alter table draws add constraint draws_executed_by_fkey
  foreign key (executed_by) references members(id) on delete set null;

-- assignments.member_id 는 그대로(삭제 금지) — 과거 확정 명단 보존
