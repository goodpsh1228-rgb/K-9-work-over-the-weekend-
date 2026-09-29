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
// 값 자체는 돌려주지 않고 "있다/없다"만 알려줍니다.
export function getSupabaseEnvStatus() {
  return {
    hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSecretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
  };
}

// 데이터베이스 접속 도구를 한 번만 만들어 두고 계속 재사용합니다.
let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Supabase 설정이 없습니다. .env.local 파일에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SECRET_KEY 를 넣어 주세요.",
    );
  }

  cachedClient = createClient(url, secretKey, {
    // Supabase 자체 로그인 기능은 쓰지 않으므로, 로그인 상태 저장 기능을 끕니다.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}
