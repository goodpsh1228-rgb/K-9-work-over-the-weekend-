import assert from "node:assert";
import { escortPool } from "../../src/lib/escort-rule";

const W = (rows: [number, number | null][]) => rows.map(([id, cohort]) => ({ id, cohort }));
// 운전병 870기: 870기(같음)·865기(높음)는 대상, 875기(낮음)·기수 없음은 제외, 운전병 본인(id 1)은 제외
let r = escortPool([{ id: 1, cohort: 870 }], W([[1, 870], [2, 870], [3, 865], [4, 875], [5, null], [6, 800]]));
assert.strictEqual(r.refCohort, 870); assert.deepStrictEqual(r.pool.map((p) => p.id).sort(), [2, 3, 6]); assert.strictEqual(r.reason, null);
// 운전병이 여러 명이면 가장 높은 기수 기준(모두와 같거나 높음)
r = escortPool([{ id: 1, cohort: 870 }, { id: 9, cohort: 865 }], W([[2, 870], [3, 866], [4, 865], [5, 860]]));
assert.strictEqual(r.refCohort, 865); assert.deepStrictEqual(r.pool.map((p) => p.id).sort(), [4, 5]);
// 운전하는 사람이 없음 / 운전병 기수 없음 / 대상자 없음 → 이유와 함께 빈 목록
r = escortPool([], W([[2, 800]])); assert.strictEqual(r.pool.length, 0); assert.match(r.reason!, /운전하는 사람이 없습니다/);
r = escortPool([{ id: 1, cohort: null }], W([[2, 800]])); assert.strictEqual(r.pool.length, 0); assert.match(r.reason!, /기수가 입력되어 있지 않습니다/);
r = escortPool([{ id: 1, cohort: 800 }], W([[2, 801], [3, null]])); assert.strictEqual(r.pool.length, 0); assert.match(r.reason!, /운전병\(800기\)보다 기수가 같거나 높은 출근자가 없습니다/);
console.log("ALL OK");
