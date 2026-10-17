import assert from "node:assert";
import { nextRegular, regularSchedule } from "../../src/lib/regular-leave";
// 전입일 + 6주마다 2박3일, 14번, 위로는 정기 시작 2주 뒤
const s = regularSchedule("2026-01-01");
assert.strictEqual(s.length, 14);
assert.deepStrictEqual(s[0], { n: 1, start: "2026-02-12", end: "2026-02-14", comfort: "2026-02-26" });
assert.strictEqual(s[1].start, "2026-03-26");
console.log("✔ 전입일 + 42일마다 정기 2박3일 14번, 위로는 정기 시작 + 14일");
// 다음 정기: 진행 중이면 그 휴가, 모두 지나면 null
assert.strictEqual(nextRegular("2026-01-01", "2026-02-13")?.n, 1);
assert.strictEqual(nextRegular("2026-01-01", "2026-02-15")?.n, 2);
assert.strictEqual(nextRegular("2026-01-01", "2030-01-01"), null);
console.log("✔ 다음 정기 (진행 중 포함 / 모두 지나면 없음)");
