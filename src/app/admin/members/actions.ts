"use server";
// ─────────────────────────────────────────────────────────────
// 인원 관리 서버 액션 (관리자 전용)
//   - 계급 변경
//   - 선택한 인원 삭제
//       · 확정 명단(과거 근무)에 한 번도 없던 사람 → 완전히 삭제 (응답·휴가 기록도 함께 삭제)
//       · 확정 명단에 있던 사람 → 과거 명단을 지키기 위해 삭제 대신 "비활성화"
//         (로그인·투표·추첨에서 빠지고, 과거 명단에는 이름이 남음)
//       · 본인, 그리고 마지막 남은 관리자는 삭제할 수 없음
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { RANKS } from "@/lib/voting";

const PAGE = "/admin/members";

function back(kind: "msg" | "error", text: string): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?${kind}=${encodeURIComponent(text)}`);
}

export async function updateRankAction(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("member_id"));
  const raw = String(formData.get("rank") ?? "");
  const rank = raw === "" ? null : raw;
  if (rank !== null && !RANKS.includes(rank as (typeof RANKS)[number])) back("error", "계급을 다시 선택해 주세요.");

  const db = getSupabaseAdmin();
  const { data: m } = await db.from("members").select("name, rank").eq("id", id).maybeSingle();
  if (!m) back("error", "인원을 찾을 수 없습니다.");
  await db.from("members").update({ rank }).eq("id", id);
  await writeAudit({ actorId: me.id, action: "member.rank", targetMemberId: id, details: { name: m.name, from: m.rank, to: rank } });
  back("msg", `${m.name}: 계급을 ${rank ?? "미지정"}(으)로 바꿨습니다.`);
}

export async function deleteMembersAction(formData: FormData) {
  const me = await requireAdmin();
  const ids = formData.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) back("error", "삭제할 인원을 선택해 주세요.");

  const db = getSupabaseAdmin();
  const { data: members } = await db.from("members").select("id, name, is_admin, is_active, session_version").in("id", ids);
  const { data: admins } = await db.from("members").select("id").eq("is_admin", true).eq("is_active", true);
  const { data: withHistory } = await db.from("assignments").select("member_id").in("member_id", ids);
  const historyIds = new Set((withHistory ?? []).map((r) => r.member_id as number));

  // 이번에 빠지게 될 관리자를 빼고도 관리자가 1명 이상 남는지 확인하기 위한 목록
  let remainingAdmins = new Set((admins ?? []).map((a) => a.id as number));
  const deleted: string[] = [];
  const deactivated: string[] = [];
  const skipped: string[] = [];

  for (const m of members ?? []) {
    if (m.id === me.id) {
      skipped.push(`${m.name}(본인)`);
      continue;
    }
    if (m.is_admin && m.is_active) {
      const after = new Set(remainingAdmins);
      after.delete(m.id);
      if (after.size === 0) {
        skipped.push(`${m.name}(마지막 관리자)`);
        continue;
      }
      remainingAdmins = after;
    }

    if (historyIds.has(m.id)) {
      // 과거 확정 명단에 있음 → 비활성화 (기존 로그인도 끊음)
      await db
        .from("members")
        .update({ is_active: false, session_version: m.session_version + 1 })
        .eq("id", m.id);
      await writeAudit({ actorId: me.id, action: "member.deactivate", targetMemberId: m.id, details: { name: m.name, reason: "삭제 요청(과거 명단 있음)" } });
      deactivated.push(m.name);
    } else {
      // 이력 먼저 남기고(이름 보존) 삭제
      await writeAudit({ actorId: me.id, action: "member.delete", details: { name: m.name, id: m.id } });
      const { error } = await db.from("members").delete().eq("id", m.id);
      if (error) skipped.push(`${m.name}(오류)`);
      else deleted.push(m.name);
    }
  }

  const parts = [];
  if (deleted.length) parts.push(`삭제: ${deleted.join(", ")}`);
  if (deactivated.length) parts.push(`과거 명단이 있어 비활성화: ${deactivated.join(", ")}`);
  if (skipped.length) parts.push(`제외: ${skipped.join(", ")}`);
  back(deleted.length || deactivated.length ? "msg" : "error", parts.join(" / "));
}
