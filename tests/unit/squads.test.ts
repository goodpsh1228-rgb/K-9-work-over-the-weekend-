import assert from "node:assert";
import { dotsRange, effectiveSquad, peakOverlap, pickFirstBoarding, spansOverlap } from "../../src/lib/squads";
const mk = (id: number, cohort: number | null) => ({ id, cohort });
// 높은 기수(작은 숫자)부터 9명
const people = [mk(1, 877), mk(2, 866), mk(3, 870), mk(4, null), ...Array.from({ length: 10 }, (_, i) => mk(10 + i, 880 + i))];
const top = pickFirstBoarding(people, "2026-10-07");
assert.strictEqual(top.length, 9);
assert.deepStrictEqual(top.slice(0, 3).map((p) => p.id), [2, 3, 1]); // 866, 870, 877 순
assert.ok(!top.some((p) => p.id === 4)); // 기수 없는 사람은 제외
console.log("✔ 높은 기수(작은 숫자) 순 9명, 기수 미입력 제외");
// 컷에 걸린 같은 기수: 날짜가 같으면 항상 같은 사람, 날짜가 바뀌면 다를 수 있음
const tie = [mk(1, 800), mk(2, 800), mk(3, 800), mk(4, 800), mk(5, 800), mk(6, 800), mk(7, 800), mk(8, 800), mk(9, 801), mk(10, 801), mk(11, 801), mk(12, 801)];
const a1 = pickFirstBoarding(tie, "2026-10-07").map((p) => p.id).sort((x, y) => x - y);
const a2 = pickFirstBoarding(tie, "2026-10-07").map((p) => p.id).sort((x, y) => x - y);
assert.deepStrictEqual(a1, a2);
assert.deepStrictEqual(a1.slice(0, 8), [1, 2, 3, 4, 5, 6, 7, 8]); // 800기 8명은 전원 포함
assert.strictEqual(a1.length, 9);
const picks = new Set(Array.from({ length: 30 }, (_, i) => pickFirstBoarding(tie, `2026-11-${String(i + 1).padStart(2, "0")}`).find((p) => p.cohort === 801)!.id));
assert.ok(picks.size > 1); // 801기 4명 중 1명을 뽑을 때 날짜에 따라 다른 사람이 뽑힘(무작위)
console.log("✔ 컷에 걸린 같은 기수는 날짜별 고정 무작위 (같은 날 새로고침해도 동일, 날짜마다 다름)");
assert.strictEqual(pickFirstBoarding([mk(1, 5), mk(2, 6)], "x").length, 2); // 9명보다 적으면 있는 만큼
assert.strictEqual(effectiveSquad(null, true), "진료반"); assert.strictEqual(effectiveSquad("훈련반", true), "훈련반"); assert.strictEqual(effectiveSquad(null, false), null);
console.log("✔ 반 표시: 비어 있으면 진료반 여부로");
assert.ok(spansOverlap({ start: "2026-08-12", end: "2026-08-16" }, { start: "2026-08-16", end: "2026-08-20" }));
assert.ok(!spansOverlap({ start: "2026-08-12", end: "2026-08-15" }, { start: "2026-08-16", end: "2026-08-20" }));
assert.deepStrictEqual(peakOverlap([{ start: "2026-08-12", end: "2026-08-16" }, { start: "2026-08-14", end: "2026-08-18" }, { start: "2026-08-20", end: "2026-08-21" }]), { date: "2026-08-14", count: 2 });
assert.strictEqual(dotsRange("2026-08-12", "2026-08-16"), "8.12~8.16"); assert.strictEqual(dotsRange("2026-08-12", "2026-08-12"), "8.12");
console.log("✔ 휴가 겹침(경계일 포함), 가장 많이 겹친 날, 8.12~8.16 표기"); console.log("ALL OK");
