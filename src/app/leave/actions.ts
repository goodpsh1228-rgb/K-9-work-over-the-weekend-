"use server";
// ─────────────────────────────────────────────────────────────
// 휴가 계산기 서버 액션 (본인 기록만)
//   - 입대일·전역일 저장
//   - 휴가·외출·면회 기록 추가 / 삭제
//   - "주말출근 제외로 보내기": 기록을 제외 기간(absences)으로 만들어 그 기간 추첨에서 빠지게 함
//     (겹치는 출근 희망·운전 희망은 자동 취소) / "보내기 취소": 제외 기간 삭제
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { addDays, formatShort, isValidDate, todayKST } from "@/lib/kst";
import { defaultDischarge, rankOn } from "@/lib/promotion";
import { syncServiceStatusSafely } from "@/lib/service-sync";
import { isFullLeave, isLeaveKind, isValidMonth, isValidSubkind, LEAVE_LABEL } from "@/lib/leave";

const SQL_HINT = "휴가 계산기용 SQL(0009)을 관리자가 먼저 실행해야 합니다.";

// 저장 후 휴가 계산기 화면(보던 달)으로 돌아감
function back(formData: FormData, kind: "msg" | "error", text: string): never {
  const month = String(formData.get("month") ?? "");
  revalidatePath("/leave");
  revalidatePath("/home");
  revalidatePath("/absences");
  const m = isValidMonth(month) ? `month=${month}&` : "";
  redirect(`/leave?${m}${kind}=${encodeURIComponent(text)}`);
}

// 입대일·전역일 저장
export async function saveServiceDatesAction(formData: FormData) {
  const me = await requireMember();
  const enlist = String(formData.get("enlist_date") ?? "");
  const rawDischarge = String(formData.get("discharge_date") ?? "");
  if (!isValidDate(enlist)) back(formData, "error", "입대일을 입력해 주세요.");
  // 전역일을 비우면 입대일 + 21개월 − 1일
  const discharge = rawDischarge === "" ? defaultDischarge(enlist) : rawDischarge;
  if (!isValidDate(discharge)) back(formData, "error", "전역일을 올바르게 입력해 주세요.");
  if (discharge <= enlist) back(formData, "error", "전역일은 입대일보다 뒤여야 합니다.");
  if (discharge > addDays(enlist, 365 * 3)) back(formData, "error", "복무 기간이 너무 깁니다. 날짜를 확인해 주세요.");
  const { error } = await getSupabaseAdmin().from("members").update({ enlist_date: enlist, discharge_date: discharge }).eq("id", me.id);
  if (error) back(formData, "error", SQL_HINT);
  await syncServiceStatusSafely({ force: true }); // 계급을 입대일 기준으로 바로 맞춤
  back(formData, "msg", `입대일·전역일을 저장했습니다. 계급은 입대일 기준으로 자동 진급됩니다 (지금: ${rankOn(enlist, todayKST())}).`);
}

