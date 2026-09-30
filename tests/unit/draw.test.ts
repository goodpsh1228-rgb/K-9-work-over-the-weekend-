import assert from "node:assert";
import { randomInt } from "node:crypto";
import { runDraw, shuffle, type DrawInput } from "../../src/lib/draw";
const rng = (n: number) => randomInt(n);
// 기본 자리: 진료실(1) 2명, 관리1동(2) 1, 관리2동(3) 3, 관리3동(4) 4, 훈련동(5) 4, 종모견동(6) 2, 분만실(7) 1 = 일반 15
const POSTS = [[1,"clinic",2],[2,"general",1],[3,"general",3],[4,"general",4],[5,"general",4],[6,"general",2],[7,"general",1]].map(([id,pool,required]) => ({ id: id as number, pool: pool as "clinic"|"general", required: required as number }));
const QUOTA: Record<number, number> = Object.fromEntries(POSTS.map(p => [p.id, p.required]));
function mk(clinic: number, general: number, resp: [number, "want"|"decline", number|null][] = []): DrawInput {
  const members: DrawInput["members"] = [
    ...[...Array(clinic)].map((_, i) => ({ id: 100 + i, pool: "clinic" as const })),
    ...[...Array(general)].map((_, i) => ({ id: 200 + i, pool: "general" as const })),
  ];
  return { posts: POSTS, members, responses: new Map(resp.map(([id, choice, postId]) => [id, { choice, postId }])) };
}
function check(input: DrawInput, r: ReturnType<typeof runDraw>) {
  const ids = r.assignments.map(a => a.memberId);
  assert.strictEqual(new Set(ids).size, ids.length, "중복 배정");
  const memberPool = new Map(input.members.map(m => [m.id, m.pool]));
  const postPool = new Map(input.posts.map(p => [p.id, p.pool]));
  for (const a of r.assignments) {
    assert.ok(memberPool.has(a.memberId), "입력에 없는 사람(제외자 등) 배정");
    // 차출은 반드시 소속 풀 안에서만. 희망 확정은 진료반이 일반 동으로 가는 것만 허용
    if (a.source === "drafted") assert.strictEqual(memberPool.get(a.memberId), postPool.get(a.postId), "차출 풀 섞임");
    else assert.ok(memberPool.get(a.memberId) === postPool.get(a.postId) || (memberPool.get(a.memberId) === "clinic" && postPool.get(a.postId) === "general"), "일반 인원이 진료실 확정");
    const resp = input.responses.get(a.memberId);
    if (a.source === "wanted") assert.ok(resp?.choice === "want" && resp.postId === a.postId, "희망 확정인데 희망 동이 다름");
    else {
      // 유효한 희망(일반 인원의 진료실 희망은 무효)을 한 사람은 차출되면 안 됨
      const validWant = resp?.choice === "want" && !(postPool.get(resp.postId!) === "clinic" && memberPool.get(a.memberId) !== "clinic");
      assert.ok(!validWant, "희망자가 차출됨");
    }
  }
  for (const [pid, q] of Object.entries(QUOTA)) assert.ok(r.assignments.filter(a => a.postId === Number(pid)).length <= q, "정원 초과 배정");
  for (const id of r.rested) assert.ok(!ids.includes(id) && input.responses.get(id)?.choice === "want", "쉬는 사람 오류");
}
const count = (r: ReturnType<typeof runDraw>, pool: string) => r.assignments.filter((a) => POSTS.find(p => p.id === a.postId)!.pool === pool).length;

// ① 희망 < 정원: 희망자 전원 확정 + 나머지 차출, 동별 정원 1·3·4·4·2·1 정확
let inp = mk(6, 30, [[200,"want",3],[201,"want",3],[202,"decline",null],[100,"want",1]]);
let r = runDraw(inp, rng); check(inp, r);
assert.deepStrictEqual(r.assignments.filter(a => a.source === "wanted").map(a => a.memberId).sort(), [100, 200, 201]);
for (const p of POSTS) assert.strictEqual(r.assignments.filter(a => a.postId === p.id).length, p.required);
assert.deepStrictEqual(r.shortage, { clinic: 0, general: 0 }); assert.strictEqual(count(r, "general"), 15);
console.log("✔ ① 희망<정원: 희망 전원 확정, 차출로 15명·동 정원 정확");

// ② 한 동 희망 초과: 관리1동(정원1)에 3명 희망 → 1명 확정, 2명 쉼(차출 안 됨)
inp = mk(2, 20, [[200,"want",2],[201,"want",2],[202,"want",2]]);
r = runDraw(inp, rng); check(inp, r);
assert.strictEqual(r.assignments.filter(a => a.postId === 2 && a.source === "wanted").length, 1);
assert.strictEqual(r.rested.length, 2); console.log("✔ ② 동 희망 초과 → 1명 확정, 2명 쉼");

// ③ 희망 = 정원: 모든 동을 정확히 희망으로 채움 → 차출 없음
const exact: [number,"want",number][] = []; let id = 200;
for (const p of POSTS.filter(p => p.pool === "general")) for (let i = 0; i < p.required; i++) exact.push([id++, "want", p.id]);
inp = mk(2, 25, [...exact, [100,"want",1],[101,"want",1]]);
r = runDraw(inp, rng); check(inp, r);
assert.strictEqual(r.assignments.filter(a => a.source === "drafted").length, 0); assert.strictEqual(r.rested.length, 0);
console.log("✔ ③ 희망=정원 → 전원 희망 확정, 차출 없음");

