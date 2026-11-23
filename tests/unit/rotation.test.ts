import assert from "node:assert";
import { planRotation, compareMembers, type RotMember, type RotLogRow, type RotDay } from "../../src/lib/rotation";

// 기수 숫자가 작을수록 높은 기수. id 1=기수10(최고참) … 5=기수50
const M = (id: number, cohort: number | null, enlist: string | null = null): RotMember => ({ id, cohort, enlistDate: enlist });
const five = [M(1, 10), M(2, 20), M(3, 30), M(4, 40), M(5, 50)];
const day = (date: string, needed: number, working: number[] = [], unavailable: Record<number, string> = {}): RotDay =>
  ({ date, needed, working, unavailable });
const ids = (r: ReturnType<typeof planRotation>, date?: string) =>
  r.picks.filter((p) => !date || p.date === date).map((p) => p.memberId);

// 1) 정렬: 높은 기수 먼저, 기수 같으면 입대일 빠른 사람, 기수 없으면 맨 뒤
assert.deepStrictEqual(
  [M(9, null), M(3, 30, "2025-02-01"), M(2, 30, "2025-01-01"), M(1, 10)].sort(compareMembers).map((m) => m.id),
  [1, 2, 3, 9],
);

// 2) 기본 회전: 높은 기수부터 한 줄로
let r = planRotation(five, [], 1, [day("2026-12-05", 2), day("2026-12-06", 2)]);
assert.deepStrictEqual(ids(r, "2026-12-05"), [1, 2]);
assert.deepStrictEqual(ids(r, "2026-12-06"), [3, 4]);

// 3) 달을 넘어 이어짐: 앞에서 1~4가 근무했으면 다음 달은 5부터, 그다음 새 바퀴(1)
const log: RotLogRow[] = [1, 2, 3, 4].map((id) => ({ memberId: id, dutyDate: "2026-12-06", cycle: 1, kind: "served", repaid: false }));
r = planRotation(five, log, 1, [day("2027-01-02", 2)]);
assert.deepStrictEqual(ids(r), [5, 1]);
assert.strictEqual(r.cycle, 2); // 한 바퀴 다 돌아 2바퀴째
assert.deepStrictEqual(r.picks.map((p) => p.cycle), [1, 2]);

// 4) 한 바퀴가 끝나기 전에는 같은 사람이 두 번 걸리지 않음
r = planRotation(five, [], 1, [day("a", 1), day("b", 1), day("c", 1), day("d", 1), day("e", 1)]);
assert.deepStrictEqual(ids(r), [1, 2, 3, 4, 5]);

// 5) 건너뜀 + 빚: 순번인 2가 휴가 → 3이 대신 근무, 2는 빚
r = planRotation(five, [], 1, [day("2026-12-05", 2, [], { 2: "휴가" })]);
assert.deepStrictEqual(ids(r), [1, 3]);
assert.deepStrictEqual(r.skips.map((s) => [s.memberId, s.reason]), [[2, "휴가"]]);

// 6) 빚 우선: 다음 근무일에 2가 출근 가능해지면 일반 순번(4)보다 먼저 배정, 빚이 갚아짐
const log6: RotLogRow[] = [
  { memberId: 1, dutyDate: "d1", cycle: 1, kind: "served", repaid: false },
  { memberId: 2, dutyDate: "d1", cycle: 1, kind: "skipped", reason: "휴가", repaid: false },
  { memberId: 3, dutyDate: "d1", cycle: 1, kind: "served", repaid: false },
];
r = planRotation(five, log6, 1, [day("d2", 1)]);
assert.deepStrictEqual(ids(r), [2]);
assert.strictEqual(r.picks[0].viaDebt, true);
assert.deepStrictEqual(r.repaidDebts, [{ memberId: 2, skippedDate: "d1" }]);
// 빚이 있어도 그날 출근 불가면 아직 못 갚고 일반 순번(4)이 근무 — 빚은 유지
r = planRotation(five, log6, 1, [day("d2", 1, [], { 2: "교육" })]);
assert.deepStrictEqual(ids(r), [4]);
assert.strictEqual(r.repaidDebts.length, 0);

// 7) 자발 출근(B): 희망 확정자는 이번 바퀴 근무로 인정 → 같은 바퀴에서는 순번에 안 걸림
r = planRotation(five, [], 1, [day("x", 2, [1]), day("y", 2)]);
assert.deepStrictEqual(ids(r, "x"), [2, 3]);
assert.deepStrictEqual(ids(r, "y"), [4, 5]); // 1은 이미 인정됨
assert.deepStrictEqual(r.volunteers.map((v) => v.memberId), [1]);
assert.strictEqual(r.skips.length, 0);
// 같은 바퀴에서 여러 번 자원해도 인정은 1회(기록도 1건)
r = planRotation(five, [], 1, [day("x", 0, [1]), day("y", 0, [1])]);
assert.strictEqual(r.volunteers.length, 1);
// 빚이 있는 사람이 자원하면 빚도 갚아짐
const log7: RotLogRow[] = [{ memberId: 2, dutyDate: "d1", cycle: 1, kind: "skipped", reason: "휴가", repaid: false }];
r = planRotation(five, log7, 1, [day("d2", 1, [2])]);
assert.deepStrictEqual(r.repaidDebts, [{ memberId: 2, skippedDate: "d1" }]);
assert.deepStrictEqual(ids(r), [1]); // 2는 자원으로 근무 중이라 순번 배정은 1번

// 8) 후보가 모자라면 채운 만큼만, 인원 부족 보고
r = planRotation([M(1, 10), M(2, 20)], [], 1, [day("z", 3, [], { 2: "휴가" })]);
assert.deepStrictEqual(ids(r), [1]);
assert.strictEqual(r.shortage["z"], 2);

// 9) 같은 날 한 사람이 두 자리를 가지지 않음 (바퀴가 넘어가도)
r = planRotation([M(1, 10), M(2, 20)], [], 1, [day("w", 3)]);
assert.deepStrictEqual(ids(r), [1, 2]);
assert.strictEqual(r.shortage["w"], 1);

// 10) 기수 미입력자는 맨 뒤
r = planRotation([M(7, null), M(1, 10), M(2, 20)], [], 1, [day("q", 3)]);
assert.deepStrictEqual(ids(r), [1, 2, 7]);

console.log("ALL OK");

// 11) passed: 그날 조용히 빠짐 — 빚도 근무 인정도 없고, 다음 근무일에는 순번이 그대로 돌아옴
r = planRotation(five, [], 1, [{ date: "p1", needed: 2, working: [], unavailable: {}, passed: [1] }, day("p2", 1)]);
assert.deepStrictEqual(ids(r, "p1"), [2, 3]);
assert.deepStrictEqual(ids(r, "p2"), [1]);
assert.strictEqual(r.skips.length, 0);
assert.strictEqual(r.volunteers.length, 0);
console.log("ALL OK");
