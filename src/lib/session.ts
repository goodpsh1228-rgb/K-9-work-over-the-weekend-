// ─────────────────────────────────────────────────────────────
// 로그인 상태(세션) 도구
//
// 로그인에 성공하면 휴대폰 브라우저에 "쿠키"(사이트가 브라우저에 맡겨 두는 작은 메모)를 줍니다.
// 쿠키 안에는 "몇 번 인원인지 + 만료 시각"과, 위조 방지용 "서명"이 들어 있습니다.
//   - 서명: 서버만 아는 비밀 값으로 만든 도장. 누가 쿠키 내용을 고치면 도장이 안 맞아 거부됩니다.
//   - httpOnly: 웹페이지의 자바스크립트가 쿠키를 읽을 수 없게 해서 탈취를 어렵게 합니다.
//
// session_version(세션 번호):
//   비밀번호를 바꾸거나, 관리자가 비밀번호를 초기화·비활성화하면 번호가 1 올라갑니다.
//   그러면 예전 번호가 적힌 쿠키는 모두 무효 → 다른 기기의 로그인이 자동으로 풀립니다.
// ─────────────────────────────────────────────────────────────
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const COOKIE_NAME = "k9_session";
const SESSION_DAYS = 30; // 로그인 유지 기간

// 로그인한 사람 정보 (비밀번호 해시는 포함하지 않음)
export type Member = {
  id: number;
  name: string;
  is_admin: boolean;
  is_clinic: boolean;
  must_change_password: boolean;
  session_version: number;
  rank: string | null; // 계급 (이병/일병/상병/병장, 미지정이면 null)
};

// 서명에 쓰는 비밀 값.
// SESSION_SECRET 환경변수가 있으면 그것을 쓰고, 없으면 Supabase 비밀 키에서 파생해 씁니다.
// (아이패드에서 설정할 값을 줄이기 위함. 어느 쪽이든 서버 밖으로 나가지 않습니다.)
function signingKey(): Buffer {
  const base = process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!base) throw new Error("서명용 비밀 값이 없습니다 (SESSION_SECRET 또는 SUPABASE_SECRET_KEY).");
  return createHmac("sha256", base).update("k9-session-signing-v1").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

type Payload = { m: number; v: number; e: number }; // m=인원 번호, v=세션 번호, e=만료(ms)

// 쿠키 만들기 (서버 액션 안에서만 호출 가능)
export async function createSession(memberId: number, sessionVersion: number) {
  const payload: Payload = { m: memberId, v: sessionVersion, e: Date.now() + SESSION_DAYS * 86400_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const store = await cookies();
  store.set(COOKIE_NAME, `${body}.${sign(body)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // 배포 사이트(https)에서만 전송
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// 쿠키를 읽어 "지금 로그인한 사람"을 돌려줍니다. 로그인 안 했거나 무효면 null.
export async function getCurrentMember(): Promise<Member | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null; // 서명 불일치 = 위조

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (payload.e < Date.now()) return null; // 만료

  // 데이터베이스에서 최신 상태 확인 (비활성화·세션 번호 변경 반영)
  const db = getSupabaseAdmin();
  const BASE = "id, name, is_admin, is_clinic, must_change_password, session_version, is_active";
  let { data, error } = await db.from("members").select(`${BASE}, rank`).eq("id", payload.m).maybeSingle();
  if (error) {
    // 계급(rank) 칸이 아직 없는 경우(0004 SQL 실행 전)에도 로그인이 되도록, 계급 없이 다시 읽습니다.
    console.error("인원 정보 읽기 실패(계급 제외 후 재시도):", error.message);
    ({ data, error } = await db.from("members").select(BASE).eq("id", payload.m).maybeSingle());
    if (data) data = { ...data, rank: null };
  }
  if (!data || !data.is_active || data.session_version !== payload.v) return null;

  return {
    id: data.id,
    name: data.name,
    is_admin: data.is_admin,
    is_clinic: data.is_clinic,
    must_change_password: data.must_change_password,
    session_version: data.session_version,
    rank: data.rank,
  };
}

// 로그인이 필요한 화면에서 호출: 로그인 안 했으면 로그인 화면으로 보냄.
// 첫 로그인(비밀번호 변경 필요)이면 비밀번호 변경 화면으로 보냄.
export async function requireMember(options?: { allowMustChange?: boolean }): Promise<Member> {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  if (member.must_change_password && !options?.allowMustChange) redirect("/change-password");
  return member;
}

// 관리자만 들어갈 수 있는 화면/기능에서 호출
export async function requireAdmin(): Promise<Member> {
  const member = await requireMember();
  if (!member.is_admin) redirect("/home");
  return member;
}
