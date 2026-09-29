-- =============================================================
-- 5단계 추가: 희망할 때 "원하는 동(자리)"을 함께 저장
--
-- 사용법: Supabase 대시보드 → SQL Editor → 이 파일 내용 전체를 붙여넣고 → Run (한 번만)
--
-- responses 표에 post_id(희망하는 자리) 칸을 추가합니다.
--   - 희망(want)  : 반드시 자리가 있어야 함 (진료반은 진료실, 그 외는 고른 동)
--   - 미희망(decline): 자리가 없어야 함
-- =============================================================

-- 기존에 저장된 희망 응답이 있으면 규칙을 만족할 수 없으므로 정리합니다. (테스트 단계라 실제 데이터 없음)
delete from responses where choice = 'want';

alter table responses
  add column post_id bigint references posts(id);

alter table responses
  add constraint responses_post_matches_choice
  check ((choice = 'want' and post_id is not null) or (choice = 'decline' and post_id is null));

comment on column responses.post_id is '희망하는 자리(동). 희망이면 필수, 미희망이면 비움';

-- 날짜별·자리별 희망자 수를 빨리 세기 위한 색인
create index responses_by_date_post on responses (duty_date, post_id);
