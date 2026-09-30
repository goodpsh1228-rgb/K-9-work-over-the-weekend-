import assert from "node:assert";
import { addMonths } from "../../src/lib/kst";
import { dischargeRange, isAbsenceKind, KIND_LABEL } from "../../src/lib/absence-kinds";
assert.strictEqual(addMonths("2026-11-15", -1), "2026-10-15");
assert.strictEqual(addMonths("2027-01-10", -1), "2026-12-10"); // 해 넘김
assert.strictEqual(addMonths("2027-03-31", -1), "2027-02-28"); // 없는 날짜 → 그 달 마지막 날
assert.strictEqual(addMonths("2028-03-31", -1), "2028-02-29"); // 윤년
assert.deepStrictEqual(dischargeRange("2026-12-05"), { start: "2026-11-05", end: "2026-12-05" });
assert.ok(isAbsenceKind("outing") && isAbsenceKind("discharge") && !isAbsenceKind("vacation"));
assert.strictEqual(KIND_LABEL.outing, "외출·면회");
console.log("ALL OK");
