// ─────────────────────────────────────────────────────────────
// 카카오톡에 붙여넣을 출근 명단 글 만들기 (순수 계산) — 두 가지 형식
//
// ① 동별
//   필승! 10/1 (목) 출근 명단 입니다
//   훈련동: 상병 조성휘, 일병 홍원표
//   관리 1동: 상병 홍예준
//   ...
//   진료실: 병장 임세윤, 상병 정영우
//   운전병: 병장 강민창
//   선탑: 병장 한정민
//
// ② 계급별 (동·진료실 출근자만. 운전병·선탑 줄은 세지 않음)
//   필승! 10.01 (목) 출근 명단 입니다!
//   병장 : 이정우, 장민우, ...
//   상병 : ...
//
// 한 줄 안의 이름은 계급 높은 순 → 가나다순입니다.
// ─────────────────────────────────────────────────────────────
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const RANK_ORDER = ["병장", "상병", "일병", "이병"];

// 동별 글에서 자리 순서 (여기 없는 자리는 분만실 다음에 원래 순서대로)
const TEXT_ORDER = ["훈련동", "관리 1동", "관리 2동", "관리 3동", "종모견동", "분만실", "진료실", "주말 운전", "선탑"];
// 글에 쓰는 이름 (자리 이름과 다를 때만)
const TEXT_LABEL: Record<string, string> = { "주말 운전": "운전병" };

export type TextPost = { id: number; name: string; pool: string; required: number };
export type TextPerson = { postId: number; name: string; rank: string | null };

function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
const rankIndex = (r: string | null) => (r && RANK_ORDER.includes(r) ? RANK_ORDER.indexOf(r) : RANK_ORDER.length);
const byRankThenName = (a: TextPerson, b: TextPerson) => rankIndex(a.rank) - rankIndex(b.rank) || a.name.localeCompare(b.name, "ko");
const withRank = (p: TextPerson) => (p.rank ? `${p.rank} ${p.name}` : p.name);

function orderPosts(posts: TextPost[]): TextPost[] {
  const known = (p: TextPost) => TEXT_ORDER.indexOf(p.name);
  const pos = (p: TextPost, i: number) => (known(p) >= 0 ? known(p) : 5.5 + i / 1000); // 모르는 자리는 분만실 뒤
  return posts.map((p, i) => ({ p, k: pos(p, i) })).sort((a, b) => a.k - b.k).map((x) => x.p);
}

// ① 동별 출근 명단
export function buildPostText(date: string, posts: TextPost[], roster: TextPerson[]): string {
  const [, m, d] = date.split("-").map(Number);
  const lines = [`필승! ${m}/${d} (${weekdayOf(date)}) 출근 명단 입니다`];
  for (const p of orderPosts(posts)) {
    const people = roster.filter((r) => r.postId === p.id).sort(byRankThenName);
    if (p.required === 0 && people.length === 0) continue; // 그날 쓰지 않는 자리
    const label = TEXT_LABEL[p.name] ?? p.name;
    lines.push(`${label}: ${people.length ? people.map(withRank).join(", ") : "미정"}`);
  }
  return lines.join("\n");
}

// ② 계급별 출근 명단 (동·진료실 출근자만, 한 사람은 한 번)
export function buildRankText(date: string, posts: TextPost[], roster: TextPerson[]): string {
  const [, m, d] = date.split("-");
  const lines = [`필승! ${m}.${d} (${weekdayOf(date)}) 출근 명단 입니다!`];
  const workPosts = new Set(posts.filter((p) => p.pool === "clinic" || p.pool === "general").map((p) => p.id));
  const seen = new Set<string>();
  const people = roster.filter((r) => workPosts.has(r.postId) && !seen.has(r.name) && seen.add(r.name));
  for (const rank of [...RANK_ORDER, null]) {
    const names = people
      .filter((p) => (rank === null ? rankIndex(p.rank) === RANK_ORDER.length : p.rank === rank))
      .map((p) => p.name)
      .sort((a, b) => a.localeCompare(b, "ko"));
    if (names.length) lines.push(`${rank ?? "계급 미지정"} : ${names.join(", ")}`);
  }
  return lines.join("\n");
}
