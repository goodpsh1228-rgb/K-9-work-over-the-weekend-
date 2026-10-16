// ─────────────────────────────────────────────────────────────
// 반(squad)·기수(cohort) 계산 (순수 계산 — 데이터베이스를 건드리지 않음)
//   - 반: 미용반 / 진료반 / 훈련반 / 관리반 / 분만반 (관리자가 지정)
//   - 기수: 숫자가 작을수록 높은 기수 (866기 > 877기)
//   - 1차탑승: 그날 출근자 중 높은 기수 9명. 같은 기수가 컷에 걸리면 날짜별로 고정된 무작위로 뽑음
//   - 휴가 TO: 같은 반 사람끼리 휴가 기간이 겹치는지 계산
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { addDays } from "./kst";

export const SQUADS = ["미용반", "진료반", "훈련반", "관리반", "분만반"] as const;
export type Squad = (typeof SQUADS)[number];
export const isSquad = (v: string): v is Squad => (SQUADS as readonly string[]).includes(v);
// 반이 비어 있어도 진료반 인원은 "진료반"으로 봄 (진료반 여부와 같은 뜻이라서)
export const effectiveSquad = (squad: string | null | undefined, isClinic: boolean): Squad | null =>
  squad && isSquad(squad) ? squad : isClinic ? "진료반" : null;

export const BOARDING_COUNT = 9;
export const RESERVE_COUNT = 2; // 1차탑승 예비 인원 (다음 순위 2명)

// 같은 날짜·같은 사람이면 항상 같은 값 (새로고침해도 뽑힌 사람이 바뀌지 않게) — 무작위처럼 고르게 퍼진 숫자
function stableRandom(seed: string, id: number): number {
  return createHash("sha256").update(`${seed}:${id}`).digest().readUInt32BE(0);
}

// 1차탑승: 기수가 입력된 사람 중 높은 기수(작은 숫자) 순으로 n명.
//   같은 기수 안에서 인원이 잘리면(예: 3자리 남았는데 같은 기수가 5명) seed(날짜)로 고정된 무작위로 뽑음
export function pickFirstBoarding<T extends { id: number; cohort: number | null }>(people: T[], seed: string, n = BOARDING_COUNT): T[] {
  const withCohort = people.filter((p): p is T & { cohort: number } => p.cohort !== null);
  const sorted = [...withCohort].sort((a, b) => a.cohort - b.cohort || stableRandom(seed, a.id) - stableRandom(seed, b.id));
  return sorted.slice(0, n);
}

// 1차탑승 9명 + 예비 2명: 같은 순서(높은 기수 → 같은 기수는 고정 무작위)에서 1~9등이 탑승, 10~11등이 예비
export function pickBoardingWithReserve<T extends { id: number; cohort: number | null }>(people: T[], seed: string) {
  const ranked = pickFirstBoarding(people, seed, BOARDING_COUNT + RESERVE_COUNT);
  return { boarding: ranked.slice(0, BOARDING_COUNT), reserve: ranked.slice(BOARDING_COUNT) };
}

import { spansOverlap, dots, dotsRange, type LeaveSpan } from "./spans";
export { spansOverlap, dots, dotsRange };
export type { LeaveSpan };


// 같은 사람의 이어지는(하루 차이로 붙거나 겹치는) 휴가를 하나로 합침. 예) 10.26~10.28 + 10.29~10.31 → 10.26~10.31
//   휴가 희망(계획)과 확정 휴가는 서로 합치지 않음. 결과는 시작일 순.
export function mergeConsecutive<T extends { key: number | string; start: string; end: string; planned: boolean }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  const out: T[] = [];
  for (const it of sorted) {
    const prev = [...out].reverse().find((o) => o.key === it.key && o.planned === it.planned);
    if (prev && it.start <= addDays(prev.end, 1)) {
      if (it.end > prev.end) prev.end = it.end;
    } else out.push({ ...it });
  }
  return out;
}

// 하루하루 겹친 인원이 가장 많은 날과 그 인원 수 (반별 휴가 TO 확인용)
export function peakOverlap(spans: LeaveSpan[]): { date: string; count: number } | null {
  if (spans.length === 0) return null;
  const starts = [...new Set(spans.map((s) => s.start))]; // 겹침 인원은 어떤 기간의 시작일에서 가장 많아짐
  let best: { date: string; count: number } | null = null;
  for (const d of starts.sort()) {
    const count = spans.filter((s) => s.start <= d && d <= s.end).length;
    if (!best || count > best.count) best = { date: d, count };
  }
  return best;
}
