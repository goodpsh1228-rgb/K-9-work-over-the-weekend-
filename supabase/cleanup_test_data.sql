-- =============================================================
-- 9단계: 시험용(가짜) 데이터 정리 — 실제 명단을 넣기 직전에 한 번만 실행
--
-- ⚠ 되돌릴 수 없습니다. 먼저 아래 [1]만 실행해서 남을 사람을 확인한 뒤, [2]를 실행하세요.
--
-- 지우는 것 : 응답(희망/미희망), 휴가·부상, 추첨 기록·확정 명단, 날짜별 인원 설정,
--            근무일 추가/삭제 설정, 변경 이력, 관리자가 아닌 모든 인원
-- 남기는 것 : 관리자 계정(is_admin = true), 동 이름·기본 인원 설정(posts)
-- =============================================================

-- [1] 확인용: 정리 후에도 남을 사람(관리자) 목록
select id, name, rank, is_active from members where is_admin order by name;

-- [2] 정리 (위 목록을 확인한 뒤 아래 부분만 선택해서 실행)
begin;
delete from assignments;          -- 확정 명단
delete from draws;                -- 추첨 기록
delete from responses;            -- 희망/미희망
delete from absences;             -- 휴가·부상
delete from duty_day_post_counts; -- 날짜별 인원 설정
delete from duty_day_overrides;   -- 근무일 추가/삭제 설정 (실제로 필요한 공휴일 추가가 있었다면 정리 후 다시 추가)
delete from audit_logs;           -- 변경 이력
delete from members where not is_admin;  -- 관리자가 아닌 인원(가짜 인원) 삭제
commit;

-- 정리 후 가짜 관리자(예: 테스트관리자)가 남아 있다면, 사이트의 관리자 메뉴 → 인원 관리에서 체크 후 삭제하세요.
