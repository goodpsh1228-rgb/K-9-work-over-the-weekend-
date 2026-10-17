import assert from "node:assert";
import { deadlineNotice, lineupLocked, lockedThrough, touchesLocked } from "../../src/lib/lineup-deadline";

// 한국 시각 → 서버 시계(UTC) 순간. 예: kst("2026-10-17", 21, 14) = 한국 10/17 21:14
const kst = (d: string, h: number, m: number) => new Date(`${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+09:00`);

// ── 마감 경계: 전날 21:15 (한국 시간) ──
assert.strictEqual(lockedThrough(kst("2026-10-17", 0, 0)), "2026-10-17"); // 자정 직후: 오늘 라인업은 어제 마감됨, 내일 것은 열려 있음
assert.strictEqual(lockedThrough(kst("2026-10-17", 21, 14)), "2026-10-17"); // 21:14 → 내일(10/18) 라인업은 아직 입력 가능
assert.strictEqual(lockedThrough(kst("2026-10-17", 21, 15)), "2026-10-18"); // 21:15 정각 → 내일 라인업 마감
assert.strictEqual(lockedThrough(kst("2026-10-17", 23, 59)), "2026-10-18");
assert.strictEqual(lockedThrough(kst("2026-10-18", 0, 0)), "2026-10-18"); // 날짜가 바뀌면 오늘(10/18)까지가 마감 상태 그대로
// UTC 로는 아직 전날인 한국 새벽·아침도 한국 날짜 기준
assert.strictEqual(lockedThrough(new Date("2026-10-16T15:30:00Z")), "2026-10-17"); // 한국 10/17 00:30

// ── 어떤 기간이 마감에 걸리는가 ──
const t = kst("2026-10-17", 20, 59); // 한국 10/17 20:59 → 10/17까지 마감
assert.strictEqual(touchesLocked("2026-10-18", "2026-10-20", t), false); // 내일부터는 가능
assert.strictEqual(touchesLocked("2026-10-17", "2026-10-17", t), true); // 오늘 하루는 마감
assert.strictEqual(touchesLocked("2026-10-15", "2026-10-25", t), true); // 오늘을 포함하면 마감
assert.strictEqual(touchesLocked("2026-10-10", "2026-10-16", t), false); // 이미 지난 기간만 → 마감과 무관
const t2 = kst("2026-10-17", 21, 16); // 21:16 → 10/18도 마감
assert.strictEqual(touchesLocked("2026-10-18", "2026-10-18", t2), true);
assert.strictEqual(touchesLocked("2026-10-19", "2026-10-19", t2), false);

// ── 종류·역할: 라인업 불참 종류만, 관리자는 예외 ──
assert.strictEqual(lineupLocked("leave", "2026-10-17", "2026-10-17", false, t), true);
assert.strictEqual(lineupLocked("lineup", "2026-10-17", "2026-10-17", false, t), true);
assert.strictEqual(lineupLocked("training", "2026-10-17", "2026-10-17", false, t), true);
assert.strictEqual(lineupLocked("leave", "2026-10-17", "2026-10-17", true, t), false); // 관리자
assert.strictEqual(lineupLocked("injury", "2026-10-17", "2026-10-17", false, t), false); // 부상: 라인업 불참 아님
assert.strictEqual(lineupLocked("outing", "2026-10-17", "2026-10-17", false, t), false); // 외출·면회
assert.strictEqual(lineupLocked("discharge", "2026-10-17", "2026-10-17", false, t), false);

assert.match(deadlineNotice(t), /10\/17\(토\)까지 마감, 10\/18\(일\)부터/);
console.log("ALL OK");