// 기록 하나를 제외 기간(absences)으로 보내기 — 추가할 때와 "보내기" 버튼이 같이 씀
async function sendToDraw(meId: number, leave: { id: number; kind: string; start_date: string; end_date: string }) {
  const db = getSupabaseAdmin();
  const { data: absence, error } = await db
    .from("absences")
    .insert({
      member_id: meId,
      kind: isFullLeave(leave.kind) ? "leave" : "outing", // 휴가 → "휴가", 외출·면회 → "외출·면회"
      start_date: leave.start_date,
      end_date: leave.end_date,
      created_by: meId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message, cancelled: 0 };
  await db.from("leaves").update({ absence_id: absence.id }).eq("id", leave.id);
  // 겹치는 출근 희망·운전 희망 자동 취소 (제외 입력과 같은 규칙)
  const { data: cancelled } = await db
    .from("responses")
    .delete()
    .eq("member_id", meId)
    .eq("choice", "want")
    .gte("duty_date", leave.start_date)
    .lte("duty_date", leave.end_date)
    .select("duty_date");
  await db.from("drive_wants").delete().eq("member_id", meId).gte("duty_date", leave.start_date).lte("duty_date", leave.end_date);
  await writeAudit({
    actorId: meId,
    action: "absence.add",
    targetMemberId: meId,
    details: {
      kind: isFullLeave(leave.kind) ? "leave" : "outing",
      start_date: leave.start_date,
      end_date: leave.end_date,
      cancelled_wants: (cancelled ?? []).map((r) => r.duty_date),
      from: "휴가 계산기",
    },
  });
  return { error: null, cancelled: (cancelled ?? []).length };
}

// 기록 추가 (휴가·외출·면회)
export async function addLeaveAction(formData: FormData) {
  const me = await requireMember();
  const kind = String(formData.get("kind") ?? "");
  const subRaw = String(formData.get("subkind") ?? "");
  const subkind = subRaw === "" ? null : subRaw;
  const start = String(formData.get("start_date") ?? "");
  const endRaw = String(formData.get("end_date") ?? "");
  const end = endRaw === "" ? start : endRaw; // 외출·면회는 하루만 입력해도 됨
  const memo = String(formData.get("memo") ?? "").trim().slice(0, 100) || null;
  const send = formData.get("send") === "on";

  if (!isLeaveKind(kind)) back(formData, "error", "종류를 선택해 주세요.");
  if (!isValidSubkind(kind, subkind)) back(formData, "error", "세부 종류를 선택해 주세요.");
  if (!isValidDate(start) || !isValidDate(end)) back(formData, "error", "날짜를 입력해 주세요.");
  if (end < start) back(formData, "error", "종료일이 시작일보다 앞설 수 없습니다.");
  if (end > addDays(start, 60)) back(formData, "error", "한 번에 60일까지만 입력할 수 있습니다.");

  const db = getSupabaseAdmin();
  const { data: leave, error } = await db
    .from("leaves")
    .insert({ member_id: me.id, kind, subkind, start_date: start, end_date: end, memo })
    .select("id, kind, start_date, end_date")
    .single();
  if (error) back(formData, "error", SQL_HINT);

  formData.set("month", start.slice(0, 7)); // 저장한 기록이 있는 달로 달력 이동
  const period = start === end ? formatShort(start) : `${formatShort(start)} ~ ${formatShort(end)}`;
  let extra = "";
  if (send) {
    const r = await sendToDraw(me.id, leave);
    extra = r.error
      ? " (주말출근 제외 보내기는 실패했습니다)"
      : ` 주말출근 추첨에서 제외됩니다.${r.cancelled ? ` 겹친 출근 희망 ${r.cancelled}건은 취소되었습니다.` : ""}`;
  }
  back(formData, "msg", `${LEAVE_LABEL[kind]} ${period} 기록을 저장했습니다.${extra}`);
}

// 본인 기록 찾기 (남의 기록은 건드릴 수 없음)
async function myLeave(formData: FormData, meId: number) {
  const id = Number(formData.get("id"));
  const { data } = await getSupabaseAdmin()
    .from("leaves")
    .select("id, member_id, kind, start_date, end_date, absence_id")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.member_id !== meId) back(formData, "error", "기록을 찾을 수 없습니다.");
  return data as { id: number; member_id: number; kind: string; start_date: string; end_date: string; absence_id: number | null };
}

// 주말출근 제외로 보내기
export async function sendLeaveAction(formData: FormData) {
  const me = await requireMember();
  const leave = await myLeave(formData, me.id);
  if (leave.absence_id) back(formData, "msg", "이미 주말출근 제외로 보낸 기록입니다.");
  const r = await sendToDraw(me.id, leave);
  if (r.error) back(formData, "error", "보내기 실패: " + r.error);
  back(formData, "msg", `주말출근 추첨에서 제외되도록 보냈습니다.${r.cancelled ? ` 겹친 출근 희망 ${r.cancelled}건은 취소되었습니다.` : ""}`);
}

// 보내기 취소 (제외 기간 삭제 → 다시 추첨 대상)
export async function unsendLeaveAction(formData: FormData) {
  const me = await requireMember();
  const leave = await myLeave(formData, me.id);
  if (leave.absence_id) await removeAbsence(me.id, leave.absence_id);
  await getSupabaseAdmin().from("leaves").update({ absence_id: null }).eq("id", leave.id);
  back(formData, "msg", "주말출근 제외를 취소했습니다. 다시 추첨 대상입니다.");
}

// 기록 삭제 (보낸 제외 기간도 함께 삭제)
export async function deleteLeaveAction(formData: FormData) {
  const me = await requireMember();
  const leave = await myLeave(formData, me.id);
  if (leave.absence_id) await removeAbsence(me.id, leave.absence_id);
  await getSupabaseAdmin().from("leaves").delete().eq("id", leave.id);
  back(formData, "msg", "기록을 삭제했습니다.");
}

async function removeAbsence(meId: number, absenceId: number) {
  const db = getSupabaseAdmin();
  const { data: row } = await db.from("absences").select("id, member_id, kind, start_date, end_date").eq("id", absenceId).maybeSingle();
  if (!row || row.member_id !== meId) return;
  await db.from("absences").delete().eq("id", absenceId);
  await writeAudit({ actorId: meId, action: "absence.delete", targetMemberId: meId, details: { ...row, from: "휴가 계산기" } });
}
