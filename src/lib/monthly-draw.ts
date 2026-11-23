// ─────────────────────────────────────────────────────────────
// 한 달 차출 계산 (순수 계산 — 데이터베이스를 건드리지 않음)
//
// 순번제 전환(2026-11-23): 랜덤 차출 대신, 한 달치 근무일을 한꺼번에 처리합니다.
//   ① 날짜마다 희망을 먼저 확정합니다. (희망자 > 정원이면 그 자리 희망자끼리만 랜덤 → 떨어진 사람은 그날 쉼)
//   ② 남은 공석을 순번표(일반·진료실·운전 각각)로 채웁니다. 순번 규칙은 rotation.ts 참고.
//      · 진료실·운전 공석은 자리까지 바로 정해지고, 일반(동) 공석은 동이 비어 있는 채로 뽑혀 관리자가 동을 배정합니다.
//   ③ 순번에서 조용히 빠지는 사람(passed): 희망했다가 정원 초과로 떨어진 사람, 동을 희망해서 진료실 순번에서 빠지는 진료반.
//   ⑤ 전역 1개월 전부터는 순번에서 완전히 빠집니다(빚도 근무 인정도 없음). 전역일이 지난 사람도 마찬가지.
//   ④ 그날 운전이 지정된 운전병은 "주말 운전"을 먼저 채우고, 그날 동·진료실 순번에서는 근무 1회로 인정됩니다(출근하므로).
// ─────────────────────────────────────────────────────────────
import { planRotation, type RotLogRow, type RotMember, type RotResult } from "./rotation";
import { shuffle, type Rng } from "./draw";
import { dischargeRange } from "./absence-kinds";

export type RotPool = "general" | "clinic" | "driver";

export type MDayInput = {
  date: string;
  posts: { id: number; pool: RotPool; required: number }[]; // 그날 자리 (선탑 제외)
  responses: Map<number, { choice: "want" | "decline"; postId: number | null }>;
  driveWants: Set<number>; // 주말 운전 희망
  designated: number[]; // 그날 운전이 지정된 운전병
  excluded: Set<number>; // 휴가·부상·교육·관리자 제외·운전 지정 등으로 그날 출근 불가한 사람
  exempt?: Set<number>; // 전역 1개월 전 면제 기록이 있는 사람 (순번에서 조용히 빠짐 — 건너뜀·빚 없음)
};

export type MMember = RotMember & { clinic: boolean; driver: boolean; dischargeDate?: string | null }; // 활성 인원

export type MDayPlan = {
  date: string;
  wanted: { memberId: number; postId: number; pool: RotPool }[]; // 희망 확정
  picks: { memberId: number; pool: RotPool; postId: number | null }[]; // 순번으로 뽑힘 (일반은 postId 비어 있음 = 동 미배정)
  rested: number[]; // 희망했지만 떨어져 쉬는 사람
  shortage: Record<RotPool, number>; // 후보가 모자라 못 채운 자리
};

export type PoolState = { cycle: number; log: RotLogRow[] };

export type MonthPlan = {
  days: MDayPlan[];
  rotation: Record<RotPool, RotResult>;
};

