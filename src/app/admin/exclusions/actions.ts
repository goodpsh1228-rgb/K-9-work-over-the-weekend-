"use server";
// ─────────────────────────────────────────────────────────────
// 추첨 제외 인원 저장 (관리자 전용)
//   체크한 사람 = 추첨 제외(draw_excluded = true), 체크 해제 = 다시 추첨 대상
//   바뀐 사람만 저장하고 변경 이력에 남깁니다.
//   제외되는 사람의 앞으로 남은 출근 희망·운전 희망은 자동 취소합니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { todayKST } from "@/lib/kst";

function back(kind: "msg" | "error", text: string): never {
  revalidatePath("/admin/exclusions");
  revalidatePath("/home");
  redirect(`/admin/exclusions?${kind}=${encodeURIComponent(text)}`);
}

export async function saveExclusionsAction(formData: FormData) {
  const me = await requireAdmin();
  const checked = new Set(formData.getAll("ids").map(Number));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 50) || null;
  const db = getSupabaseAdmin();
  const { data: members, error } = await db.from("members").select("id, name, draw_excluded").eq("is_active", true);
  if (error) back("error", "추첨 제외 기능용 SQL(supabase/migrations/0010_draw_excluded.sql)을 먼저 실행해 주세요.");

  const add = (members ?? []).filter((m) => checked.has(m.id) && !m.draw_excluded);
  const remove = (members ?? []).filter((m) => !checked.has(m.id) && m.draw_excluded);
  if (add.length === 0 && remove.length === 0) back("msg", "바뀐 내용이 없습니다.");

  if (add.length) {
    const ids = add.map((m) => m.id);
    await db.from("members").update({ draw_excluded: true, draw_excluded_reason: reason }).in("id", ids);
    // 오늘 이후의 출근 희망·운전 희망 자동 취소 (제외되면 의미가 없으므로)
    await db.from("responses").delete().in("member_id", ids).eq("choice", "want").gte("duty_date", todayKST());
    await db.from("drive_wants").delete().in("member_id", ids).gte("duty_date", todayKST());
  }
  if (remove.length) {
    await db.from("members").update({ draw_excluded: false, draw_excluded_reason: null }).in("id", remove.map((m) => m.id));
  }
  for (const m of add) await writeAudit({ actorId: me.id, action: "member.draw_exclude", targetMemberId: m.id, details: { name: m.name, reason } });
  for (const m of remove) await writeAudit({ actorId: me.id, action: "member.draw_include", targetMemberId: m.id, details: { name: m.name } });

  const parts = [
    add.length ? `제외: ${add.map((m) => m.name).join(", ")}` : "",
    remove.length ? `다시 추첨 대상: ${remove.map((m) => m.name).join(", ")}` : "",
  ].filter(Boolean);
  back("msg", `저장했습니다. ${parts.join(" / ")}`);
}
