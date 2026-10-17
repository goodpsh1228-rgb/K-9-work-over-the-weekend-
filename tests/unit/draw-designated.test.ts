import assert from "node:assert";
import { randomInt } from "node:crypto";
import { runDraw, type DrawInput } from "../../src/lib/draw";
const rng = (n: number) => randomInt(n);
// 자리: 진료실(1) 2명, 동 3곳 5명, 주말 운전(8) 1명
const POSTS: DrawInput["posts"] = [{ id: 1, pool: "clinic", required: 2 }, { id: 2, pool: "general", required: 2 }, { id: 3, pool: "general", required: 3 }, { id: 8, pool: "driver", required: 1 }];
// 일반 20명 + 운전병 3명(300·301·302). 운전 지정자는 members 에서 빠진 상태로 designated 에만 들어감(실제 서버와 동일)
const base = (designated: number[], drivers = [300, 301, 302]): DrawInput => ({
  posts: POSTS,
  designated,
  members: [
    ...[...Array(2)].map((_, i) => ({ id: 100 + i, pool: "clinic" as const })),
    ...[...Array(20)].map((_, i) => ({ id: 200 + i, pool: "general" as const })),
    ...drivers.filter((id) => !designated.includes(id)).map((id) => ({ id, pool: "general" as const, driver: true })),
  ],
  responses: new Map(),
});
const driverRows = (r: ReturnType<typeof runDraw>) => r.assignments.filter((a) => a.postId === 8);
const workRows = (r: ReturnType<typeof runDraw>) => r.assignments.filter((a) => a.postId !== 8);

for (let n = 0; n < 300; n++) {
  // ① 운전 지정자는 주말 운전 자리를 먼저 채우고, 동·진료실에는 절대 들어가지 않음 (희망해도, 차출 풀에 있어도)
  const inp = base([301]);
  inp.responses = new Map([[302, { choice: "want" as const, postId: 2 }]]);
  const r = runDraw(inp, rng);
  assert.deepStrictEqual(driverRows(r).map((a) => a.memberId), [301]);
  assert.ok(!workRows(r).some((a) => a.memberId === 301), "운전 지정자가 동·진료실에 배정됨");
  assert.strictEqual(r.shortage.driver, 0);
}
// ② 지정자가 정원보다 많으면 정원만큼만 운전 자리, 나머지 지정자도 동·진료실에는 안 들어감(입력에 없으므로)
let r = runDraw(base([300, 301]), rng);
assert.strictEqual(driverRows(r).length, 1); assert.ok([300, 301].includes(driverRows(r)[0].memberId));
assert.ok(!workRows(r).some((a) => a.memberId === 300 || a.memberId === 301));
// ③ 지정자가 없으면 기존 규칙(운전 희망 우선 → 나머지 운전병 랜덤) 그대로
const inp3 = base([]); inp3.driveWants = new Set([302]);
r = runDraw(inp3, rng); assert.deepStrictEqual(driverRows(r).map((a) => a.memberId), [302]); assert.strictEqual(driverRows(r)[0].source, "wanted");
// ④ 운전 자리가 2명이고 지정자 1명이면 지정자 + 운전병 중 1명(지정자는 중복 없음)
const inp4 = base([300]); inp4.posts = inp4.posts.map((p) => (p.id === 8 ? { ...p, required: 2 } : p));
for (let n = 0; n < 100; n++) { r = runDraw(inp4, rng); const ids = driverRows(r).map((a) => a.memberId); assert.strictEqual(ids.length, 2); assert.strictEqual(new Set(ids).size, 2); assert.ok(ids.includes(300)); }
// ⑤ 지정자만 있고 운전병이 더 없어도 정원이 1이면 부족 0 / 정원 2면 운전 부족 1
const inp5 = base([300], [300]); inp5.posts = inp5.posts.map((p) => (p.id === 8 ? { ...p, required: 2 } : p));
r = runDraw(inp5, rng); assert.strictEqual(driverRows(r).length, 1); assert.strictEqual(r.shortage.driver, 1);
console.log("ALL OK");
