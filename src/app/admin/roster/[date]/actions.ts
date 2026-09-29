"use server";
// ─────────────────────────────────────────────────────────────
// 확정 명단 수정 서버 액션 (관리자 전용) — 추첨이 끝난 날만
//   - 삭제: 명단에서 한 사람 빼기
//   - 추가: 사람 + 자리를 골라 넣기 (꼬리표 "관리자 수정")
//   - 교체: 한 사람을 다른 사람으로 바꾸기 (같은 자리, 꼬리표 "관리자 수정")
//   휴가·부상 중인 사람도 넣을 수 있습니다(화면에서 경고만). 변경 이력에 "제외 기간 중" 표시를 남깁니다.
//   변경 후에는 인원 부족 수를 다시 계산해 저장합니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { isValidDate } from "@/lib/kst";
import { getExcludedIds, getPostsForDate } from "@/lib/day-board";
import { getDraw } from "@/lib/draw-server";

function back(date: string, kind: "msg" | "error", text: string): never {
  revalidatePath(`/admin/roster/${date}`);
  revalidatePath(`/day/${date}`);
  revalidatePath("/home");
  redirect(`/admin/roster/${date}?${kind}=${encodeURIComponent(text)}`);
}

async function common(formData: FormData) {
  const me = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  if (!isValidDate(date)) redirect("/home");
  if (!(await getDraw(date))) back(date, "error", "아직 추첨하지 않은 날입니다.");
  return { me, date, db: getSupabaseAdmin() };
}

async function memberName(id: number) {
  const { data } = await getSupabaseAdmin().from("members").select("name, is_active").eq("id", id).maybeSingle();
  return data as { name: string; is_active: boolean } | null;
}

// 명단이 바뀐 뒤 인원 부족 수 다시 계산 → draws 에 저장 (홈 배지·알림에 반영)
async function recomputeShortage(date: string) {
  const db = getSupabaseAdmin();
  const [posts, { data: rows }] = await Promise.all([
    getPostsForDate(date),
    db.from("assignments").select("post_id").eq("duty_date", date),
  ]);
  const count = new Map<number, number>();
  for (const r of rows ?? []) count.set(r.post_id, (count.get(r.post_id) ?? 0) + 1);
  const short = { clinic: 0, general: 0 };
  for (const p of posts) short[p.pool] += Math.max(0, p.required - (count.get(p.id) ?? 0));
  await db.from("draws").update({ clinic_shortage: short.clinic, general_shortage: short.general }).eq("duty_date", date);
}

export async function removeAssignmentAction(formData: FormData) {
  const { me, date, db } = await common(formData);
  const memberId = Number(formData.get("member_id"));
  const { data: row } = await db
    .from("assignments")
    .select("id, post_id, source")
    .eq("duty_date", date)
    .eq("member_id", memberId)
    .maybeSingle();
  if (!row) back(date, "error", "명단에 없는 사람입니다.");
  await db.from("assignments").delete().eq("id", row.id);
  await recomputeShortage(date);
  const name = (await memberName(memberId))?.name ?? "?";
  const post = (await getPostsForDate(date)).find((p) => p.id === row.post_id)?.name;
  await writeAudit({ actorId: me.id, action: "roster.remove", targetMemberId: memberId, dutyDate: date, details: { name, post, source: row.source } });
  back(date, "msg", `${name} 을(를) 명단에서 뺐습니다.`);
}

export async function addAssignmentAction(formData: FormData) {
  const { me, date, db } = await common(formData);
  const memberId = Number(formData.get("member_id"));
  const postId = Number(formData.get("post_id"));
  const m = await memberName(memberId);
  if (!m || !m.is_active) back(date, "error", "인원을 선택해 주세요.");
  const post = (await getPostsForDate(date)).find((p) => p.id === postId);
  if (!post) back(date, "error", "자리를 선택해 주세요.");

  const { error } = await db.from("assignments").insert({ duty_date: date, member_id: memberId, post_id: postId, source: "admin" });
  if (error) back(date, "error", error.code === "23505" ? `${m.name} 은(는) 이미 명단에 있습니다.` : "저장 중 오류: " + error.message);
  await recomputeShortage(date);
  const excluded = (await getExcludedIds(date)).has(memberId);
  await writeAudit({ actorId: me.id, action: "roster.add", targetMemberId: memberId, dutyDate: date, details: { name: m.name, post: post.name, excluded } });
  back(date, "msg", `${m.name} 을(를) ${post.name}에 넣었습니다.${excluded ? " (휴가·부상 기간 중인 사람)" : ""}`);
}

export async function replaceAssignmentAction(formData: FormData) {
  const { me, date, db } = await common(formData);
  const oldId = Number(formData.get("old_member_id"));
  const newId = Number(formData.get("member_id"));
  const { data: row } = await db
    .from("assignments")
    .select("id, post_id, source")
    .eq("duty_date", date)
    .eq("member_id", oldId)
    .maybeSingle();
  if (!row) back(date, "error", "명단에 없는 사람입니다.");
  const newM = await memberName(newId);
  if (!newM || !newM.is_active) back(date, "error", "바꿀 사람을 선택해 주세요.");

  // 새 사람을 넣고(같은 자리), 성공하면 예전 사람을 뺍니다.
  const { error } = await db.from("assignments").insert({ duty_date: date, member_id: newId, post_id: row.post_id, source: "admin" });
  if (error) back(date, "error", error.code === "23505" ? `${newM.name} 은(는) 이미 명단에 있습니다.` : "저장 중 오류: " + error.message);
  await db.from("assignments").delete().eq("id", row.id);
  await recomputeShortage(date);

  const oldName = (await memberName(oldId))?.name ?? "?";
  const post = (await getPostsForDate(date)).find((p) => p.id === row.post_id)?.name;
  const excluded = (await getExcludedIds(date)).has(newId);
  await writeAudit({
    actorId: me.id,
    action: "roster.replace",
    targetMemberId: newId,
    dutyDate: date,
    details: { from: oldName, to: newM.name, post, excluded },
  });
  back(date, "msg", `${post}: ${oldName} → ${newM.name} 으로 바꿨습니다.${excluded ? " (휴가·부상 기간 중인 사람)" : ""}`);
}
