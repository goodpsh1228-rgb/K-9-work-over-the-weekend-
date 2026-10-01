import assert from "node:assert";
import { defaultDischarge, nextPromotion, promotionDates, rankOn } from "../../src/lib/promotion";
// 예시: 3월 10일 입대
assert.deepStrictEqual(promotionDates("2025-03-10"), { 일병: "2025-06-01", 상병: "2025-12-01", 병장: "2026-06-01" });
assert.strictEqual(defaultDischarge("2025-03-10"), "2026-12-09");
console.log("✔ 3/10 입대 → 일병 6/1, 상병 12/1, 병장 다음 해 6/1, 전역 다음 해 12/9");
assert.strictEqual(rankOn("2025-03-10", "2025-05-31"), "이병");
assert.strictEqual(rankOn("2025-03-10", "2025-06-01"), "일병");
assert.strictEqual(rankOn("2025-03-10", "2025-11-30"), "일병");
assert.strictEqual(rankOn("2025-03-10", "2025-12-01"), "상병");
assert.strictEqual(rankOn("2025-03-10", "2026-06-01"), "병장");
console.log("✔ 진급일 경계 (전날/당일)");
// 연말 입대: 11/20 → 다음 해 2/1 일병, 8/1 상병, 그다음 해 2/1 병장
assert.deepStrictEqual(promotionDates("2025-11-20"), { 일병: "2026-02-01", 상병: "2026-08-01", 병장: "2027-02-01" });
// 1일 입대도 입대 달은 제외
assert.strictEqual(promotionDates("2025-03-01").일병, "2025-06-01");
assert.deepStrictEqual(nextPromotion("2025-03-10", "2025-10-01"), { rank: "상병", date: "2025-12-01" });
assert.strictEqual(nextPromotion("2025-03-10", "2026-10-01"), null);
console.log("✔ 해 넘김·1일 입대·다음 진급"); console.log("ALL OK");
