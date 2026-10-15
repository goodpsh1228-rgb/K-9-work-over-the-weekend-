-- =============================================================
-- 추가: 기수(cohort)와 반(squad)
--   members.cohort : 기수 (숫자가 작을수록 높은 기수. 예: 866기가 877기보다 높음). 본인·관리자가 입력
--   members.squad  : 반 — 미용반 / 진료반 / 훈련반 / 관리반 / 분만반 (관리자가 지정)
--   기존 진료반 인원은 반을 "진료반"으로 채워 둡니다. (진료반 ↔ 진료실 추첨 대상은 기존과 같음)
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
-- =============================================================
alter table members add column if not exists cohort integer check (cohort is null or cohort between 1 and 9999);
alter table members add column if not exists squad text check (squad is null or squad in ('미용반', '진료반', '훈련반', '관리반', '분만반'));
update members set squad = '진료반' where is_clinic and squad is null;
