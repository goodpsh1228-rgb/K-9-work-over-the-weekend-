// ─────────────────────────────────────────────────────────────
// 카카오톡에 붙여넣을 명단 글 만들기 (순수 계산)
//
// 예)
//   [10/12(일) 근무 명단]
//   ■ 진료실 (2명)
//   - 홍길동
//   - 김철수
//   ■ 관리 1동 (1명)
//   - 이영희
//   ...
// 자리 순서는 설정 화면의 순서(진료실 → 관리 1동 → …)를 따르고,
// 자리 안의 이름은 가나다순입니다. 빈자리가 있으면 "(빈자리 N)"을 붙입니다.
// ─────────────────────────────────────────────────────────────
import { formatShort } from "./kst";

export function buildKakaoText(
  date: string,
  posts: { id: number; name: string; required: number }[], // 자리 순서대로
  roster: { postId: number; name: string }[],
): string {
  const lines = [`[${formatShort(date)} 근무 명단]`];
  for (const p of posts) {
    const names = roster
      .filter((r) => r.postId === p.id)
      .map((r) => r.name)
      .sort((a, b) => a.localeCompare(b, "ko"));
    if (p.required === 0 && names.length === 0) continue; // 그날 쓰지 않는 자리
    const empty = Math.max(0, p.required - names.length);
    lines.push(`■ ${p.name} (${names.length}명)${empty > 0 ? ` (빈자리 ${empty})` : ""}`);
    for (const n of names) lines.push(`- ${n}`);
  }
  return lines.join("\n");
}
