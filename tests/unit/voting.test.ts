import assert from "node:assert";
import { votingStatus, votingWindow, voteMonday } from "../../src/lib/voting";
import { mondayOf } from "../../src/lib/kst";
const at = (kst: string) => new Date(kst + "+09:00");

assert.strictEqual(mondayOf("2026-09-29"), "2026-09-28"); // 화 → 월
assert.strictEqual(mondayOf("2026-10-04"), "2026-09-28"); // 일 → 같은 주 월
assert.strictEqual(mondayOf("2026-10-05"), "2026-10-05"); // 월 → 그대로

// 어떤 근무일이 어느 주 투표에 속하는지 (그 주 금 ~ 다음 주 목)
const M = "2026-09-28";
for (const d of ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-08"]) assert.strictEqual(voteMonday(d), M, d);
assert.strictEqual(voteMonday("2026-10-01"), "2026-09-21"); // 이번 주 목요일 → 앞 주 투표
assert.strictEqual(voteMonday("2026-10-09"), "2026-10-05"); // 다음 주 금요일 → 다음 주 투표

// 기본: 월 00:00 ~ 수 21:00
let w = votingWindow("2026-10-03", false);
assert.strictEqual(w.closeDate, "2026-09-30"); assert.strictEqual(w.coverFrom, "2026-10-03"); assert.strictEqual(w.coverTo, "2026-10-08");
const s = (d: string, fri: boolean, t: string, rank?: string | null) => votingStatus(d, fri, at(t), rank);
assert.strictEqual(s("2026-10-03", false, "2026-09-27T23:59:59"), "before");
assert.strictEqual(s("2026-10-03", false, "2026-09-28T00:00:00", "병장"), "open");
assert.strictEqual(s("2026-10-03", false, "2026-09-28T00:00:00", "상병"), "open");
assert.strictEqual(s("2026-10-03", false, "2026-09-28T12:00:00", "일병"), "before"); // 월요일엔 일병 불가
assert.strictEqual(s("2026-10-03", false, "2026-09-28T23:59:59", "이병"), "before");
assert.strictEqual(s("2026-10-03", false, "2026-09-28T23:59:59", null), "before"); // 계급 미지정 = 화요일부터
assert.strictEqual(s("2026-10-03", false, "2026-09-29T00:00:00", "이병"), "open");
assert.strictEqual(s("2026-10-03", false, "2026-09-30T20:59:59", "이병"), "open");
assert.strictEqual(s("2026-10-03", false, "2026-09-30T21:00:00", "병장"), "closed");
assert.strictEqual(s("2026-10-03", false, "2026-09-30T21:01:00"), "closed");
// 서버 시계(UTC)로도 같은 결과: 한국 수 21:00 = UTC 수 12:00
assert.strictEqual(votingStatus("2026-10-03", false, new Date("2026-09-30T11:59:59Z"), "이병"), "open");
assert.strictEqual(votingStatus("2026-10-03", false, new Date("2026-09-30T12:00:00Z"), "이병"), "closed");
// 한국 월 00:00 = UTC 일 15:00
assert.strictEqual(votingStatus("2026-10-03", false, new Date("2026-09-27T14:59:59Z"), "병장"), "before");
assert.strictEqual(votingStatus("2026-10-03", false, new Date("2026-09-27T15:00:00Z"), "병장"), "open");

// 금요일 공휴일(10/9 한글날): 10/5(월) 00:00 ~ 10/6(화) 21:00, 대상 10/9 금 ~ 10/15 목
w = votingWindow("2026-10-09", true);
assert.strictEqual(w.monday, "2026-10-05"); assert.strictEqual(w.closeDate, "2026-10-06"); assert.strictEqual(w.coverFrom, "2026-10-09");
assert.strictEqual(votingWindow("2026-10-10", true).closeDate, "2026-10-06"); // 같은 주 토요일도 화요일 마감
assert.strictEqual(s("2026-10-10", true, "2026-10-06T20:59:59", "이병"), "open");
assert.strictEqual(s("2026-10-10", true, "2026-10-06T21:00:00", "이병"), "closed");
assert.strictEqual(s("2026-10-10", true, "2026-10-05T10:00:00", "일병"), "before"); // 화요일에만 일병 가능
assert.strictEqual(s("2026-10-10", true, "2026-10-05T10:00:00", "상병"), "open");
console.log("ALL OK");
