import assert from "node:assert";
import { lastWorkdayBefore } from "../../src/lib/workdays";
import { isWeekend } from "../../src/lib/kst";

// 쉬는 날 = 주말 + 공휴일 목록
const rest = (holidays: string[]) => (d: string) => isWeekend(d) || holidays.includes(d);
// 2026-10-19 = 월요일. 금요일 10/16 이 평일이면 기준은 금요일
assert.strictEqual(lastWorkdayBefore("2026-10-19", rest([])), "2026-10-16");
assert.strictEqual(lastWorkdayBefore("2026-10-20", rest([])), "2026-10-19"); // 화요일은 전날(월)
// 금요일이 공휴일이면 목요일 (한글날 2026-10-09 금요일, 월요일은 10/12)
assert.strictEqual(lastWorkdayBefore("2026-10-12", rest(["2026-10-09"])), "2026-10-08");
// 월요일이 공휴일이면 그 다음 화요일의 기준은 직전 평일인 금요일
assert.strictEqual(lastWorkdayBefore("2026-10-06", rest(["2026-10-05"])), "2026-10-02"); // 10/3 토 개천절·10/4 일·10/5 월 대체공휴일 → 10/2 금
// 토·일 라인업도 직전 평일(금)과 비교
assert.strictEqual(lastWorkdayBefore("2026-10-17", rest([])), "2026-10-16");
assert.strictEqual(lastWorkdayBefore("2026-10-18", rest([])), "2026-10-16");
// 평일이 하나도 없는 이상한 경우엔 전날로 대비
assert.strictEqual(lastWorkdayBefore("2026-10-19", () => true), "2026-10-18");
console.log("ALL OK");
