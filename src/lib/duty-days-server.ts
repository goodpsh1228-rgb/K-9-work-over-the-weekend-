// ─────────────────────────────────────────────────────────────
// 근무일 — 데이터베이스와 함께 쓰는 부분 (서버 전용)
// 관리자 설정(duty_day_overrides)을 읽어서 duty-days.ts 의 계산 규칙에 넣습니다.
// ─────────────────────────────────────────────────────────────
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { computeDays, computeDutyDays, VIEW_DAYS, type Override } from "@/lib/duty-days";
import { addDays, todayKST } from "@/lib/kst";

// 화면에 보여 줄 기간 (오늘 ~ 60일 뒤, 한국 날짜 기준)
export function viewRange() {
  const from = todayKST();
  return { from, to: addDays(from, VIEW_DAYS) };
}

export async function getOverrides(from: string, to: string): Promise<Override[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("duty_day_overrides")
    .select("duty_date, kind, note")
    .gte("duty_date", from)
    .lte("duty_date", to);
  if (error) throw new Error("근무일 설정을 불러오지 못했습니다: " + error.message);
  return (data ?? []) as Override[];
}

// 기간 안의 근무일 목록 (근무일만)
export async function getDutyDays(from: string, to: string) {
  return computeDutyDays(from, to, await getOverrides(from, to));
}

// 관리자 화면용: 근무일 + 관리자가 삭제한 날까지
export async function getAllDays(from: string, to: string) {
  return computeDays(from, to, await getOverrides(from, to));
}

// 추첨이 이미 끝난 날짜인지 (추첨 후에는 근무일 삭제·인원 변경을 막음)
export async function isDrawn(date: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin().from("draws").select("duty_date").eq("duty_date", date).maybeSingle();
  return Boolean(data);
}
