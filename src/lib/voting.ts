// ─────────────────────────────────────────────────────────────
// 월 투표 일정 계산 (순수 계산) — 2026-11-23 순번제 전환
//
// 투표는 매달 한 번, 다음 달 한 달치를 미리 받습니다. (한국 시간 기준)
//   · 열림 : 매월 1일 00:00
//   · 마감 : 1일 뒤 처음 돌아오는 금요일 21:00
//            (1일이 금요일이면 그날이 아니라 다음 주 금요일)
//   · 대상 : 다음 달의 모든 근무일
//   예) 2026-12 근무일 → 11/1(일) 00:00 ~ 11/6(금) 21:00
//       2027-02 근무일 → 2027-01-01(금) 00:00 ~ 2027-01-08(금) 21:00
//   → 계급과 상관없이 모두 같은 시각에 열립니다.
// ─────────────────────────────────────────────────────────────
import { addDays, dateRange, kstMoment, mondayOf, weekday } from "./kst";

export type Rank = "이병" | "일병" | "상병" | "병장";
export const RANKS: Rank[] = ["이병", "일병", "상병", "병장"];
export const SENIOR_RANKS: Rank[] = ["상병", "병장"];
export const CLOSE_HOUR = 21;
const FRIDAY = 5;

// 근무일이 속한 달의 "앞 달 1일" = 그 근무일을 투표하는 달 ('YYYY-MM-01')
export function voteMonthStart(dutyDate: string): string {
  const [y, m] = dutyDate.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}-01`;
}

// 1일 뒤 처음 돌아오는 금요일 (1일이 금요일이면 7일 뒤)
export function firstFridayAfter(firstOfMonth: string): string {
  const delta = (FRIDAY - weekday(firstOfMonth) + 7) % 7 || 7;
  return addDays(firstOfMonth, delta);
}

// 그 근무일이 속한 달의 첫날과 마지막날 (대상 근무일 범위 표시용)
function monthRange(dutyDate: string): { from: string; to: string } {
  const [y, m] = dutyDate.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1) };
}

export type VotingStatus = "before" | "open" | "closed"; // 열리기 전 / 투표 중 / 마감

// (예전 주간 투표용 — 근무일이 속한 투표 주의 월요일/금요일. 근무일 목록 계산 등 일부가 아직 사용)
export function voteMonday(dutyDate: string): string {
  return mondayOf(addDays(dutyDate, -4));
}
export function voteFriday(dutyDate: string): string {
  return addDays(voteMonday(dutyDate), 4);
}

// ── 특정 근무일만 투표 기간을 따로 정하기 (관리자 요청으로 열거나 연장할 때) ──
//   근무일 → { 시작일, 마감일 } (시작은 00:00, 마감은 21:00, 한국 시간. 모든 계급 같은 시각)
//   여기 적힌 근무일만 기본 월 일정 대신 이 일정을 씁니다. 지나간 항목은 지워도 됩니다.
//   (seniorFrom/juniorFrom 은 예전 계급별 시차용 이름이고, 지금은 항상 같은 날짜를 씁니다)
type VotingOverride = { seniorFrom: string; juniorFrom: string; closeDate: string };
export const VOTING_OVERRIDES: Record<string, VotingOverride> = {
  // 2026-11-23 요청: 월 투표 전환 직후라 12월 근무일 전체를 11/23(월) 00:00 ~ 11/27(금) 21:00 까지 받음 (12/5 근무 전에 차출·동 배정을 끝내기 위해 앞당김)
  ...Object.fromEntries(
    dateRange("2026-12-01", "2026-12-31").map((d): [string, VotingOverride] => [
      d,
      { seniorFrom: "2026-11-23", juniorFrom: "2026-11-23", closeDate: "2026-11-27" },
    ]),
  ),
};

// fridayIsDuty 는 예전 주간 투표 때 쓰던 값이라 이제 영향이 없습니다 (호출하는 쪽 호환용)
export function votingWindow(dutyDate: string, _fridayIsDuty: boolean = false) {
  const ov = VOTING_OVERRIDES[dutyDate];
  const start = voteMonthStart(dutyDate);
  const openDate = ov ? ov.seniorFrom : start;
  const closeDate = ov ? ov.closeDate : firstFridayAfter(start);
  const cover = monthRange(dutyDate);
  return {
    monday: start, // (예전 이름 유지) 투표가 시작되는 달의 1일
    openDate, // 투표가 처음 열리는 날 (화면 표시용)
    juniorDate: ov ? ov.juniorFrom : openDate, // 일병·이병 시작일 — 월 투표에서는 모두 같음 (연장 예외만 다름)
    seniorOpensAt: kstMoment(openDate, 0),
    juniorOpensAt: kstMoment(ov ? ov.juniorFrom : openDate, 0),
    closesAt: kstMoment(closeDate, CLOSE_HOUR),
    closeDate,
    coverFrom: cover.from, // 대상 근무일 범위 = 근무일이 속한 달 전체
    coverTo: cover.to,
  };
}

export function isSenior(rank: string | null | undefined): boolean {
  return SENIOR_RANKS.includes(rank as Rank);
}

// 투표 상태. rank 를 주면 그 계급 기준으로, 안 주면 "투표 전체"(가장 이른 월요일 시작) 기준으로 계산.
// 마감 시각 정각(21:00:00)부터는 마감입니다.
export function votingStatus(
  dutyDate: string,
  fridayIsDuty: boolean,
  now: Date = new Date(),
  rank?: string | null,
): VotingStatus {
  const w = votingWindow(dutyDate, fridayIsDuty);
  const opensAt = rank === undefined || isSenior(rank) ? w.seniorOpensAt : w.juniorOpensAt;
  if (now < opensAt) return "before";
  if (now < w.closesAt) return "open";
  return "closed";
}

export const STATUS_LABEL: Record<VotingStatus, string> = {
  before: "투표 예정",
  open: "투표 중",
  closed: "마감",
};
