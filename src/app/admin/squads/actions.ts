"use server";
// ─────────────────────────────────────────────────────────────
// 반·기수 관리 서버 액션 (관리자)
//   - 한 사람의 반(미용반·진료반·훈련반·관리반·분만반)과 기수를 저장
//   - 반을 "진료반"으로 하면 진료반 여부(진료실 추첨 대상)도 켜지고, 다른 반으로 바꾸면 꺼집니다.
//   - 변경 이력에 남김
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { isSquad } from "@/lib/squads";

const PAGE = "/admin/squads";
function back(kind: "msg" | "error", text: string): never {
  revalidatePath(PAGE);
  revalidatePath("/lineup");
  revalidatePath("/leave");
  redirect(`${PAGE}?${kind}=${encodeURIComponent(text)}`);
}

export async function updateSquadCohortAction(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("member_id"));
  const rawSquad = String(formData.get("squad") ?? "");
  const rawCohort = String(formData.get("cohort") ?? "").trim();
  const squad = rawSquad === "" ? null : rawSquad;
  const cohort = rawCohort === "" ? null : Number(rawCohort);
  if (squad !== null && !isSquad(squad)) back("error", "반을 다시 선택해 주세요.");
  if (cohort !== null && (!Number.isInteger(cohort) || cohort < 1 || cohort > 9999)) back("error", "기수는 1~9999 사이 숫자로 입력해 주세요.");

  const db = getSupabaseAdmin();
  const { data: before, error: e0 } = await db.from("members").select("name, squad, cohort, is_clinic").eq("id", id).maybeSingle();
  if (e0) back("error", "반·기수 기능용 SQL(0015)을 먼저 실행해 주세요.");
  if (!before) back("error", "인원을 찾을 수 없습니다.");
  // 진료반 여부도 맞춤: 진료반이면 켜고, 다른 반이면 끔, 반을 비우면 그대로
  const update: Record<string, unknown> = { squad, cohort };
  if (squad === "진료반") update.is_clinic = true;
  else if (squad !== null) update.is_clinic = false;
  const { error } = await db.from("members").update(update).eq("id", id);
  if (error) back("error", "저장 중 오류: " + error.message);
  await writeAudit({
    actorId: me.id,
    action: "member.squad_cohort",
    targetMemberId: id,
    details: { name: before.name, squad_from: before.squad, squad, cohort_from: before.cohort, cohort },
  });
  back("msg", `${before.name}: ${squad ?? "반 없음"} · ${cohort === null ? "기수 없음" : `${cohort}기`} 저장했습니다.`);
}
