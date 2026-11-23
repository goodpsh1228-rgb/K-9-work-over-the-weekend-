// 한 달 차출 무작위 점검: 여러 시나리오를 돌려 규칙 위반이 없는지, 몇 달 이어 돌렸을 때 공평한지 확인
import assert from "node:assert";
import { planMonth, type MDayInput, type MMember, type PoolState, type RotPool } from "../../src/lib/monthly-draw";
import type { RotLogRow } from "../../src/lib/rotation";

let seed = 20261123;
const rnd = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
const POSTS = [
  { id: 1, pool: "clinic" as const, required: 2 },
  { id: 2, pool: "general" as const, required: 1 },
  { id: 3, pool: "general" as const, required: 3 },
  { id: 4, pool: "general" as const, required: 4 },
  { id: 5, pool: "general" as const, required: 4 },
  { id: 6, pool: "general" as const, required: 2 },
  { id: 7, pool: "general" as const, required: 1 },
  { id: 8, pool: "driver" as const, required: 1 },
];

function makeMembers(nGeneral: number, nClinic: number, nDriver: number): MMember[] {
  const out: MMember[] = [];
  for (let i = 1; i <= nGeneral; i++) out.push({ id: i, cohort: 800 + i, enlistDate: null, clinic: false, driver: i <= nDriver });
  for (let i = 1; i <= nClinic; i++) out.push({ id: 1000 + i, cohort: 900 + i, enlistDate: null, clinic: true, driver: false });
  return out;
}
const fresh = (): Record<RotPool, PoolState> => ({ general: { cycle: 1, log: [] }, clinic: { cycle: 1, log: [] }, driver: { cycle: 1, log: [] } });
const seedRng = () => (n: number) => rnd(n);

// ── 1) 무작위 시나리오 300번: 규칙 위반 없는지 ──
for (let t = 0; t < 300; t++) {
  const members = makeMembers(15 + rnd(40), 3 + rnd(6), 2 + rnd(5));
  const nDays = 1 + rnd(9);
  const days: MDayInput[] = [];
  for (let d = 0; d < nDays; d++) {
    const responses = new Map<number, { choice: "want" | "decline"; postId: number | null }>();
    const excluded = new Set<number>();
    const exempt = new Set<number>();
    for (const m of members) {
      const r = rnd(10);
      if (r === 0) excluded.add(m.id);
      else if (r === 1) { excluded.add(m.id); exempt.add(m.id); }
      else if (r <= 3) responses.set(m.id, { choice: "want", postId: m.clinic && rnd(2) ? 1 : 2 + rnd(6) });
      else if (r === 4) responses.set(m.id, { choice: "decline", postId: null });
    }
    days.push({
      date: `2026-12-${String(d + 1).padStart(2, "0")}`, posts: POSTS, responses,
      driveWants: new Set(members.filter((m) => m.driver && rnd(3) === 0).map((m) => m.id)),
      designated: rnd(4) === 0 ? members.filter((m) => m.driver).slice(0, 1).map((m) => m.id) : [],
      excluded, exempt,
    });
  }
  const plan = planMonth(days, members, fresh(), seedRng());
  const byId = new Map(members.map((m) => [m.id, m]));
  for (const dp of plan.days) {
    const input = days.find((x) => x.date === dp.date)!;
    const seen: Record<string, Set<number>> = { general: new Set(), clinic: new Set(), driver: new Set() };
    const perPost = new Map<number, number>();
    for (const w of dp.wanted) perPost.set(w.postId, (perPost.get(w.postId) ?? 0) + 1);
    for (const p of dp.picks) {
      const m = byId.get(p.memberId)!;
      assert.ok(!seen[p.pool].has(p.memberId), "같은 날 같은 순번표에서 한 사람이 두 번 뽑힘");
      seen[p.pool].add(p.memberId);
      assert.ok(!input.excluded.has(p.memberId), "제외자가 뽑힘");
      assert.ok(!input.exempt!.has(p.memberId), "전역 면제자가 뽑힘");
      if (p.pool === "general") assert.ok(!m.clinic, "진료반이 일반 순번에 뽑힘");
      if (p.pool === "clinic") assert.ok(m.clinic, "일반 인원이 진료실 순번에 뽑힘");
      if (p.pool === "driver") assert.ok(m.driver, "운전병이 아닌 사람이 운전 순번에 뽑힘");
      assert.ok(p.postId !== null, "자리 없이 뽑힘");
      perPost.set(p.postId!, (perPost.get(p.postId!) ?? 0) + 1);
    }
    for (const p of POSTS) assert.ok((perPost.get(p.id) ?? 0) <= p.required, `정원 초과 자리 ${p.id}`);
    // 부족이 0이면 모든 자리가 정확히 채워져야 함
    const short = dp.shortage.general + dp.shortage.clinic + dp.shortage.driver;
    const filled = [...perPost.values()].reduce((a, b) => a + b, 0);
    assert.strictEqual(filled + short, POSTS.reduce((s, p) => s + p.required, 0), "채운 수 + 부족 ≠ 정원");
  }
}
console.log("✔ 무작위 300 시나리오: 중복·제외자·풀 구분·정원·부족 계산 모두 정상");

