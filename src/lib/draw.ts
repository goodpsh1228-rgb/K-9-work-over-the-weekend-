// ─────────────────────────────────────────────────────────────
// 추첨 계산 (순수 계산 — 데이터베이스를 건드리지 않음)
//
// 하루에 두 개의 독립된 추첨을 합니다. 서로의 풀에 영향을 주지 않습니다.
//   · 진료실 추첨: 진료반 인원만 (pool = "clinic")
//   · 일반 추첨  : 진료반이 아닌 인원 (pool = "general", 관리자 포함)
//
// 각 추첨의 순서
//   1) 자리(동)마다 그 자리를 희망한 사람을 모읍니다.
//      - 희망자 ≥ 정원: 희망자 중 랜덤으로 정원만큼 "희망 확정". 떨어진 사람은 그날 쉼.
//      - 희망자 < 정원: 희망자 전원 "희망 확정". 남은 자리는 빈자리로 둠.
//   2) 차출 풀 = 희망하지 않은 사람(미응답 + 미희망). 제외자(휴가·부상)는 애초에 입력에 없음.
//      빈자리 수만큼 풀에서 같은 확률로 뽑아 "차출"하고, 빈자리(동)에 랜덤으로 넣습니다.
//   3) 풀이 모자라면 채운 만큼만 확정하고, 남은 빈자리 수 = 인원 부족.
//
// 난수는 밖에서 넣어 줍니다(rng). 실제로는 서버의 암호학적 난수를, 시험에서는 고정된 난수를 씁니다.
// ─────────────────────────────────────────────────────────────

export type Pool = "clinic" | "general";
export type Source = "wanted" | "drafted";

export type DrawInput = {
  posts: { id: number; pool: Pool; required: number }[]; // 그날의 자리와 필요 인원
  members: { id: number; pool: Pool }[]; // 추첨 대상: 활성 + 제외 아님
  responses: Map<number, { choice: "want" | "decline"; postId: number | null }>; // 인원번호 → 응답
};

export type DrawResult = {
  assignments: { memberId: number; postId: number; source: Source }[];
  rested: number[]; // 희망했지만 정원 초과로 떨어져 쉬는 사람
  shortage: Record<Pool, number>; // 풀별 인원 부족 수
};

// rng(n) → 0 이상 n 미만의 정수
export type Rng = (n: number) => number;

// 피셔-예이츠 섞기: 모든 순서가 같은 확률로 나오는 표준 섞기 방법
export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawPool(pool: Pool, input: DrawInput, rng: Rng, out: DrawResult) {
  const posts = input.posts.filter((p) => p.pool === pool);
  const postById = new Map(posts.map((p) => [p.id, p]));
  const members = input.members.filter((m) => m.pool === pool);

  // 1) 자리별 희망자 모으기
  const wantersByPost = new Map<number, number[]>(posts.map((p) => [p.id, []]));
  const wanted = new Set<number>(); // 이 풀의 자리를 희망한 사람 (차출 대상 아님)
  for (const m of members) {
    const r = input.responses.get(m.id);
    if (r?.choice === "want" && r.postId !== null && postById.has(r.postId)) {
      wantersByPost.get(r.postId)!.push(m.id);
      wanted.add(m.id);
    }
    // 없어진 자리·다른 풀 자리를 희망한 경우는 "희망 안 함"으로 보고 차출 풀에 남깁니다.
  }

  // 자리별 희망 확정 / 떨어짐 / 빈자리
  const emptySeats: number[] = []; // 빈자리 하나마다 자리 번호 하나
  for (const post of posts) {
    const wanters = shuffle(wantersByPost.get(post.id)!, rng);
    const take = Math.min(post.required, wanters.length);
    for (const id of wanters.slice(0, take)) out.assignments.push({ memberId: id, postId: post.id, source: "wanted" });
    out.rested.push(...wanters.slice(take)); // 정원 초과로 떨어진 희망자 → 쉼
    for (let i = take; i < post.required; i++) emptySeats.push(post.id);
  }

  // 2) 차출: 희망하지 않은 사람(미응답+미희망) 중 같은 확률로
  const draftPool = shuffle(
    members.filter((m) => !wanted.has(m.id)).map((m) => m.id),
    rng,
  );
  const seats = shuffle(emptySeats, rng); // 어느 동에 들어갈지도 랜덤
  const n = Math.min(seats.length, draftPool.length);
  for (let i = 0; i < n; i++) out.assignments.push({ memberId: draftPool[i], postId: seats[i], source: "drafted" });

  // 3) 인원 부족
  out.shortage[pool] = seats.length - n;
}

export function runDraw(input: DrawInput, rng: Rng): DrawResult {
  const out: DrawResult = { assignments: [], rested: [], shortage: { clinic: 0, general: 0 } };
  drawPool("clinic", input, rng, out);
  drawPool("general", input, rng, out);
  return out;
}
