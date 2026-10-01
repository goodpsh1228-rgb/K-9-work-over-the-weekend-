import assert from "node:assert";
import { parseHolidayList } from "../../src/lib/holiday-import";
const r = parseHolidayList(`2028년 공휴일
2028-01-01 신정
2028.1.26(수) 설날 연휴
2028/01/27 설날
2028년 3월 1일 삼일절
2028-02-30 없는날
2028-01-01 중복
날짜 없는 줄`);
assert.deepStrictEqual(r.rows, [
  { date: "2028-01-01", name: "신정" },
  { date: "2028-01-26", name: "설날 연휴" },
  { date: "2028-01-27", name: "설날" },
  { date: "2028-03-01", name: "삼일절" },
]);
assert.strictEqual(r.errors.length, 1);
console.log("✔ 여러 날짜 모양·괄호 요일·중복·잘못된 날짜·날짜 없는 줄"); console.log("ALL OK");
