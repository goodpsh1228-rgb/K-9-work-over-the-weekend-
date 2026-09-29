// ─────────────────────────────────────────────────────────────
// 첫 화면 (임시) — 1단계 "준비"가 잘 되었는지 확인하는 화면
//
// 지금은 두 가지만 확인합니다.
//   ① .env.local 에 Supabase 주소와 비밀 키가 들어 있는가
//   ② 그 값으로 실제 Supabase에 접속이 되는가
// 나중 단계에서 이 화면은 로그인 화면으로 바뀝니다.
// ─────────────────────────────────────────────────────────────
import { connection } from "next/server";
import { getSupabaseAdmin, getSupabaseEnvStatus } from "@/lib/supabase-server";

// Supabase에 실제로 접속해 보는 함수.
// 아직 표(테이블)를 만들지 않았으므로, 키가 맞아야만 성공하는
// "관리용 사용자 목록 1건 조회"로 접속을 시험합니다.
async function checkSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "접속 성공" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export default async function Home() {
  // 이 화면을 열 때마다 서버에서 새로 확인하도록 합니다(미리 만들어 두지 않음).
  await connection();

  const env = getSupabaseEnvStatus();
  const envReady = env.hasUrl && env.hasSecretKey;
  const conn = envReady
    ? await checkSupabaseConnection()
    : { ok: false, message: "환경변수가 아직 없어 접속을 시도하지 않았습니다." };

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold">주말·공휴일 출근 투표</h1>
      <p className="mt-1 text-sm text-zinc-500">1단계: 준비 상태 점검 화면</p>

      <ul className="mt-6 space-y-3">
        <StatusRow label="Supabase 주소 (SUPABASE_URL)" ok={env.hasUrl} detail={env.urlHint} />
        <StatusRow label="Supabase 비밀 키 (SUPABASE_SECRET_KEY)" ok={env.hasSecretKey} detail={env.keyHint} />
        <StatusRow label="Supabase 실제 접속" ok={conn.ok} detail={conn.message} />
      </ul>

      {conn.ok ? (
        <p className="mt-6 rounded-lg bg-green-50 p-4 text-green-800">
          ✅ 준비 완료! 2단계(데이터 창고 설계)로 넘어갈 수 있습니다.
        </p>
      ) : (
        <p className="mt-6 rounded-lg bg-orange-50 p-4 text-orange-800">
          ⚠️ 아직 준비가 덜 되었습니다. README의 &quot;1단계&quot; 안내를 따라 .env.local 파일을
          채운 뒤, 개발 서버를 껐다가 다시 켜 주세요.
        </p>
      )}
    </main>
  );
}

// 점검 항목 한 줄을 그리는 작은 부품(컴포넌트)
function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <li className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{label}</span>
        <span
          className={`shrink-0 whitespace-nowrap font-semibold ${ok ? "text-green-600" : "text-red-600"}`}
        >
          {ok ? "정상" : "없음/실패"}
        </span>
      </div>
      {detail && <p className="mt-1 text-xs text-zinc-500">{detail}</p>}
    </li>
  );
}
