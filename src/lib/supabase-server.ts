// ─────────────────────────────────────────────────────────────
// Supabase(데이터베이스) 접속 도구 — "서버 전용"
//
// 이 사이트는 이름+비밀번호 로그인을 직접 만들기 때문에,
// 데이터베이스 읽기/쓰기는 모두 서버에서만 합니다.
// 휴대폰(브라우저)은 데이터베이스에 직접 접속하지 않고, 우리 서버에게 부탁만 합니다.
// → 그래서 비밀 키(SUPABASE_SECRET_KEY)가 휴대폰으로 새어 나갈 일이 없습니다.
// ─────────────────────────────────────────────────────────────

// 이 줄이 있으면, 실수로 이 파일을 브라우저용 코드에서 불러올 때
// 빌드 단계에서 오류를 내서 막아 줍니다. (비밀 키 유출 방지용 안전장치)
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// .env.local 에 필요한 값이 들어 있는지 확인하는 함수.
// 값 자체는 돌려주지 않고 "있다/없다"와 "어떤 모양인지"만 알려줍니다.
export function getSupabaseEnvStatus() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  return {
    hasUrl: Boolean(url),
    hasSecretKey: Boolean(key),
    urlHint: describeUrl(url),
    keyHint: describeKey(key),
  };
}

// 주소가 "https://....supabase.co" 모양인지 확인합니다.
function describeUrl(url: string): string {
  if (!url) return "";
  if (url !== url.trim()) return "앞뒤에 빈칸이 들어 있습니다. 빈칸을 지워 주세요.";
  if (/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) return "주소 형식 정상";
  return "주소 형식이 이상합니다. https://(영문숫자).supabase.co 형태여야 합니다.";
}

// 키의 "종류"만 알려줍니다. (키 값은 절대 화면에 보여주지 않습니다)
function describeKey(key: string): string {
  if (!key) return "";
  if (key !== key.trim()) return "앞뒤에 빈칸이 들어 있습니다. 빈칸을 지워 주세요.";
  if (key.includes("•") || key.includes("*"))
    return "가려진(••••) 상태로 복사된 것 같습니다. 눈 모양 버튼으로 키를 보이게 한 뒤 복사해 주세요.";
  if (key.startsWith("sb_publishable_"))
    return "공개 키(sb_publishable_)가 들어 있습니다. 비밀 키(sb_secret_)로 바꿔 주세요.";
  if (key.startsWith("sb_secret_")) return `비밀 키(sb_secret_) 형식, 길이 ${key.length}자`;
  if (key.startsWith("eyJ")) return `예전 방식(JWT) 키 형식, 길이 ${key.length}자 — service_role 키여야 합니다.`;
  return "알 수 없는 형식입니다. sb_secret_ 로 시작하는 키를 넣어 주세요.";
}

// 참고: 주소 이름을 NEXT_PUBLIC_ 으로 시작하지 않는 이유 —
// NEXT_PUBLIC_ 이 붙으면 브라우저에도 값이 전달되고, Vercel에서 Secret으로 저장할 수 없습니다.
// 이 주소는 서버에서만 쓰므로 일반 이름(SUPABASE_URL)을 씁니다.

// 데이터베이스 접속 도구를 한 번만 만들어 두고 계속 재사용합니다.
let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Supabase 설정이 없습니다. .env.local 파일에 SUPABASE_URL 과 SUPABASE_SECRET_KEY 를 넣어 주세요.",
    );
  }

  cachedClient = createClient(url, secretKey, {
    // Supabase 자체 로그인 기능은 쓰지 않으므로, 로그인 상태 저장 기능을 끕니다.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}
