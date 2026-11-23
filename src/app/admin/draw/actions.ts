"use server";
// ─────────────────────────────────────────────────────────────
// [한 달 차출하기] 서버 액션 (관리자 전용)
//   그 달 모든 근무일의 공석을 순번으로 한꺼번에 채웁니다. 한 달에 한 번만 실행됩니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { getDraw } from "@/lib/draw-server";
import { isValidDate } from "@/lib/kst";
import { executeMonthlyDraw, isValidMonth } from "@/lib/monthly-draw-server";

export async function monthlyDrawAction(formData: FormData) {
  const me = await requireAdmin();
  const month = String(formData.get("month") ?? "");
  if (!isValidMonth(month)) redirect("/admin/draw");
  let kind: "msg" | "error" = "msg";
  let text: string;
  try {
    const seed = String(formData.get("seed") ?? "").replace(/[^0-9a-z]/g, "").slice(0, 40); // 미리보기와 같은 결과를 재현
    const r = await executeMonthlyDraw(month, me.id, seed || undefined);
    if (r.status === "not-ready") {
      kind = "error";
      text = r.reason;
    } else if (r.status === "already") {
      text = "이미 차출이 끝난 달입니다. (결과는 한 번만 만들어집니다)";
    } else {
      const short = Object.values(r.shortage).reduce((a, b) => a + b, 0);
      text =
        `${month} 차출을 완료했습니다. ${r.days}일 · 순번으로 ${r.picked}명 뽑힘.` +
        (r.unassignedDong > 0 ? ` 동을 정해야 하는 사람 ${r.unassignedDong}명 → 각 날짜 [명단 수정]에서 배정해 주세요.` : "") +
        (short > 0 ? ` ⚠️ 인원 부족 ${short}명.` : "");
    }
  } catch (e) {
    kind = "error";
    text = e instanceof Error ? e.message : "차출 중 오류가 났습니다.";
  }
  revalidatePath("/admin/draw");
  revalidatePath("/home");
  redirect(`/admin/draw?month=${month}&${kind}=${encodeURIComponent(text)}`);
}

// ── 미리보기에서 관리자 조정: 뽑힌 사람을 이 날 순번에서 빼기 / 되돌리기 ──
//   "관리자 제외"(absences, 종류 excused) 를 그날 하루로 만듭니다. 그러면 다시 계산할 때 그 사람은
//   "출근 불가"로 건너뛰어지고(빚 기록), 다음 순번 사람이 대신 뽑힙니다.
function previewUrl(month: string, seed: string, kind: "msg" | "error", text: string) {
  return `/admin/draw/preview?month=${month}&seed=${seed}&${kind}=${encodeURIComponent(text)}`;
}
const cleanSeed = (v: FormDataEntryValue | null) => String(v ?? "").replace(/[^0-9a-z]/g, "").slice(0, 40);

export async function excludeFromDayAction(formData: FormData) {
  const me = await requireAdmin();
  const month = String(formData.get("month") ?? "");
  const date = String(formData.get("date") ?? "");
  const memberId = Number(formData.get("member_id"));
  const seed = cleanSeed(formData.get("seed"));
  if (!isValidMonth(month) || !isValidDate(date) || !date.startsWith(month) || !Number.isInteger(memberId)) redirect("/admin/draw");
  if (await getDraw(date)) redirect(previewUrl(month, seed, "error", "이미 차출이 끝난 날입니다. 명단 수정을 이용하세요."));
  const db = getSupabaseAdmin();
  const { data: m } = await db.from("members").select("name").eq("id", memberId).maybeSingle();
  const { error } = await db.from("absences").insert({ member_id: memberId, kind: "excused", start_date: date, end_date: date, created_by: me.id });
  if (error) redirect(previewUrl(month, seed, "error", "저장 중 오류: " + error.message));
  await writeAudit({ actorId: me.id, action: "absence.add", targetMemberId: memberId, dutyDate: date, details: { kind: "excused", start_date: date, end_date: date, name: m?.name, from: "차출 미리보기" } });
  revalidatePath("/admin/draw/preview");
  redirect(previewUrl(month, seed, "msg", `${m?.name ?? "?"} 을(를) ${date.slice(5).replace("-", "/")} 순번에서 뺐습니다. 다음 순번 사람으로 다시 계산했어요. (빠진 사람은 빚으로 기록되어 다음에 먼저 배정됩니다)`));
}

export async function undoExcludeAction(formData: FormData) {
  const me = await requireAdmin();
  const month = String(formData.get("month") ?? "");
  const seed = cleanSeed(formData.get("seed"));
  const id = Number(formData.get("absence_id"));
  if (!isValidMonth(month)) redirect("/admin/draw");
  const db = getSupabaseAdmin();
  const { data: row } = await db.from("absences").select("id, member_id, kind, start_date, end_date").eq("id", id).maybeSingle();
  if (!row || row.kind !== "excused") redirect(previewUrl(month, seed, "error", "기록을 찾을 수 없습니다."));
  if (await getDraw(row.start_date as string)) redirect(previewUrl(month, seed, "error", "이미 차출이 끝난 날입니다."));
  await db.from("absences").delete().eq("id", id);
  await writeAudit({ actorId: me.id, action: "absence.delete", targetMemberId: row.member_id, details: row });
  revalidatePath("/admin/draw/preview");
  redirect(previewUrl(month, seed, "msg", "되돌렸습니다. 다시 계산했어요."));
}
