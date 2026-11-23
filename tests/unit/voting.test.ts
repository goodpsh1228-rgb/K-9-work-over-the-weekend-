import assert from "node:assert";
import { votingStatus, votingWindow, voteMonthStart, firstFridayAfter } from "../../src/lib/voting";
const at = (kst: string) => new Date(kst + "+09:00");
const s = (d: string, t: string, rank?: string | null) => votingStatus(d, false, at(t), rank);

// 근무일은 "앞 달"에 투표 (해 넘김 포함)
assert.strictEqual(voteMonthStart("2026-12-05"), "2026-11-01");
assert.strictEqual(voteMonthStart("2027-01-03"), "2026-12-01");

// 1일 뒤 처음 돌아오는 금요일, 1일이 금요일이면 다음 주 금요일
assert.strictEqual(firstFridayAfter("2026-11-01"), "2026-11-06"); // 일 → 같은 주 금
assert.strictEqual(firstFridayAfter("2026-12-01"), "2026-12-04"); // 화
assert.strictEqual(firstFridayAfter("2026-10-01"), "2026-10-02"); // 목
assert.strictEqual(firstFridayAfter("2027-01-01"), "2027-01-08"); // 금 → 다음 주 금
assert.strictEqual(firstFridayAfter("2026-05-01"), "2026-05-08"); // 금(2026-05-01 은 금요일)
assert.strictEqual(firstFridayAfter("2026-08-01"), "2026-08-07"); // 토 → 다음 금
assert.strictEqual(firstFridayAfter("2026-06-01"), "2026-06-05"); // 월

// 3월 근무일(기본 월 일정): 2/1(월) 00:00 ~ 2/5(금) 21:00, 대상 = 3월 전체
let w = votingWindow("2027-03-13", false);
assert.strictEqual(w.openDate, "2027-02-01");
assert.strictEqual(w.closeDate, "2027-02-05");
assert.strictEqual(w.coverFrom, "2027-03-01");
assert.strictEqual(w.coverTo, "2027-03-31");
// 같은 달 근무일은 모두 같은 일정
assert.strictEqual(votingWindow("2027-03-01", false).closeDate, "2027-02-05");
assert.strictEqual(votingWindow("2027-03-31", false).closeDate, "2027-02-05");
// 1월 근무일은 12월에 투표 (해 넘김), 2월 근무일은 1/1(금) 시작 → 1/8 마감
assert.strictEqual(votingWindow("2027-01-09", false).openDate, "2026-12-01");
assert.strictEqual(votingWindow("2027-01-09", false).closeDate, "2026-12-04");
w = votingWindow("2027-02-06", false);
assert.strictEqual(w.openDate, "2027-01-01");
assert.strictEqual(w.closeDate, "2027-01-08");
assert.strictEqual(w.coverTo, "2027-02-28");

// 경계 시각 (한국 시간)
assert.strictEqual(s("2027-03-13", "2027-01-31T23:59:59"), "before");
assert.strictEqual(s("2027-03-13", "2027-02-01T00:00:00"), "open");
assert.strictEqual(s("2027-03-13", "2027-02-05T20:59:59"), "open");
assert.strictEqual(s("2027-03-13", "2027-02-05T21:00:00"), "closed");
for (const rank of ["병장", "상병", "일병", "이병", null]) {
  assert.strictEqual(s("2027-03-13", "2027-02-01T00:00:00", rank), "open", String(rank));
  assert.strictEqual(s("2027-03-13", "2027-01-31T23:59:59", rank), "before", String(rank));
}
// 서버 시계(UTC)로도 같은 결과: 한국 금 21:00 = UTC 금 12:00, 한국 1일 00:00 = UTC 전날 15:00
assert.strictEqual(votingStatus("2027-03-13", false, new Date("2027-02-05T11:59:59Z")), "open");
assert.strictEqual(votingStatus("2027-03-13", false, new Date("2027-02-05T12:00:00Z")), "closed");
assert.strictEqual(votingStatus("2027-03-13", false, new Date("2027-01-31T14:59:59Z")), "before");
assert.strictEqual(votingStatus("2027-03-13", false, new Date("2027-01-31T15:00:00Z")), "open");
// 1일이 금요일: 1/1 00:00 열림, 1/1 21:00 에도 열려 있고 1/8 21:00 마감
assert.strictEqual(s("2027-02-06", "2027-01-01T21:30:00"), "open");
assert.strictEqual(s("2027-02-06", "2027-01-08T20:59:59"), "open");
assert.strictEqual(s("2027-02-06", "2027-01-08T21:00:00"), "closed");

// 12월 근무일 전체: 이번만 11/23 00:00 ~ 11/26 21:00 (모든 계급 같은 시각)
for (const d of ["2026-12-01", "2026-12-12", "2026-12-31"]) {
  for (const rank of ["병장", "일병", "이병", null]) {
    assert.strictEqual(s(d, "2026-11-22T23:59:59", rank), "before", d);
    assert.strictEqual(s(d, "2026-11-23T00:00:00", rank), "open", d);
    assert.strictEqual(s(d, "2026-11-26T20:59:59", rank), "open", d);
    assert.strictEqual(s(d, "2026-11-26T21:00:00", rank), "closed", d);
  }
}
assert.strictEqual(votingWindow("2026-12-12", false).openDate, "2026-11-23");
assert.strictEqual(votingWindow("2026-12-12", false).closeDate, "2026-11-26");
// 1월 근무일은 기본 월 일정 (12/1 ~ 12/4 21:00)
assert.strictEqual(votingWindow("2027-01-09", false).closeDate, "2026-12-04");

// 11/28·29: 예전 주간 투표 일정 유지 (11/23 00:00 ~ 11/25 21:00)
for (const d of ["2026-11-28", "2026-11-29"]) {
  for (const rank of ["병장", "일병", null]) {
    assert.strictEqual(s(d, "2026-11-24T12:00:00", rank), "open", d);
    assert.strictEqual(s(d, "2026-11-25T20:59:59", rank), "open", d);
    assert.strictEqual(s(d, "2026-11-25T21:00:00", rank), "closed", d);
  }
}
console.log("ALL OK");
