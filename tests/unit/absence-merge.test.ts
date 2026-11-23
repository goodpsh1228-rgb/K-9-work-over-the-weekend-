import assert from "node:assert";
import { mergeAbsenceChain, reasonOf } from "../../src/lib/absence-merge";

// 사유 문구: 종류 이름과 상세가 같으면 한 번만
assert.strictEqual(reasonOf("leave", "휴가"), "휴가");
assert.strictEqual(reasonOf("leave", null), "휴가");
assert.strictEqual(reasonOf("leave", "위로휴가"), "위로휴가"); // 이미 "휴가"를 포함
assert.strictEqual(reasonOf("training", "일병집중교육"), "일병집중교육"); // 이미 "교육"을 포함
assert.strictEqual(reasonOf("outpatient", "수의과대학병원"), "외진·수의과대학병원"); // 종류 이름이 없으면 덧붙임
assert.strictEqual(reasonOf("lineup", "일병집중교육"), "일병집중교육");
assert.strictEqual(reasonOf("lineup", null), "불참");

// 같은 기간이 중복 입력돼도 한 줄 (스크린샷의 최장훈 3줄 사례)
let m = mergeAbsenceChain(
  [
    { kind: "leave", detail: null, start: "2026-11-24", end: "2026-11-28" },
    { kind: "leave", detail: "휴가", start: "2026-11-24", end: "2026-12-02" },
    { kind: "leave", detail: "휴가", start: "2026-11-24", end: "2026-12-02" },
  ],
  "2026-11-26",
)!;
assert.strictEqual(m.start, "2026-11-24");
assert.strictEqual(m.end, "2026-12-02");
assert.strictEqual(m.reason, "휴가"); // "휴가·휴가"가 아님

// 종류가 바뀌며 이어지는 휴가(바로 다음 날 시작)는 하나의 기간, 사유는 순서대로
m = mergeAbsenceChain(
  [
    { kind: "leave", detail: "위로휴가", start: "2026-11-24", end: "2026-11-28" },
    { kind: "leave", detail: "포상휴가", start: "2026-11-29", end: "2026-12-02" },
  ],
  "2026-11-27",
)!;
assert.strictEqual(m.start, "2026-11-24");
assert.strictEqual(m.end, "2026-12-02"); // 보는 날이 앞쪽 기록 안이어도 이어지는 끝까지
assert.strictEqual(m.reason, "위로휴가 → 포상휴가");
// 보는 날이 뒤쪽 기록 안이어도 같은 결과
assert.strictEqual(mergeAbsenceChain([{ kind: "leave", detail: "위로휴가", start: "2026-11-24", end: "2026-11-28" }, { kind: "leave", detail: "포상휴가", start: "2026-11-29", end: "2026-12-02" }], "2026-12-01")!.reason, "위로휴가 → 포상휴가");

// 하루 이상 떨어져 있으면 따로 (11/28 끝, 11/30 시작 → 이어지지 않음)
m = mergeAbsenceChain(
  [
    { kind: "leave", start: "2026-11-24", end: "2026-11-28" },
    { kind: "leave", start: "2026-11-30", end: "2026-12-02" },
  ],
  "2026-11-25",
)!;
assert.strictEqual(m.end, "2026-11-28");
// 휴가 뒤에 교육이 이어지면 둘 다 표시, 배지 색은 그날 기록 종류
m = mergeAbsenceChain(
  [
    { kind: "leave", start: "2026-11-24", end: "2026-11-25" },
    { kind: "training", detail: "집중교육", start: "2026-11-26", end: "2026-11-27" },
  ],
  "2026-11-26",
)!;
assert.strictEqual(m.reason, "휴가 → 집중교육");
assert.strictEqual(m.kind, "training");
// 그날을 포함하는 기록이 없으면 null
assert.strictEqual(mergeAbsenceChain([{ kind: "leave", start: "2026-11-24", end: "2026-11-25" }], "2026-11-30"), null);
console.log("ALL OK");