// ── 2) 12달 이어 돌리기: 모두 항상 가능하면 순번이 공평(한 바퀴 안에서 차이 ≤ 1) ──
{
  const members = makeMembers(40, 6, 5);
  const state = fresh();
  const count = new Map<number, number>();
  for (let month = 0; month < 12; month++) {
    const days: MDayInput[] = [];
    for (let d = 0; d < 8; d++) days.push({ date: `2027-${String(month + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`, posts: POSTS, responses: new Map(), driveWants: new Set(), designated: [], excluded: new Set() });
    const plan = planMonth(days, members, state, seedRng());
    for (const pool of ["general", "clinic", "driver"] as RotPool[]) {
      const r = plan.rotation[pool];
      state[pool].cycle = r.cycle;
      const rows: RotLogRow[] = [
        ...r.picks.map((x): RotLogRow => ({ memberId: x.memberId, dutyDate: x.date, cycle: x.cycle, kind: "served", repaid: false })),
        ...r.volunteers.map((x): RotLogRow => ({ memberId: x.memberId, dutyDate: x.date, cycle: x.cycle, kind: "volunteered", repaid: false })),
        ...r.skips.map((x): RotLogRow => ({ memberId: x.memberId, dutyDate: x.date, cycle: x.cycle, kind: "skipped", reason: x.reason, repaid: false })),
      ];
      state[pool].log.push(...rows);
    }
    for (const d of plan.days) for (const p of d.picks.filter((x) => x.pool === "general")) count.set(p.memberId, (count.get(p.memberId) ?? 0) + 1);
  }
  const gen = members.filter((m) => !m.clinic).map((m) => count.get(m.id) ?? 0);
  const spread = Math.max(...gen) - Math.min(...gen);
  console.log(`✔ 12달 이어 돌리기(일반 40명): 한 사람당 근무 최소 ${Math.min(...gen)} ~ 최대 ${Math.max(...gen)}회 (차이 ${spread})`);
  assert.ok(spread <= 1, "모두 가능할 때 근무 횟수 차이가 1을 넘음");
}

// ── 3) 휴가로 건너뛴 사람은 빚을 갚을 때까지 앞 순번 우선, 결국 따라잡음 ──
{
  const members = makeMembers(30, 4, 3);
  const state = fresh();
  const owed = 7; // 7번이 첫 달 내내 휴가
  const days1: MDayInput[] = [];
  for (let d = 0; d < 6; d++) days1.push({ date: `2027-01-0${d + 1}`, posts: POSTS, responses: new Map(), driveWants: new Set(), designated: [], excluded: new Set([owed]) });
  let plan = planMonth(days1, members, state, seedRng());
  for (const pool of ["general", "clinic", "driver"] as RotPool[]) {
    const r = plan.rotation[pool];
    state[pool].cycle = r.cycle;
    state[pool].log.push(
      ...r.picks.map((x): RotLogRow => ({ memberId: x.memberId, dutyDate: x.date, cycle: x.cycle, kind: "served", repaid: false })),
      ...r.skips.map((x): RotLogRow => ({ memberId: x.memberId, dutyDate: x.date, cycle: x.cycle, kind: "skipped", reason: x.reason, repaid: false })),
    );
  }
  const debts = state.general.log.filter((l) => l.memberId === owed && l.kind === "skipped").length;
  assert.ok(debts >= 1, "휴가 중 순번이 지나갔는데 빚이 없음");
  const days2: MDayInput[] = [{ date: "2027-02-06", posts: POSTS, responses: new Map(), driveWants: new Set(), designated: [], excluded: new Set() }];
  plan = planMonth(days2, members, state, seedRng());
  assert.strictEqual(plan.days[0].picks.filter((p) => p.pool === "general")[0].memberId, owed, "빚 있는 사람이 다음 달 첫 순번이 아님");
  console.log(`✔ 휴가로 ${debts}번 건너뛴 사람은 복귀 후 첫 순번으로 우선 배정`);
}
console.log("ALL OK");
