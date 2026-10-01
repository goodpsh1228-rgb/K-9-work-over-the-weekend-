"use server";
// ─────────────────────────────────────────────────────────────
// 인원 관리 서버 액션 (관리자 전용)
//   - 계급 변경, 인원 추가, 진료반 변경, 비활성화/재활성화, 비밀번호 초기화, 관리자 지정/내려놓기
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
import { todayKST } from "@/lib/kst";
import { RANKS } from "@/lib/voting";
import { DEFAULT_INITIAL_PASSWORD, hashPassword } from "@/lib/password";

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

// ─────────────────────────────────────────────────────────────
// 7단계: 개별 인원 관리
// ─────────────────────────────────────────────────────────────
function backTo(path: string, kind: "msg" | "error", text: string): never {
  revalidatePath(PAGE);
  revalidatePath(path);
  redirect(`${path}?${kind}=${encodeURIComponent(text)}`);
}

async function loadMember(id: number) {
  const { data } = await getSupabaseAdmin()
    .from("members")
    .select("id, name, is_admin, is_active, is_clinic, session_version")
    .eq("id", id)
    .maybeSingle();
  return data as { id: number; name: string; is_admin: boolean; is_active: boolean; is_clinic: boolean; session_version: number } | null;
}

async function activeAdminCount() {
  const { count } = await getSupabaseAdmin()
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", true)
    .eq("is_active", true);
  return count ?? 0;
}

// 인원 한 명 추가 (초기 비밀번호 1111, 첫 로그인 때 변경)
export async function addMemberAction(formData: FormData) {
  const me = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const raw = String(formData.get("rank") ?? "");
  const rank = raw === "" ? null : raw;
  const isClinic = formData.get("is_clinic") === "on";
  const isDriver = formData.get("is_driver") === "on";
  if (!name || name.length > 30) back("error", "이름을 1~30자로 입력해 주세요.");
  if (rank !== null && !RANKS.includes(rank as (typeof RANKS)[number])) back("error", "계급을 다시 선택해 주세요.");

  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .insert({
      name,
      rank,
      is_clinic: isClinic,
      ...(isDriver ? { is_driver: true } : {}), // 운전병일 때만 (0006 SQL 전에도 일반 추가는 되도록)
      password_hash: await hashPassword(DEFAULT_INITIAL_PASSWORD),
      must_change_password: true,
    })
    .select("id")
    .single();
  if (error) back("error", error.code === "23505" ? `"${name}" 은(는) 이미 있는 이름입니다. (동명이인은 ${name}B 처럼)` : "저장 중 오류: " + error.message);
  await writeAudit({ actorId: me.id, action: "member.add", targetMemberId: data.id, details: { name, rank, is_clinic: isClinic, is_driver: isDriver } });
  back("msg", `${name} 을(를) 추가했습니다. 초기 비밀번호는 ${DEFAULT_INITIAL_PASSWORD} 입니다.`);
}

// 진료반 여부 바꾸기
export async function setClinicAction(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("member_id"));
  const value = formData.get("value") === "true";
  const page = `${PAGE}/${id}`;
  const m = await loadMember(id);
  if (!m) back("error", "인원을 찾을 수 없습니다.");
  await getSupabaseAdmin().from("members").update({ is_clinic: value }).eq("id", id);
  await writeAudit({ actorId: me.id, action: "member.clinic", targetMemberId: id, details: { name: m.name, from: m.is_clinic, to: value } });
  backTo(page, "msg", value ? "진료반으로 바꿨습니다. (진료실 추첨에만 들어갑니다)" : "진료반에서 뺐습니다. (일반 추첨에 들어갑니다)");
}

// 운전병 여부 바꾸기
export async function setDriverAction(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("member_id"));
  const value = formData.get("value") === "true";
  const page = `${PAGE}/${id}`;
  const m = await loadMember(id);
  if (!m) back("error", "인원을 찾을 수 없습니다.");
  const { error } = await getSupabaseAdmin().from("members").update({ is_driver: value }).eq("id", id);
  // 실패하면 원인(오류 문구)도 함께 보여 줌 → 원인 파악용
  if (error) backTo(page, "error", `저장 실패: 추가 SQL(0008_escort.sql)이 실행됐는지 /status 에서 확인해 주세요. (오류: ${error.message})`);
  await writeAudit({ actorId: me.id, action: "member.driver", targetMemberId: id, details: { name: m.name, to: value } });
  backTo(page, "msg", value ? "운전병으로 지정했습니다. (주말 운전을 희망할 수 있고, 운전 추첨 대상이 됩니다)" : "운전병에서 뺐습니다.");
}

