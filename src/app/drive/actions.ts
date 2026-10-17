"use server";
// ─────────────────────────────────────────────────────────────
// 운전 지정 서버 액션 (/drive)
//   - 운전병과 관리자만 쓸 수 있고, 그 사람들끼리 서로의 지정을 추가·삭제(수정)할 수 있습니다.
//   - 휴가처럼 "시작일 ~ 종료일(양 끝 포함)"로 지정합니다. 지정 대상은 활성 운전병.
//   - 같은 사람의 기간이 겹치게 지정할 수는 없습니다(이어서 지정하려면 겹치지 않게).
//   - 변경 이력(drive.add / drive.delete)에 남깁니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember, type Member } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { addDays, formatShort, isValidDate } from "@/lib/kst";

const PAGE = "/drive";
const MAX_DAYS = 366;
const SQL_HINT = "운전 지정용 SQL(0017)을 관리자가 먼저 실행해야 합니다.";

function back(kind: "msg" | "error", text: string): never {
  revalidatePath(PAGE);
  revalidatePath("/home");
  revalidatePath("/lineup");
  redirect(`${PAGE}?${kind}=${encodeURIComponent(text)}`);
}

// 운전병 또는 관리자만
function guard(me: Member) {
  if (!me.is_driver && !me.is_admin) redirect("/home");
}

export async function addDriveDutyAction(formData: FormData) {
  const me = await requireMember();
  guard(me);
  const memberId = Number(formData.get("member_id"));
  const start = String(formData.get("start_date") ?? "");
  const end = String(formData.get("end_date") ?? "") || start;
  if (!isValidDate(start) || !isValidDate(end)) back("error", "시작일과 종료일을 선택해 주세요.");
  if (end < start) back("error", "종료일이 시작일보다 앞설 수 없습니다.");
  if (end > addDays(start, MAX_DAYS)) back("error", "한 번에 1년까지만 지정할 수 있습니다.");

  const db = getSupabaseAdmin();
  const { data: target } = await db.from("members").select("id, name, is_active, is_driver").eq("id", memberId).maybeSingle();
  if (!target || !target.is_active || !target.is_driver) back("error", "운전병만 지정할 수 있습니다.");

  // 같은 사람의 겹치는 지정이 있으면 막음
  const { data: dup, error: dupErr } = await db
    .from("drive_duties")
    .select("start_date, end_date")
    .eq("member_id", memberId)
    .lte("start_date", end)
    .gte("end_date", start)
    .limit(1);
  if (dupErr) back("error", SQL_HINT);
  if (dup && dup.length) back("error", `${target.name}님은 이미 ${formatShort(dup[0].start_date)} ~ ${formatShort(dup[0].end_date)}에 지정되어 있어 겹칩니다. 기존 지정을 지우고 다시 지정해 주세요.`);

  const { error } = await db.from("drive_duties").insert({ member_id: memberId, start_date: start, end_date: end, created_by: me.id });
  if (error) back("error", "저장 중 오류: " + error.message);
  await writeAudit({ actorId: me.id, action: "drive.add", targetMemberId: memberId, details: { name: target.name, start_date: start, end_date: end } });
  back("msg", `${target.name} — 운전 ${formatShort(start)} ~ ${formatShort(end)} 지정했습니다. 운전하는 날은 1차 명단에서 빠집니다.`);
}

export async function deleteDriveDutyAction(formData: FormData) {
  const me = await requireMember();
  guard(me);
  const id = Number(formData.get("id"));
  const db = getSupabaseAdmin();
  const { data: row } = await db.from("drive_duties").select("id, member_id, start_date, end_date").eq("id", id).maybeSingle();
  if (!row) back("error", "지정을 찾을 수 없습니다.");
  const { data: m } = await db.from("members").select("name").eq("id", row.member_id).maybeSingle();
  await db.from("drive_duties").delete().eq("id", id);
  await writeAudit({ actorId: me.id, action: "drive.delete", targetMemberId: row.member_id, details: { name: m?.name ?? "", start_date: row.start_date, end_date: row.end_date } });
  back("msg", `${m?.name ?? ""} 운전 지정을 삭제했습니다.`);
}