// ④ 풀 부족: 진료반 1명뿐(정원 2), 일반 10명뿐(정원 15) → 부족 1 / 5
inp = mk(1, 10); r = runDraw(inp, rng); check(inp, r);
assert.deepStrictEqual(r.shortage, { clinic: 1, general: 5 }); assert.strictEqual(r.assignments.length, 11);
console.log("✔ ④ 풀 부족 → 인원 부족 진료실 1, 일반 5");

// ⑤ 희망자가 너무 많아 쉬는 사람이 생기고, 그 때문에 차출 풀이 모자라도 떨어진 희망자는 차출하지 않음
inp = mk(0, 6, [[200,"want",2],[201,"want",2],[202,"want",2],[203,"want",2],[204,"want",2],[205,"want",2]]);
r = runDraw(inp, rng); check(inp, r);
assert.strictEqual(r.assignments.length, 1); assert.strictEqual(r.rested.length, 5); assert.strictEqual(r.shortage.general, 14);
console.log("✔ ⑤ 떨어진 희망자는 빈자리가 있어도 차출 안 됨");

// ⑥ 진료반은 일반 추첨에 안 들어감 (진료반 10명, 일반 0명 → 일반 부족 15)
inp = mk(10, 0); r = runDraw(inp, rng); check(inp, r);
assert.strictEqual(count(r, "clinic"), 2); assert.strictEqual(r.shortage.general, 15);
console.log("✔ ⑥ 뽑히지 않은 진료반은 일반 추첨에 안 들어감");

// ⑦ 공정성(대략): 미응답과 미희망이 같은 확률로 차출되는지 — 일반 30명(10명 미희망), 20000회
let dec = 0, non = 0;
for (let t = 0; t < 20000; t++) {
  const resp: [number,"decline",null][] = [...Array(10)].map((_, i) => [200 + i, "decline", null]);
  const rr = runDraw(mk(0, 30, resp), rng);
  for (const a of rr.assignments) { if (a.memberId < 210) dec++; else non++; }
}
const pDec = dec / (20000 * 10), pNon = non / (20000 * 20);
assert.ok(Math.abs(pDec - 0.5) < 0.01 && Math.abs(pNon - 0.5) < 0.01, `${pDec} ${pNon}`);
console.log(`✔ ⑦ 차출 확률 미희망 ${(pDec*100).toFixed(1)}% · 미응답 ${(pNon*100).toFixed(1)}% (기대 50%)`);

// ⑧ 동 배정이 랜덤인지: 차출된 한 사람이 각 동에 들어가는 비율 ≈ 정원/15
const hits: Record<number, number> = {};
for (let t = 0; t < 20000; t++) { const rr = runDraw(mk(0, 15), rng); const a = rr.assignments.find(a => a.memberId === 200)!; hits[a.postId] = (hits[a.postId] ?? 0) + 1; }
for (const p of POSTS.filter(p => p.pool === "general")) assert.ok(Math.abs(hits[p.id] / 20000 - p.required / 15) < 0.015, `동 ${p.id}`);
console.log("✔ ⑧ 차출 인원의 동 배정 비율 ≈ 정원 비율 (랜덤)");

// ⑨ shuffle 균등성: 3개 순열 6가지가 고르게
const perm: Record<string, number> = {}; for (let t = 0; t < 60000; t++) { const k = shuffle([1,2,3], rng).join(""); perm[k] = (perm[k] ?? 0) + 1; }
assert.strictEqual(Object.keys(perm).length, 6); for (const v of Object.values(perm)) assert.ok(Math.abs(v / 60000 - 1/6) < 0.01);
console.log("✔ ⑨ 섞기 균등");
// ⑩ 진료반이 일반 동 희망: 100번이 관리 2동(3) 희망 → 관리 2동 희망 확정, 진료실 차출에서 빠짐
inp = mk(3, 20, [[100,"want",3]]);
r = runDraw(inp, rng); check(inp, r);
assert.deepStrictEqual(r.assignments.find(a => a.memberId === 100), { memberId: 100, postId: 3, source: "wanted" });
assert.strictEqual(r.assignments.filter(a => a.memberId === 100).length, 1);
assert.deepStrictEqual(r.assignments.filter(a => a.postId === 1).map(a => a.memberId).sort(), [101, 102]);
console.log("✔ ⑩ 진료반의 일반 동 희망 → 그 동 확정, 진료실 차출 제외(하루 한 곳)");
// ⑪ 진료반 2명만 있고 1명이 일반 동 희망 → 진료실 부족 1
inp = mk(2, 20, [[100,"want",2]]);
r = runDraw(inp, rng); check(inp, r);
assert.strictEqual(r.shortage.clinic, 1); console.log("✔ ⑪ 진료반이 동으로 빠지면 진료실 부족 표시");
// ⑫ 진료반과 일반이 같은 동(관리 1동, 정원 1)을 희망 → 한 명만 확정, 나머지 쉼 (같은 조건)
let clinicWins = 0;
for (let t = 0; t < 4000; t++) { const rr = runDraw(mk(3, 20, [[100,"want",2],[200,"want",2]]), rng); if (rr.assignments.some(a => a.memberId === 100 && a.postId === 2)) clinicWins++; }
assert.ok(Math.abs(clinicWins / 4000 - 0.5) < 0.04, String(clinicWins)); console.log(`✔ ⑫ 같은 동 희망 시 진료반·일반 동일 확률 (${(clinicWins/40).toFixed(1)}%)`);
// ⑬ 일반 인원의 진료실 희망은 무시 → 일반 차출 풀에 남음
inp = mk(2, 20, [[200,"want",1]]);
r = runDraw(inp, rng); check(inp, r);
assert.ok(!r.assignments.some(a => a.memberId === 200 && a.postId === 1)); console.log("✔ ⑬ 일반 인원의 진료실 희망은 무시");
console.log("ALL OK");