// 비활성화 / 다시 활성화
export async function setActiveAction(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("member_id"));
  const value = formData.get("value") === "true";
  const page = `${PAGE}/${id}`;
  const m = await loadMember(id);
  if (!m) back("error", "인원을 찾을 수 없습니다.");
  if (!value) {
    if (id === me.id) backTo(page, "error", "본인은 비활성화할 수 없습니다.");
    if (m.is_admin && m.is_active && (await activeAdminCount()) <= 1) backTo(page, "error", "마지막 관리자는 비활성화할 수 없습니다.");
  }
  await getSupabaseAdmin()
    .from("members")
    .update(value ? { is_active: true } : { is_active: false, session_version: m.session_version + 1 })
    .eq("id", id);
  // 다시 활성화할 때 전역일이 이미 지났으면 지움 (안 지우면 자동 전역 처리로 곧바로 다시 비활성화됨)
  if (value) await getSupabaseAdmin().from("members").update({ discharge_date: null }).eq("id", id).lte("discharge_date", todayKST());
  await writeAudit({ actorId: me.id, action: value ? "member.activate" : "member.deactivate", targetMemberId: id, details: { name: m.name } });
  backTo(page, "msg", value ? "다시 활성화했습니다." : "비활성화했습니다. (로그인·투표·추첨에서 빠짐, 과거 명단은 유지)");
}

// 비밀번호 초기화 → 1111, 다음 로그인 때 변경 강제, 기존 로그인 해제, 로그인 차단 해제
export async function resetPasswordAction(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("member_id"));
  const page = `${PAGE}/${id}`;
  const m = await loadMember(id);
  if (!m) back("error", "인원을 찾을 수 없습니다.");
  await getSupabaseAdmin()
    .from("members")
    .update({
      password_hash: await hashPassword(DEFAULT_INITIAL_PASSWORD),
      must_change_password: true,
      session_version: m.session_version + 1,
      failed_login_count: 0,
      locked_until: null,
    })
    .eq("id", id);
  await writeAudit({ actorId: me.id, action: "member.reset_password", targetMemberId: id, details: { name: m.name } });
  if (id === me.id) redirect("/login"); // 본인 비밀번호를 초기화하면 다시 로그인
  backTo(page, "msg", `비밀번호를 ${DEFAULT_INITIAL_PASSWORD} 으로 초기화했습니다. 다음 로그인 때 새 비밀번호로 바꾸게 됩니다.`);
}

// 관리자로 지정 (본인은 관리자로 유지)
export async function grantAdminAction(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("member_id"));
  const page = `${PAGE}/${id}`;
  const m = await loadMember(id);
  if (!m || !m.is_active) back("error", "활성 인원만 관리자로 지정할 수 있습니다.");
  if (m.is_admin) backTo(page, "error", "이미 관리자입니다.");
  await getSupabaseAdmin().from("members").update({ is_admin: true }).eq("id", id);
  await writeAudit({ actorId: me.id, action: "member.grant_admin", targetMemberId: id, details: { name: m.name } });
  backTo(page, "msg", `${m.name} 을(를) 관리자로 지정했습니다.`);
}

// 내 관리자 권한 내려놓기 (마지막 관리자는 불가)
export async function relinquishAdminAction() {
  const me = await requireAdmin();
  if ((await activeAdminCount()) <= 1) back("error", "마지막 관리자는 권한을 내려놓을 수 없습니다. 먼저 다른 사람을 관리자로 지정해 주세요.");
  await getSupabaseAdmin().from("members").update({ is_admin: false }).eq("id", me.id);
  await writeAudit({ actorId: me.id, action: "member.revoke_admin", targetMemberId: me.id, details: { name: me.name } });
  revalidatePath("/home");
  redirect("/home");
}
