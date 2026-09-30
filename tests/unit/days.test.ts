import assert from "node:assert";
import { todayKST, addDays, weekday, isValidDate, formatShort, kstMoment, dateRange } from "../../src/lib/kst";
import { computeDays, computeDutyDays, holidayListOutdated } from "../../src/lib/duty-days";
import { HOLIDAYS } from "../../src/lib/holidays";

// KST 경계: UTC 14:59 = 한국 23:59 (같은 날), UTC 15:00 = 한국 다음날 00:00
assert.strictEqual(todayKST(new Date("2026-09-30T14:59:59Z")), "2026-09-30");
assert.strictEqual(todayKST(new Date("2026-09-30T15:00:00Z")), "2026-10-01");
assert.strictEqual(todayKST(new Date("2026-12-31T15:00:00Z")), "2027-01-01");
assert.strictEqual(kstMoment("2026-10-10", 21).toISOString(), "2026-10-10T12:00:00.000Z");
assert.strictEqual(kstMoment("2026-10-10").toISOString(), "2026-10-09T15:00:00.000Z");
assert.strictEqual(addDays("2026-10-12", -30), "2026-09-12");   // 계획서 예시: 30일 전
assert.strictEqual(addDays("2026-10-12", -2), "2026-10-10");
assert.strictEqual(addDays("2028-02-28", 1), "2028-02-29");     // 윤년
assert.strictEqual(addDays("2027-02-28", 1), "2027-03-01");
assert.strictEqual(weekday("2026-10-12"), 1);  // 실제 2026-10-12 는 월요일
assert.strictEqual(formatShort("2026-10-11"), "10/11(일)");
assert.ok(isValidDate("2028-02-29") && !isValidDate("2027-02-29") && !isValidDate("2026-13-01") && !isValidDate("abc"));
assert.strictEqual(dateRange("2026-12-30", "2027-01-02").length, 4);

// 공휴일 목록 요일 검증: 파이썬 계산과 동일해야 함
const expectW: Record<string, string> = {"2026-10-05":"월","2026-10-09":"금","2026-12-25":"금","2027-02-09":"화","2027-05-13":"목","2027-09-15":"수","2027-12-27":"월"};
const W = "일월화수목금토";
for (const [d, w] of Object.entries(expectW)) assert.strictEqual(W[weekday(d)], w, d);
// 대체공휴일은 모두 평일이어야 함
for (const [d, n] of Object.entries(HOLIDAYS)) if (n.startsWith("대체")) assert.ok(weekday(d) >= 1 && weekday(d) <= 5, d);
// 2027년: 24건, 일요일과 겹침 4건 (월력요항: 76-4=72)
const y27 = Object.keys(HOLIDAYS).filter(d => d.startsWith("2027"));
assert.strictEqual(y27.length, 24);
assert.strictEqual(y27.filter(d => weekday(d) === 0).length, 4);

// 근무일 계산: 2026-10-01 ~ 10-12
let days = computeDutyDays("2026-10-01", "2026-10-12", []);
assert.deepStrictEqual(days.map(d => d.date), ["2026-10-03","2026-10-04","2026-10-05","2026-10-09","2026-10-10","2026-10-11"]);
assert.strictEqual(days[2].label, "대체공휴일(개천절)");
// 관리자: 10/1 추가, 10/4 삭제
const ov = [{duty_date:"2026-10-01",kind:"add" as const,note:"국군의날 행사"},{duty_date:"2026-10-04",kind:"remove" as const,note:null}];
days = computeDutyDays("2026-10-01", "2026-10-12", ov);
assert.deepStrictEqual(days.map(d => d.date), ["2026-10-01","2026-10-03","2026-10-05","2026-10-09","2026-10-10","2026-10-11"]);
assert.strictEqual(days[0].label, "국군의날 행사");
const all = computeDays("2026-10-01", "2026-10-12", ov);
assert.ok(all.find(d => d.date === "2026-10-04" && !d.isDutyDay && d.label.includes("근무 없음")));
assert.ok(!holidayListOutdated("2027-12-31") && holidayListOutdated("2028-01-01"));
console.log("ALL OK");
