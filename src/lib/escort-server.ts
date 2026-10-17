// ─────────────────────────────────────────────────────────────
// 선탑 자동 지정 (서버 전용)
//   추첨이 끝나면 "운전병보다 기수가 같거나 높은 출근자 중 랜덤 1명"을 선탑으로 세웁니다.
//   관리자가 [규칙대로 다시 뽑기]를 누르면 같은 함수로 다시 뽑습니다 (이전 선탑은 바뀜).
// ─────────────────────────────────────────────────────────────
import "server-only";
import { randomInt } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getPostsForDate } from "@/lib/day-board";
import { writeAudit } from "@/lib/audit";
import { escortPool } from "@/lib/escort-rule";

type Person = { id: number; name: string; rank: string | null; cohort: number | null };

// 그날 선탑 대상 계산: 기준 운전병, 대상자 목록, 못 뽑는 이유
export async function getEscortPlan(date: string) {
  const db = getSupabaseAdmin();
  const posts = await getPostsForDate(date);
  const driverPost = posts.find((p) => p.pool === "driver");
  const escortPost = posts.find((p) => p.pool === "escort");
  const workPosts = new Set(posts.filter((p) => p.pool === "clinic" || p.pool === "general").map((p) => p.id));
  const { data: rows } = await db.from("assignments").select("member_id, post_id").eq("duty_date", date);
  // 기수 칸(SQL 0015)이 없으면 기수 없이 읽음 → 자동 지정 불가
  let mem = await db.from("members").select("id, name, rank, cohort");
  if (mem.error) mem = (await db.from("members").select("id, name, rank")) as typeof mem;
  const info = new Map<number, Person>(
    (mem.data ?? []).map((m) => [m.id as number, { id: m.id as number, name: m.name as string, rank: (m.rank as string | null) ?? null, cohort: ((m as { cohort?: number | null }).cohort ?? null) as number | null }]),
  );
  const ids = (postIds: (number | undefined)[]) => [...new Set((rows ?? []).filter((r) => postIds.includes(r.post_id as number)).map((r) => r.member_id as number))];
  const drivers = ids([driverPost?.id]).map((id) => info.get(id)).filter((p): p is Person => Boolean(p));
  const workers = ids([...workPosts]).map((id) => info.get(id)).filter((p): p is Person => Boolean(p));
  const r = escortPool(drivers, workers);
  return { escortPost, drivers, ...r };
}

export type EscortResult = { ok: true; picked: Person; poolSize: number; refCohort: number; drivers: Person[] } | { ok: false; message: string };

// 규칙대로 선탑 1명을 뽑아 저장 (이미 선탑이 있으면 바꿈)
export async function autoAssignEscort(date: string, actorId: number | null, trigger: "draw" | "manual"): Promise<EscortResult> {
  const plan = await getEscortPlan(date);
  if (!plan.escortPost) return { ok: false, message: "선탑 자리가 없습니다. 0008 SQL을 먼저 실행해 주세요." };
  if (plan.reason || plan.refCohort === null) return { ok: false, message: `선탑을 자동으로 정하지 못했습니다. ${plan.reason ?? ""}` };
  const picked = plan.pool[randomInt(plan.pool.length)]; // 대상자 모두 같은 확률
  const db = getSupabaseAdmin();
  await db.from("assignments").delete().eq("duty_date", date).eq("post_id", plan.escortPost.id);
  const { error } = await db.from("assignments").insert({ duty_date: date, member_id: picked.id, post_id: plan.escortPost.id, source: "drafted" });
  if (error) return { ok: false, message: "선탑 저장 중 오류: " + error.message };
  await writeAudit({
    actorId,
    action: "roster.escort_draw",
    targetMemberId: picked.id,
    dutyDate: date,
    details: {
      picked: picked.name,
      candidates: plan.pool.map((p) => p.name),
      rule: "운전병보다 기수 같거나 높은 사람",
      drivers: plan.drivers.map((d) => `${d.name}(${d.cohort}기)`),
      trigger,
    },
  });
  return { ok: true, picked, poolSize: plan.pool.length, refCohort: plan.refCohort, drivers: plan.drivers };
}
