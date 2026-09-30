"use server";
// ─────────────────────────────────────────────────────────────
// 휴가·부상(제외 기간) 서버 액션
//   - 종류: 휴가 / 부상 / 외출·면회 / 전역 1개월 전 면제(전역일만 입력 → 한 달 전부터 자동)
//   - 본인은 자기 기록만, 관리자는 누구의 기록이든 입력·삭제할 수 있습니다.
//   - 승인 절차 없이 입력 즉시 제외됩니다.
//   - 입력한 기간에 걸친 근무일의 "희망" 응답은 자동으로 취소됩니다.
//   - 입력자(created_by)를 기록하고, 변경 이력에도 남깁니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { addDays, formatShort, isValidDate } from "@/lib/kst";
import { dischargeRange, isAbsenceKind, KIND_LABEL } from "@/lib/absence-kinds";

const PAGE = "/absences";
const MAX_DAYS = 366; // 한 번에 입력할 수 있는 최대 기간

// to = 돌아갈 화면: 홈의 입력칸에서 저장했으면 홈(/home), 아니면 휴가·부상 화면(/absences)
function back(kind: "msg" | "error", text: string, to: string = PAGE): never {
  revalidatePath(PAGE);
  revalidatePath("/home");
  redirect(`${to}?${kind}=${encodeURIComponent(text)}`);
}

export async function addAbsenceAction(formData: FormData) {
  const me = await requireMember();
  const to = formData.get("back") === "/home" ? "/home" : PAGE;
  const done: (kind: "msg" | "error", text: string) => never = (kind, text) => back(kind, text, to);
  const kind = String(formData.get("kind") ?? "");
  const end = String(formData.get("end_date") ?? "");
  // 전역 1개월 전 면제는 전역일(end_date)만 받고, 시작일은 한 달 전으로 계산
  const start = kind === "discharge" && isValidDate(end) ? dischargeRange(end).start : String(formData.get("start_date") ?? "");
  // 관리자는 다른 인원을 고를 수 있음. 일반 인원은 항상 본인.
  const targetId = me.is_admin && formData.get("member_id") ? Number(formData.get("member_id")) : me.id;

  if (!isAbsenceKind(kind)) done("error", "종류(휴가·부상·외출/면회·전역 면제)를 선택해 주세요.");
  if (!isValidDate(start) || !isValidDate(end)) done("error", "시작일과 종료일을 선택해 주세요.");
  if (end < start) done("error", "종료일이 시작일보다 앞설 수 없습니다.");
  if (end > addDays(start, MAX_DAYS)) done("error", "한 번에 1년까지만 입력할 수 있습니다.");

  const db = getSupabaseAdmin();
  const { data: target } = await db.from("members").select("id, name, is_active").eq("id", targetId).maybeSingle();
  if (!target || !target.is_active) done("error", "인원을 찾을 수 없습니다.");

  const { error } = await db
    .from("absences")
    .insert({ member_id: targetId, kind, start_date: start, end_date: end, created_by: me.id });
  if (error) {
    // 23514 = 데이터베이스 규칙 위반: 새 종류(외출·면회, 전역 면제)용 SQL(0005)을 아직 실행하지 않은 경우
    done("error", error.code === "23514" ? "외출·면회/전역 면제를 쓰려면 관리자가 추가 SQL(0005)을 실행해야 합니다." : "저장 중 오류: " + error.message);
  }

  // 기간에 걸친 "희망" 응답 자동 취소
  const { data: cancelled } = await db
    .from("responses")
    .delete()
    .eq("member_id", targetId)
    .eq("choice", "want")
    .gte("duty_date", start)
    .lte("duty_date", end)
    .select("duty_date");
  const cancelledDates = (cancelled ?? []).map((r) => r.duty_date as string).sort();
  // 주말 운전 희망도 함께 취소 (표가 없으면(0007 전) 조용히 넘어감)
  await db.from("drive_wants").delete().eq("member_id", targetId).gte("duty_date", start).lte("duty_date", end);

  await writeAudit({
    actorId: me.id,
    action: "absence.add",
    targetMemberId: targetId,
    details: { kind, start_date: start, end_date: end, cancelled_wants: cancelledDates },
  });

  const who = targetId === me.id ? "" : `${target.name} — `;
  const extra = cancelledDates.length
    ? ` 겹치는 희망 ${cancelledDates.length}건(${cancelledDates.map(formatShort).join(", ")})은 자동 취소되었습니다.`
    : "";
  done("msg", `${who}${KIND_LABEL[kind]} ${formatShort(start)} ~ ${formatShort(end)} 제외 기간을 저장했습니다.${extra}`);
}

export async function deleteAbsenceAction(formData: FormData) {
  const me = await requireMember();
  const id = Number(formData.get("id"));
  const db = getSupabaseAdmin();
  const { data: row } = await db.from("absences").select("id, member_id, kind, start_date, end_date").eq("id", id).maybeSingle();
  if (!row) back("error", "기록을 찾을 수 없습니다.");
  if (row.member_id !== me.id && !me.is_admin) back("error", "본인 기록만 삭제할 수 있습니다.");

  await db.from("absences").delete().eq("id", id);
  await writeAudit({ actorId: me.id, action: "absence.delete", targetMemberId: row.member_id, details: row });
  back("msg", "제외 기간을 삭제했습니다.");
}
