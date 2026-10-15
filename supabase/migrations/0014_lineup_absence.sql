-- =============================================================
-- 추가: 라인업 불참 사유 (교육·당직오프·근무오프·외진) + 상세 내용
--   absences.kind 에 training(교육), duty_off(당직오프), work_off(근무오프), outpatient(외진) 추가
--   absences.detail : 상세 내용 (예: 교육 이름, 외진 병원) — 100자까지, 비워도 됨
--   이 종류들도 기존 휴가처럼 그 기간 주말출근 추첨에서 제외됩니다.
--
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣고 → Run (여러 번 실행해도 안전)
-- =============================================================
alter table absences add column if not exists detail text check (detail is null or length(detail) <= 100);
alter table absences drop constraint if exists absences_kind_check;
alter table absences add constraint absences_kind_check
  check (kind in ('leave', 'injury', 'outing', 'discharge', 'excused', 'training', 'duty_off', 'work_off', 'outpatient', 'lineup'));
