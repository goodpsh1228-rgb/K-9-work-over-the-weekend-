// ─────────────────────────────────────────────────────────────
// 진급·전역 계산 (공군 병, 복무 21개월) — 순수 계산
//   규칙: 진급일은 매월 1일. 입대한 달은 빼고 다음 달부터 계급별 개월 수를 셉니다.
//     이병 2개월 → 일병 6개월 → 상병 6개월 → 병장 (전역까지)
//     전역일 = 입대일 + 21개월 − 1일
//   예) 2025-03-10 입대 → 일병 2025-06-01, 상병 2025-12-01, 병장 2026-06-01, 전역 2026-12-09
// ─────────────────────────────────────────────────────────────
import { addDays, addMonths } from "./kst";

// 입대한 달에서 k달 뒤의 1일
function firstOfMonthAfter(enlist: string, k: number): string {
  const [y, m] = enlist.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return d.toISOString().slice(0, 10);
}

export function promotionDates(enlist: string) {
  return {
    일병: firstOfMonthAfter(enlist, 3), // 입대 달 제외, 이병 2개월 뒤
    상병: firstOfMonthAfter(enlist, 9), // + 일병 6개월
    병장: firstOfMonthAfter(enlist, 15), // + 상병 6개월
  };
}

// 기본 전역일: 입대일 + 21개월 − 1일
export const defaultDischarge = (enlist: string) => addDays(addMonths(enlist, 21), -1);

// 그 날짜의 계급
export function rankOn(enlist: string, date: string): "이병" | "일병" | "상병" | "병장" {
  const p = promotionDates(enlist);
  if (date >= p.병장) return "병장";
  if (date >= p.상병) return "상병";
  if (date >= p.일병) return "일병";
  return "이병";
}

// 다음 진급 (없으면 null = 이미 병장)
export function nextPromotion(enlist: string, today: string): { rank: string; date: string } | null {
  const p = promotionDates(enlist);
  for (const rank of ["일병", "상병", "병장"] as const) if (p[rank] > today) return { rank, date: p[rank] };
  return null;
}