export function planMonth(
  days: MDayInput[],
  members: MMember[],
  state: Record<RotPool, PoolState>,
  rng: Rng,
): MonthPlan {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const memberById = new Map(members.map((m) => [m.id, m]));

  // ── ① 날짜별 희망 확정 + 순번 입력 만들기 ──
  type Prep = { plan: MDayPlan; seats: Record<RotPool, number[]>; working: Record<RotPool, number[]>; passed: Record<RotPool, number[]>; unavailable: Record<number, string> };
  const preps: Prep[] = sorted.map((day) => {
    const plan: MDayPlan = { date: day.date, wanted: [], picks: [], rested: [], shortage: { general: 0, clinic: 0, driver: 0 } };
    const seats: Record<RotPool, number[]> = { general: [], clinic: [], driver: [] };
    const working: Record<RotPool, number[]> = { general: [], clinic: [], driver: [] };
    const passed: Record<RotPool, number[]> = { general: [], clinic: [], driver: [] };
    const postById = new Map(day.posts.map((p) => [p.id, p]));

    // 동·진료실 희망: 있는 자리여야 하고, 진료실은 진료반만, 제외자는 무시
    const wantersByPost = new Map<number, number[]>(day.posts.filter((p) => p.pool !== "driver").map((p) => [p.id, []]));
    for (const m of members) {
      const r = day.responses.get(m.id);
      if (r?.choice !== "want" || r.postId === null || day.excluded.has(m.id)) continue;
      const post = postById.get(r.postId);
      if (!post || post.pool === "driver") continue;
      if (post.pool === "clinic" && !m.clinic) continue;
      wantersByPost.get(post.id)?.push(m.id);
    }
    for (const post of day.posts.filter((p) => p.pool !== "driver")) {
      const wanters = shuffle(wantersByPost.get(post.id) ?? [], rng);
      const take = Math.min(post.required, wanters.length);
      for (const id of wanters.slice(0, take)) {
        plan.wanted.push({ memberId: id, postId: post.id, pool: post.pool });
        working[post.pool].push(id);
        // 진료반이 동을 희망해서 확정되면 그날 진료실 순번에서는 조용히 빠짐 (하루 한 곳)
        if (post.pool === "general" && memberById.get(id)?.clinic) passed.clinic.push(id);
      }
      for (const id of wanters.slice(take)) {
        plan.rested.push(id);
        passed[memberById.get(id)?.clinic ? "clinic" : "general"].push(id);
        if (post.pool === "general" && memberById.get(id)?.clinic) passed.general.push(id);
      }
      for (let i = take; i < post.required; i++) seats[post.pool].push(post.id);
    }

    // 운전: 지정 → 운전 희망(정원 초과면 랜덤) → 남은 자리는 순번
    const designated = [...new Set(day.designated)].filter((id) => memberById.get(id)?.driver);
    const driveWanters = shuffle(
      members.filter((m) => m.driver && day.driveWants.has(m.id) && !day.excluded.has(m.id) && !designated.includes(m.id)).map((m) => m.id),
      rng,
    );
    const designatedQueue = [...designated];
    const wantQueue = [...driveWanters];
    for (const post of day.posts.filter((p) => p.pool === "driver")) {
      for (let i = 0; i < post.required; i++) {
        const d = designatedQueue.shift();
        if (d !== undefined) {
          plan.wanted.push({ memberId: d, postId: post.id, pool: "driver" });
          working.driver.push(d);
          continue;
        }
        const w = wantQueue.shift();
        if (w !== undefined) {
          plan.wanted.push({ memberId: w, postId: post.id, pool: "driver" });
          working.driver.push(w);
          continue;
        }
        seats.driver.push(post.id);
      }
    }
    passed.driver.push(...wantQueue); // 운전 희망에서 떨어진 사람은 운전 순번에서 조용히 빠짐
    // 운전 지정자는 그날 출근하므로 동·진료실 순번에서도 근무 1회로 인정
    for (const id of designated) {
      const m = memberById.get(id);
      if (m) working[m.clinic ? "clinic" : "general"].push(id);
    }

    // 전역 면제: 전역일 1개월 전부터(전역일이 지난 뒤 포함) 순번에서 완전히 빠짐 — 면제 기록 또는 전역일로 판단
    const exempt = new Set<number>(day.exempt ?? []);
    for (const m of members) if (m.dischargeDate && day.date >= dischargeRange(m.dischargeDate).start) exempt.add(m.id);
    for (const id of exempt) for (const pool of ["general", "clinic", "driver"] as RotPool[]) passed[pool].push(id);

    // 출근 불가 사유 (운전 지정자는 출근하므로, 전역 면제자는 순번에서 빠지므로 제외 목록에서 뺌)
    const unavailable: Record<number, string> = {};
    for (const id of day.excluded) if (!designated.includes(id) && !exempt.has(id)) unavailable[id] = "제외(휴가·부상·교육 등)";
    return { plan, seats, working, passed, unavailable };
  });

  // ── ② 순번표별로 한 달치를 한꺼번에 돌리기 ──
  const poolMembers: Record<RotPool, RotMember[]> = {
    general: members.filter((m) => !m.clinic),
    clinic: members.filter((m) => m.clinic),
    driver: members.filter((m) => m.driver),
  };
  const rotation = {} as Record<RotPool, RotResult>;
  for (const pool of ["general", "clinic", "driver"] as RotPool[]) {
    const inPool = new Set(poolMembers[pool].map((m) => m.id));
    const r = planRotation(
      poolMembers[pool],
      state[pool].log,
      state[pool].cycle,
      preps.map((p) => ({
        date: p.plan.date,
        needed: p.seats[pool].length,
        working: p.working[pool].filter((id) => inPool.has(id)),
        passed: p.passed[pool],
        unavailable: p.unavailable,
      })),
    );
    rotation[pool] = r;
    // 뽑힌 사람을 날짜별로 정리: 진료실·운전은 자리까지 순서대로, 일반은 동 미배정(null)
    for (const p of preps) {
      const picked = r.picks.filter((x) => x.date === p.plan.date);
      picked.forEach((x, i) => p.plan.picks.push({ memberId: x.memberId, pool, postId: pool === "general" ? null : (p.seats[pool][i] ?? null) }));
      p.plan.shortage[pool] = r.shortage[p.plan.date] ?? 0;
    }
  }
  return { days: preps.map((p) => p.plan), rotation };
}
