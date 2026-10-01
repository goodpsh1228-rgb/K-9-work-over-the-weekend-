import assert from "node:assert";
import { isValidSubkind, leaveSummary, monthGrid, remainingWorkdays, serviceStats, shiftMonth } from "../../src/lib/leave";
// 스크린샷 예시: 입대 2025-03-10, 전역 2026-12-09, 오늘 2026-10-01 → 640 / 571 / 69
assert.deepStrictEqual(serviceStats("2025-03-10", "2026-12-09", "2026-10-01"), { total: 640, served: 571, remaining: 69 });
console.log("✔ 복무일 640 / 571 / 69");
// 2026-10-01(목) ~ 10-09 전날까지: 10/1 목, 10/2 금, 10/5 월 대체공휴일 ✗, 10/6 화, 10/7 수, 10/8 목 → 5일 (10/3·4 주말 ✗)
assert.strictEqual(remainingWorkdays("2026-10-01", "2026-10-09", []), 5);
// 10/6~10/7 정기휴가 → 3일, 외출은 빼지 않음
assert.strictEqual(remainingWorkdays("2026-10-01", "2026-10-09", [
  { kind: "regular", subkind: null, start_date: "2026-10-06", end_date: "2026-10-07" },
  { kind: "outing", subkind: null, start_date: "2026-10-08", end_date: "2026-10-08" },
]), 3);
assert.strictEqual(remainingWorkdays("2026-10-01", "2026-10-09", [], new Set(["2026-10-08"])), 4);
console.log("✔ 실제 남은 출근일: 주말·공휴일·휴가·관리자 추가 공휴일 제외, 외출은 포함");
const s = leaveSummary([
  { kind: "reward", subkind: "mileage", start_date: "2026-10-06", end_date: "2026-10-08" },
  { kind: "annual", subkind: "sergeant", start_date: "2026-11-01", end_date: "2026-11-02" },
  { kind: "visit", subkind: null, start_date: "2026-10-10", end_date: "2026-10-10" },
]);
assert.deepStrictEqual(s.quotas.map((q) => `${q.label}:${q.used}/${q.quota}`), ["마일리지 포상:3/12", "가점 포상:0/6", "일·이병 연가:0/10", "상병 연가:0/8", "병장 연가:2/10"]);
assert.strictEqual(s.others.find((o) => o.label === "면회")!.value, "1회");
console.log("✔ 한도: 마일리지 12·가점 6, 연가 10·8·10, 면회 횟수");
assert.ok(isValidSubkind("reward", "merit") && !isValidSubkind("reward", null) && isValidSubkind("regular", null) && !isValidSubkind("regular", "merit"));
const g = monthGrid("2026-10"); // 2026-10-01 = 목요일 → 첫 줄 앞 4칸 비움
assert.deepStrictEqual(g[0], [null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
assert.strictEqual(g.flat().filter(Boolean).length, 31);
assert.strictEqual(shiftMonth("2026-12", 1), "2027-01"); assert.strictEqual(shiftMonth("2026-01", -1), "2025-12");
console.log("✔ 달력 칸·달 이동"); console.log("ALL OK");
