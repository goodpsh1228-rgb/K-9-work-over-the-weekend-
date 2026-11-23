import assert from "node:assert";
import { planMonth, type MDayInput, type MMember, type PoolState } from "../../src/lib/monthly-draw";

// 고정 난수(항상 0) → 섞기 결과가 일정해 테스트가 안정적
const rng = () => 0;
// 일반 인원 1~6(기수 10~60), 진료반 11·12, 운전병 6(일반 소속)
const gen = (id: number, driver = false): MMember => ({ id, cohort: id * 10, enlistDate: null, clinic: false, driver });
const clin = (id: number): MMember => ({ id, cohort: id * 10, enlistDate: null, clinic: true, driver: false });
const members: MMember[] = [gen(1), gen(2), gen(3), gen(4), gen(5), gen(6, true), clin(11), clin(12)];
const fresh: Record<"general" | "clinic" | "driver", PoolState> = { general: { cycle: 1, log: [] }, clinic: { cycle: 1, log: [] }, driver: { cycle: 1, log: [] } };
const POSTS = [
  { id: 100, pool: "clinic" as const, required: 1 },
  { id: 200, pool: "general" as const, required: 2 },
  { id: 300, pool: "general" as const, required: 1 },
  { id: 400, pool: "driver" as const, required: 1 },
];
const day = (date: string, extra: Partial<MDayInput> = {}): MDayInput => ({
  date, posts: POSTS, responses: new Map(), driveWants: new Set(), designated: [], excluded: new Set(), ...extra,
});
const picks = (p: ReturnType<typeof planMonth>, date: string, pool: string) =>
  p.days.find((d) => d.date === date)!.picks.filter((x) => x.pool === pool).map((x) => x.memberId);

// 1) 아무도 투표 안 함: 일반 3자리·진료실 1·운전 1 모두 순번 (높은 기수부터), 일반은 동 미배정
let p = planMonth([day("2026-12-05")], members, fresh, rng);
assert.deepStrictEqual(picks(p, "2026-12-05", "general"), [1, 2, 3]);
assert.ok(p.days[0].picks.filter((x) => x.pool === "general").every((x) => x.postId === null));
assert.deepStrictEqual(picks(p, "2026-12-05", "clinic"), [11]);
assert.strictEqual(p.days[0].picks.find((x) => x.pool === "clinic")!.postId, 100); // 진료실은 자리까지 확정
assert.deepStrictEqual(picks(p, "2026-12-05", "driver"), [6]);
assert.strictEqual(p.days[0].picks.find((x) => x.pool === "driver")!.postId, 400);

// 2) 달을 넘어 이어짐: 다음 날은 4, 5, 그다음 새 바퀴(1)… 한 바퀴 안에 같은 사람이 두 번 걸리지 않음
p = planMonth([day("2026-12-05"), day("2026-12-06")], members, fresh, rng);
assert.deepStrictEqual(picks(p, "2026-12-06", "general"), [4, 5, 6]);
assert.deepStrictEqual(picks(p, "2026-12-06", "clinic"), [12]);

// 3) 희망 확정: 3번이 동 200 희망 → 확정, 남은 자리만 순번. 3번은 이번 바퀴 근무로 인정
p = planMonth(
  [day("2026-12-05", { responses: new Map([[3, { choice: "want" as const, postId: 200 }]]) })],
  members, fresh, rng,
);
assert.deepStrictEqual(p.days[0].wanted.map((w) => [w.memberId, w.postId]), [[3, 200]]);
assert.deepStrictEqual(picks(p, "2026-12-05", "general"), [1, 2]);
assert.strictEqual(p.rotation.general.volunteers.length, 1);

// 4) 희망자가 정원 초과: 정원만큼만 확정, 떨어진 사람은 쉼(순번에서도 조용히 빠짐)
const wants = new Map([1, 2, 3].map((id) => [id, { choice: "want" as const, postId: 300 }])); // 정원 1에 3명
p = planMonth([day("2026-12-05", { responses: wants })], members, fresh, rng);
assert.strictEqual(p.days[0].wanted.filter((w) => w.postId === 300).length, 1);
assert.strictEqual(p.days[0].rested.length, 2);
const gp = picks(p, "2026-12-05", "general");
assert.ok(p.days[0].rested.every((id) => !gp.includes(id))); // 떨어진 희망자는 그날 차출되지 않음
assert.strictEqual(p.rotation.general.skips.length, 0); // 빚도 없음

