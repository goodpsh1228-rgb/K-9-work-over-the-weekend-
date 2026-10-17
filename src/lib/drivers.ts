// ─────────────────────────────────────────────────────────────
// 운전병 목록 (서버 전용)
//   members.is_driver 칸(0006 SQL)이 아직 없으면 오류 대신 "운전병 없음"으로 처리해서
//   SQL 실행 전에 새 코드가 배포되어도 사이트가 멈추지 않게 합니다.
// ─────────────────────────────────────────────────────────────
import "server-only";
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const getDriverIds = cache(async (): Promise<Set<number>> => {
  const { data, error } = await getSupabaseAdmin().from("members").select("id").eq("is_driver", true);
  if (error) {
    console.error("운전병 목록 읽기 실패(0006 SQL 실행 전?):", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((m) => m.id as number));
});

// 그날 주말 운전을 희망한 사람들 (drive_wants 표, 0007 SQL)
//   ok = false 이면 표가 아직 없음(0007 실행 전) → 운전 추첨을 건너뜁니다.
export const getDriveWants = cache(async (date: string): Promise<{ ok: boolean; ids: Set<number> }> => {
  const { data, error } = await getSupabaseAdmin().from("drive_wants").select("member_id").eq("duty_date", date);
  if (error) return { ok: false, ids: new Set() };
  return { ok: true, ids: new Set((data ?? []).map((r) => r.member_id as number)) };
});

// 운전 지정(drive_duties 표, 0017 SQL): 어느 날 누가 운전하는지
//   ok = false 이면 표가 아직 없음(0017 실행 전) → 운전 지정 기능을 숨기고 1차 명단은 그대로 둡니다.
export type DriveDuty = { id: number; member_id: number; start_date: string; end_date: string; created_by: number | null };

// from~to 기간에 걸친 운전 지정 기록 (시작일 순)
export async function getDriveDuties(from: string, to: string): Promise<{ ok: boolean; rows: DriveDuty[] }> {
  const { data, error } = await getSupabaseAdmin()
    .from("drive_duties")
    .select("id, member_id, start_date, end_date, created_by")
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date")
    .order("id");
  if (error) return { ok: false, rows: [] };
  return { ok: true, rows: (data ?? []) as DriveDuty[] };
}

// 그날 운전하는 사람들의 번호
export async function getDriverIdsOn(date: string): Promise<{ ok: boolean; ids: Set<number> }> {
  const r = await getDriveDuties(date, date);
  return { ok: r.ok, ids: new Set(r.rows.map((d) => d.member_id)) };
}
