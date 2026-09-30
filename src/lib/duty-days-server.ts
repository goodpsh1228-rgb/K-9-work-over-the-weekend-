// ─────────────────────────────────────────────────────────────
// 근무일 — 데이터베이스와 함께 쓰는 부분 (서버 전용)
// 관리자 설정(duty_day_overrides)을 읽어서 duty-days.ts 의 계산 규칙에 넣습니다.
// ─────────────────────────────────────────────────────────────
import "server-only";
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { computeDays, computeDutyDays, VIEW_DAYS, type Override } from "@/lib/duty-days";
import { addDays, todayKST } from "@/lib/kst";
import { voteFriday, votingStatus, votingWindow } from "@/lib/voting";

// 화면에 보여 줄 기간 (오늘 ~ 60일 뒤, 한국 날짜 기준)
export function viewRange() {
  const from = todayKST();
  return { from, to: addDays(from, VIEW_DAYS) };
}

// 근무일 수동 설정 전체 (몇십 줄 수준이라 통째로 읽음).
// cache(): 한 번의 화면 요청 안에서는 여러 번 불려도 데이터베이스는 1번만 읽습니다. (속도 개선)
const getAllOverrides = cache(async (): Promise<Override[]> => {
  const { data, error } = await getSupabaseAdmin().from("duty_day_overrides").select("duty_date, kind, note");
  if (error) throw new Error("근무일 설정을 불러오지 못했습니다: " + error.message);
  return (data ?? []) as Override[];
});

export async function getOverrides(from: string, to: string): Promise<Override[]> {
  return (await getAllOverrides()).filter((o) => o.duty_date >= from && o.duty_date <= to);
}

// 기간 안의 근무일 목록 (근무일만)
export async function getDutyDays(from: string, to: string) {
  return computeDutyDays(from, to, await getOverrides(from, to));
}

// 관리자 화면용: 근무일 + 관리자가 삭제한 날까지
export async function getAllDays(from: string, to: string) {
  return computeDays(from, to, await getOverrides(from, to));
}

// 투표 일정 도우미: from~to 근무일의 "그 주 금요일이 근무일인가"를 알려 주는 함수를 돌려줍니다.
// (금요일이 근무일이면 투표 마감이 수요일 → 화요일로 당겨짐)
// 투표 주의 금요일은 근무일보다 최대 10일 앞이므로 10일 앞부터 계산합니다.
export async function getFridayChecker(from: string, to: string) {
  const start = addDays(from, -10);
  const duty = new Set(computeDutyDays(start, to, await getOverrides(start, to)).map((d) => d.date));
  return (dutyDate: string) => duty.has(voteFriday(dutyDate));
}

// 한 근무일의 투표 기간과 상태 (rank 를 주면 그 계급 기준)
export async function getVoteInfo(date: string, rank?: string | null, now: Date = new Date()) {
  const fridayIsDuty = (await getFridayChecker(date, date))(date);
  return {
    fridayIsDuty,
    window: votingWindow(date, fridayIsDuty),
    status: votingStatus(date, fridayIsDuty, now, rank), // 이 계급 기준 상태
    overall: votingStatus(date, fridayIsDuty, now), // 투표 전체 기준 상태 (월요일 시작)
  };
}

// 추첨이 이미 끝난 날짜인지 (추첨 후에는 근무일 삭제·인원 변경을 막음)
export const isDrawn = cache(async (date: string): Promise<boolean> => {
  const { data } = await getSupabaseAdmin().from("draws").select("duty_date").eq("duty_date", date).maybeSingle();
  return Boolean(data);
});