// 5) 제외자: 순번에서 건너뛰고 빚, 대신 다음 사람이 근무
p = planMonth([day("2026-12-05", { excluded: new Set([1]) })], members, fresh, rng);
assert.deepStrictEqual(picks(p, "2026-12-05", "general"), [2, 3, 4]);
assert.deepStrictEqual(p.rotation.general.skips.map((s) => s.memberId), [1]);
// 다음 날 1번이 가능하면 빚 우선으로 가장 먼저 배정
p = planMonth([day("2026-12-05", { excluded: new Set([1]) }), day("2026-12-06")], members, fresh, rng);
assert.strictEqual(picks(p, "2026-12-06", "general")[0], 1);

// 6) 진료반은 진료실 순번에만 (일반 순번에 안 들어감), 일반 인원은 진료실에 안 들어감
p = planMonth([day("2026-12-05")], members, fresh, rng);
assert.ok(picks(p, "2026-12-05", "general").every((id) => id < 11));
assert.ok(picks(p, "2026-12-05", "clinic").every((id) => id >= 11));
// 진료반이 동을 희망해서 확정되면 그날 진료실 순번에서는 빠짐 (진료실은 12번이 대신)
p = planMonth([day("2026-12-05", { responses: new Map([[11, { choice: "want" as const, postId: 200 }]]) })], members, fresh, rng);
assert.deepStrictEqual(picks(p, "2026-12-05", "clinic"), [12]);
assert.ok(p.days[0].wanted.some((w) => w.memberId === 11 && w.postId === 200));

// 7) 운전 지정: 지정된 운전병이 주말 운전을 먼저 채우고, 운전 순번은 안 돌아감. 그날 동 순번 대상은 아님(출근 인정)
p = planMonth([day("2026-12-05", { designated: [6], excluded: new Set([6]) })], members, fresh, rng);
assert.ok(p.days[0].wanted.some((w) => w.memberId === 6 && w.pool === "driver"));
assert.deepStrictEqual(picks(p, "2026-12-05", "driver"), []);
assert.ok(!picks(p, "2026-12-05", "general").includes(6));
assert.strictEqual(p.rotation.general.skips.length, 0); // 운전 지정자는 빚이 생기지 않음

// 8) 후보 부족: 모두 제외면 인원 부족으로 보고
p = planMonth([day("2026-12-05", { excluded: new Set([1, 2, 3, 4, 5, 6]) })], members, fresh, rng);
assert.strictEqual(p.days[0].shortage.general, 3);

// 9) 전역 1개월 전부터 순번에서 완전히 빠짐 (빚 없음). 전역 12/20 → 11/20부터 면제
const leaving: MMember[] = members.map((m) => (m.id === 1 ? { ...m, dischargeDate: "2026-12-20" } : m));
p = planMonth([day("2026-11-10"), day("2026-12-05"), day("2026-12-26")], leaving, fresh, rng);
assert.ok(picks(p, "2026-11-10", "general").includes(1)); // 면제 전(11/20 이전)에는 평소처럼 순번
assert.ok(!picks(p, "2026-12-05", "general").includes(1)); // 면제 구간
assert.ok(!picks(p, "2026-12-26", "general").includes(1)); // 전역 뒤에도 빠짐
assert.strictEqual(p.rotation.general.skips.length, 0); // 빚 없음
// 면제 기록(exempt)만 있고 전역일 정보가 없어도 같은 처리 — 제외 목록에 있어도 빚이 생기지 않음
p = planMonth([day("2026-12-05", { excluded: new Set([1]), exempt: new Set([1]) })], members, fresh, rng);
assert.ok(!picks(p, "2026-12-05", "general").includes(1));
assert.strictEqual(p.rotation.general.skips.length, 0);
// 반대로 휴가로 제외된 사람은 지금처럼 건너뛰고 빚
p = planMonth([day("2026-12-05", { excluded: new Set([1]) })], members, fresh, rng);
assert.deepStrictEqual(p.rotation.general.skips.map((x) => x.memberId), [1]);
console.log("ALL OK");
