// ─────────────────────────────────────────────────────────────
// 추첨 결과 조회 (서버 전용)
//   - 추첨 기록(draws)·확정 명단(assignments) 조회
//   - 차출 실행은 순번제로 바뀌어 monthly-draw-server.ts 의 [한 달 차출하기]가 맡습니다 (랜덤 차출 폐지)
// ─────────────────────────────────────────────────────────────
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { syncServiceStatusSafely } from "@/lib/service-sync";

export type Trigger = "cron" | "visit" | "manual" | "rotation";

// 추첨 기록 (없으면 null)
export async function getDraw(date: string) {
  const { data } = await getSupabaseAdmin()
    .from("draws")
    .select("duty_date, triggered_by, executed_at, clinic_shortage, general_shortage")
    .eq("duty_date", date)
    .maybeSingle();
  return data as
    | { duty_date: string; triggered_by: Trigger; executed_at: string; clinic_shortage: number; general_shortage: number }
    | null;
}

export type RosterEntry = { memberId: number; name: string; rank: string | null; cohort?: number | null; postId: number; source: "wanted" | "drafted" | "admin" | "rotation" };

// 확정 명단 (이름 포함)
export async function getRoster(date: string): Promise<RosterEntry[]> {
  const db = getSupabaseAdmin();
  // 기수 칸(SQL 0015)이 아직 없으면 기수 없이 읽음
  const [{ data: rows }, withCohort] = await Promise.all([
    db.from("assignments").select("member_id, post_id, source").eq("duty_date", date),
    db.from("members").select("id, name, rank, cohort"),
  ]);
  const members = withCohort.error ? (await db.from("members").select("id, name, rank")).data : withCohort.data;
  const cohortOf = new Map((members ?? []).map((m) => [m.id as number, ((m as { cohort?: number | null }).cohort ?? null) as number | null]));
  const nameOf = new Map((members ?? []).map((m) => [m.id as number, m.name as string]));
  const rankOf = new Map((members ?? []).map((m) => [m.id as number, (m.rank as string | null) ?? null]));
  return (rows ?? [])
    .map((r) => ({
      memberId: r.member_id as number,
      name: nameOf.get(r.member_id) ?? "?",
      rank: rankOf.get(r.member_id) ?? null,
      cohort: cohortOf.get(r.member_id) ?? null,
      postId: r.post_id as number,
      source: r.source as RosterEntry["source"],
    }))
    // 높은 기수(작은 숫자)부터, 기수가 같거나 없으면 가나다순
    .sort((a, b) => (a.cohort ?? 99999) - (b.cohort ?? 99999) || a.name.localeCompare(b.name, "ko"));
}

// 화면을 열 때 하는 일: 계급 자동 진급·전역 자동 비활성화만 합니다 (추첨은 하지 않음). 실패해도 화면은 정상으로 보이도록 오류를 삼킵니다.
export async function runVisitTasksSafely() {
  await syncServiceStatusSafely();
}
