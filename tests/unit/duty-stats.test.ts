import assert from "node:assert";
import { computeStats } from "../../src/lib/duty-stats";
const st = computeStats([
  { member_id: 1, duty_date: "2026-10-03", source: "wanted", pool: "general" },
  { member_id: 1, duty_date: "2026-10-03", source: "drafted", pool: "driver" }, // 같은 날 운전 → 출근일 1
  { member_id: 1, duty_date: "2026-08-01", source: "drafted", pool: "general" }, // 4주 밖
  { member_id: 1, duty_date: "2026-10-04", source: "admin", pool: "escort" },
  { member_id: 2, duty_date: "2026-10-04", source: "drafted", pool: "clinic" },
], "2026-10-05");
assert.deepStrictEqual(st.get(1), { days: 3, wanted: 1, drafted: 1, admin: 0, drive: 1, escort: 1, recent: 2 });
assert.deepStrictEqual(st.get(2), { days: 1, wanted: 0, drafted: 1, admin: 0, drive: 0, escort: 0, recent: 1 });
console.log("✔ 출근일(같은 날 중복 1회)·희망/차출·운전·선탑·최근 4주"); console.log("ALL OK");
