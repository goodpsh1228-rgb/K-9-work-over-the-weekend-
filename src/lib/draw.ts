// ─────────────────────────────────────────────────────────────
// 추첨 계산 (순수 계산 — 데이터베이스를 건드리지 않음)
//
// 하루에 세 개의 추첨을 합니다.
//   · 진료실 추첨: 진료실 자리 (차출 대상은 진료반 인원만, pool = "clinic")
//   · 일반 추첨  : 각 동 자리 (차출 대상은 진료반이 아닌 인원, pool = "general", 관리자·운전병 포함)
//   · 운전 추첨  : 주말 운전 자리 (운전병만, pool = "driver") — 위 두 추첨과 완전히 따로
//   ※ 운전병은 동 희망·차출이 일반 인원과 똑같고, 그와 별도로 "주말 운전 희망"을 할 수 있습니다.
//     그래서 같은 날 동 출근 + 운전을 함께 할 수도 있습니다.
//     운전 희망자 ≥ 정원: 희망자 중 랜덤. 희망자 < 정원: 희망자 전원 + 나머지는 운전병 전체에서 랜덤.
//   ※ 희망은 진료반이 진료실뿐 아니라 다른 동도 고를 수 있습니다. (일반 인원은 동만)
//     진료반이 동을 희망하면 그 동의 희망자로 일반 인원과 같은 조건으로 뽑히고,
//     희망한 사람은 차출 대상이 아니므로 진료실 차출에도 들어가지 않습니다(하루 한 곳만).
//
// 순서
//   1) 자리(동)마다 그 자리를 희망한 사람을 모읍니다.
//      - 희망자 ≥ 정원: 희망자 중 랜덤으로 정원만큼 "희망 확정". 떨어진 사람은 그날 쉼.
//      - 희망자 < 정원: 희망자 전원 "희망 확정". 남은 자리는 빈자리로 둠.
//   2) 차출 풀 = 그 풀 소속 인원 중 희망하지 않은 사람(미응답 + 미희망). 제외자(휴가 등)는 애초에 입력에 없음.
//      빈자리 수만큼 풀에서 같은 확률로 뽑아 "차출"하고, 빈자리(동)에 랜덤으로 넣습니다.
//   3) 풀이 모자라면 채운 만큼만 확정하고, 남은 빈자리 수 = 인원 부족.
//
// 난수는 밖에서 넣어 줍니다(rng). 실제로는 서버의 암호학적 난수를, 시험에서는 고정된 난수를 씁니다.
// ─────────────────────────────────────────────────────────────

export type Pool = "clinic" | "general" | "driver";
export type Source = "wanted" | "drafted";

export type DrawInput = {
  posts: { id: number; pool: Pool; required: number }[]; // 그날의 자리와 필요 인원
  members: { id: number; pool: "clinic" | "general"; driver?: boolean }[]; // 추첨 대상: 활성 + 제외 아님 (driver = 운전병)
  driveWants?: Set<number>; // 주말 운전을 희망한 사람 (동 희망과 따로)
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

// 동·진료실 희망이 유효한지: 있는 자리여야 하고, 진료실은 진료반만 (운전 희망은 driveWants 로 따로 받음)
function validWants(input: DrawInput): Map<number, number> {
  const postById = new Map(input.posts.map((p) => [p.id, p]));
  const out = new Map<number, number>(); // 인원번호 → 희망 자리번호
  for (const m of input.members) {
    const r = input.responses.get(m.id);
    if (r?.choice !== "want" || r.postId === null) continue;
    const post = postById.get(r.postId);
    if (!post) continue; // 없어진 자리 → "희망 안 함"으로 보고 차출 풀에 남김
    if (post.pool === "clinic" && m.pool !== "clinic") continue; // 일반 인원의 진료실 희망은 무시
    if (post.pool === "driver") continue; // 운전은 동 희망과 따로 받으므로 여기서는 무시
    out.set(m.id, post.id);
  }
  return out;
}

function drawPool(pool: "clinic" | "general", input: DrawInput, wants: Map<number, number>, rng: Rng, out: DrawResult) {
  const posts = input.posts.filter((p) => p.pool === pool);

  // 1) 자리별 희망자 모으기 (소속과 상관없이, 이 풀의 자리를 희망한 사람)
  const wantersByPost = new Map<number, number[]>(posts.map((p) => [p.id, []]));
  for (const [memberId, postId] of wants) wantersByPost.get(postId)?.push(memberId);

  // 자리별 희망 확정 / 떨어짐 / 빈자리
  const emptySeats: number[] = []; // 빈자리 하나마다 자리 번호 하나
  for (const post of posts) {
    const wanters = shuffle(wantersByPost.get(post.id)!, rng);
    const take = Math.min(post.required, wanters.length);
    for (const id of wanters.slice(0, take)) out.assignments.push({ memberId: id, postId: post.id, source: "wanted" });
    out.rested.push(...wanters.slice(take)); // 정원 초과로 떨어진 희망자 → 쉼
    for (let i = take; i < post.required; i++) emptySeats.push(post.id);
  }

  // 2) 차출: 이 풀 소속 중 어떤 자리도 희망하지 않은 사람(미응답+미희망) 중 같은 확률로
  const draftPool = shuffle(
    input.members.filter((m) => m.pool === pool && !wants.has(m.id)).map((m) => m.id),
    rng,
  );
  const seats = shuffle(emptySeats, rng); // 어느 동에 들어갈지도 랜덤
  const n = Math.min(seats.length, draftPool.length);
  for (let i = 0; i < n; i++) out.assignments.push({ memberId: draftPool[i], postId: seats[i], source: "drafted" });

  // 3) 인원 부족
  out.shortage[pool] = seats.length - n;
}

export function runDraw(input: DrawInput, rng: Rng): DrawResult {
  const out: DrawResult = { assignments: [], rested: [], shortage: { clinic: 0, general: 0, driver: 0 } };
  const wants = validWants(input);
  drawPool("clinic", input, wants, rng, out);
  drawPool("general", input, wants, rng, out);
  drawDriver(input, rng, out);
  return out;
}

// 운전 추첨 (동 추첨과 따로): 운전 희망 운전병 우선, 모자라면 나머지 운전병 중 랜덤
//   운전 희망에서 떨어진 사람은 "쉼"이 아님 — 동 출근은 동 추첨 결과 그대로입니다.
function drawDriver(input: DrawInput, rng: Rng, out: DrawResult) {
  const drivers = input.members.filter((m) => m.driver).map((m) => m.id);
  const wanters = drivers.filter((id) => input.driveWants?.has(id));
  const others = drivers.filter((id) => !input.driveWants?.has(id));
  const wantQueue = shuffle(wanters, rng);
  const otherQueue = shuffle(others, rng);
  for (const post of input.posts.filter((p) => p.pool === "driver")) {
    for (let i = 0; i < post.required; i++) {
      const w = wantQueue.shift();
      if (w !== undefined) out.assignments.push({ memberId: w, postId: post.id, source: "wanted" });
      else {
        const o = otherQueue.shift();
        if (o !== undefined) out.assignments.push({ memberId: o, postId: post.id, source: "drafted" });
        else out.shortage.driver += 1; // 운전병이 모자람
      }
    }
  }
}
