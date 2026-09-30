import assert from "node:assert";
import { isPromotionReminderDay, needsPromotionReminder } from "../../src/lib/rank";
// 10월(31일): 1~7일, 25~31일
for (const d of ["2026-10-01", "2026-10-07", "2026-10-25", "2026-10-31"]) assert.ok(isPromotionReminderDay(d), d);
for (const d of ["2026-10-08", "2026-10-15", "2026-10-24"]) assert.ok(!isPromotionReminderDay(d), d);
// 2월(28일): 22~28일 / 윤년 2월(29일): 23~29일 / 30일 달(11월): 24~30일
assert.ok(isPromotionReminderDay("2027-02-22") && !isPromotionReminderDay("2027-02-21"));
assert.ok(isPromotionReminderDay("2028-02-23") && !isPromotionReminderDay("2028-02-22"));
assert.ok(isPromotionReminderDay("2026-11-24") && !isPromotionReminderDay("2026-11-23"));
// 대상: 이병·일병·상병만
assert.ok(needsPromotionReminder("이병", "2026-10-01") && needsPromotionReminder("상병", "2026-10-31"));
assert.ok(!needsPromotionReminder("병장", "2026-10-01"));
assert.ok(!needsPromotionReminder(null, "2026-10-01")); // 미지정은 별도 안내
assert.ok(!needsPromotionReminder("일병", "2026-10-15"));
console.log("ALL OK");
