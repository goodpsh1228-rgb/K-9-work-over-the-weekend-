"use server";
// ─────────────────────────────────────────────────────────────
// 로그인 관련 "서버 액션"
//   서버 액션 = 화면의 폼(입력칸 + 버튼)을 제출하면 서버에서 실행되는 함수입니다.
//   비밀번호 확인·데이터베이스 수정은 모두 여기(서버)에서만 일어납니다.
// ─────────────────────────────────────────────────────────────
import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  checkNewPassword,
  getDummyHash,
  hashPassword,
  verifyPassword,
} from "@/lib/password";
import { createSession, destroySession, requireMember } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

// 화면에 돌려줄 결과 (오류 문구 또는 성공 문구)
export type FormState = { error?: string; success?: string };

// 로그인 시도 제한 규칙: 5번 연속 틀리면 10분 동안 로그인 차단
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 10;

const LOGIN_FAILED_MESSAGE = "이름 또는 비밀번호가 올바르지 않습니다.";

// ── 로그인 ────────────────────────────────────────────────────
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !password) return { error: "이름과 비밀번호를 모두 입력해 주세요." };

  const db = getSupabaseAdmin();
  const { data: member, error } = await db
    .from("members")
    .select("id, password_hash, is_active, failed_login_count, locked_until, must_change_password, session_version")
    .eq("name", name)
    .maybeSingle();
  if (error) return { error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };

  // 없는 이름이거나 비활성 인원: 가짜 비교를 한 번 해서 걸리는 시간을 비슷하게 맞춘 뒤 실패 처리
  if (!member || !member.is_active) {
    await verifyPassword(password, await getDummyHash());
    return { error: LOGIN_FAILED_MESSAGE };
  }

  // 차단 중인지 확인
  if (member.locked_until && new Date(member.locked_until).getTime() > Date.now()) {
    const minutes = Math.ceil((new Date(member.locked_until).getTime() - Date.now()) / 60000);
    return { error: `로그인 실패가 많아 잠시 차단되었습니다. 약 ${minutes}분 뒤 다시 시도해 주세요.` };
  }

  const ok = await verifyPassword(password, member.password_hash);
  if (!ok) {
    const fails = member.failed_login_count + 1;
    if (fails >= MAX_FAILED_LOGINS) {
      // 차단 시작, 실패 횟수는 0으로 되돌림 (차단이 풀리면 다시 5번 기회)
      await db
        .from("members")
        .update({ failed_login_count: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() })
        .eq("id", member.id);
      await writeAudit({ actorId: null, action: "auth.locked", targetMemberId: member.id });
      return { error: `비밀번호를 ${MAX_FAILED_LOGINS}번 틀려 ${LOCK_MINUTES}분 동안 로그인이 차단됩니다.` };
    }
    await db.from("members").update({ failed_login_count: fails }).eq("id", member.id);
    return { error: `${LOGIN_FAILED_MESSAGE} (${MAX_FAILED_LOGINS - fails}번 더 틀리면 잠시 차단)` };
  }

  // 성공: 실패 기록 초기화 후 쿠키 발급
  if (member.failed_login_count !== 0 || member.locked_until) {
    await db.from("members").update({ failed_login_count: 0, locked_until: null }).eq("id", member.id);
  }
  await createSession(member.id, member.session_version);
  redirect(member.must_change_password ? "/change-password" : "/home");
}

// ── 로그아웃 ──────────────────────────────────────────────────
export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

// ── 비밀번호 변경 (첫 로그인 강제 변경 포함) ──────────────────
export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireMember({ allowMustChange: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const rule = checkNewPassword(next);
  if (rule) return { error: rule };
  if (next !== confirm) return { error: "새 비밀번호 두 칸이 서로 다릅니다." };

  const db = getSupabaseAdmin();
  const { data: row } = await db.from("members").select("password_hash").eq("id", me.id).single();
  if (!row) return { error: "인원 정보를 찾을 수 없습니다." };

  // 스스로 바꿀 때는 현재 비밀번호 확인 (첫 로그인 강제 변경은 방금 로그인했으므로 생략)
  if (!me.must_change_password && !(await verifyPassword(current, row.password_hash))) {
    return { error: "현재 비밀번호가 올바르지 않습니다." };
  }
  if (await verifyPassword(next, row.password_hash)) {
    return { error: "지금 비밀번호와 다른 비밀번호를 입력해 주세요." };
  }

  const newVersion = me.session_version + 1; // 다른 기기의 로그인은 풀리게 함
  const { error } = await db
    .from("members")
    .update({ password_hash: await hashPassword(next), must_change_password: false, session_version: newVersion })
    .eq("id", me.id);
  if (error) return { error: "저장 중 오류가 발생했습니다." };

  await writeAudit({ actorId: me.id, action: "auth.password_change", targetMemberId: me.id });
  await createSession(me.id, newVersion); // 지금 기기는 로그인 유지
  redirect("/home");
}

// ── 비상 관리자 복구 (화면 어디에도 링크하지 않음) ────────────
// 서버 환경변수 EMERGENCY_KEY 를 아는 사람만 사용 가능.
//  - 입력한 이름이 없으면: 새 관리자로 등록
//  - 이미 있으면: 관리자 권한 부여 + 활성화 + 비밀번호 재설정 + 차단 해제
// 처음 관리자 1명을 만들 때도 이 기능을 씁니다.
const MIN_EMERGENCY_KEY_LENGTH = 16;

export async function emergencyRecoverAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const configured = process.env.EMERGENCY_KEY ?? "";
  if (configured.length < MIN_EMERGENCY_KEY_LENGTH) {
    return { error: `서버에 EMERGENCY_KEY 가 없거나 너무 짧습니다(${MIN_EMERGENCY_KEY_LENGTH}자 이상 필요).` };
  }
  const key = String(formData.get("key") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // 두 값을 같은 길이의 해시로 바꿔서 비교 (길이·시간 차이로 정보가 새지 않게)
  const a = createHash("sha256").update(key).digest();
  const b = createHash("sha256").update(configured).digest();
  if (!timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 1000)); // 무작위 대입을 느리게
    return { error: "비상 키가 올바르지 않습니다." };
  }
  if (!name || name.length > 30) return { error: "이름을 1~30자로 입력해 주세요." };
  const rule = checkNewPassword(password);
  if (rule) return { error: rule };

  const db = getSupabaseAdmin();
  const passwordHash = await hashPassword(password);
  const { data: existing } = await db.from("members").select("id, session_version").eq("name", name).maybeSingle();

  if (existing) {
    const { error } = await db
      .from("members")
      .update({
        password_hash: passwordHash,
        is_admin: true,
        is_active: true,
        must_change_password: false,
        failed_login_count: 0,
        locked_until: null,
        session_version: existing.session_version + 1,
      })
      .eq("id", existing.id);
    if (error) return { error: "저장 중 오류가 발생했습니다." };
    await writeAudit({ actorId: null, action: "emergency.recover", targetMemberId: existing.id, details: { created: false } });
  } else {
    const { data: created, error } = await db
      .from("members")
      .insert({ name, password_hash: passwordHash, is_admin: true, must_change_password: false })
      .select("id")
      .single();
    if (error || !created) return { error: "등록 중 오류가 발생했습니다." };
    await writeAudit({ actorId: null, action: "emergency.recover", targetMemberId: created.id, details: { created: true } });
  }
  return { success: `"${name}" 을(를) 관리자로 설정했습니다. 이제 로그인 화면에서 로그인하세요.` };
}
