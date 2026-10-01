// ─────────────────────────────────────────────────────────────
// 준비 상태 점검 화면 (/status)
//
// 확인하는 것
//   ① Supabase 주소와 비밀 키가 설정되어 있는가 (Vercel 환경변수 / .env.local)
//   ② 그 값으로 실제 Supabase에 접속이 되는가
//   ③ 2단계에서 만든 데이터 창고의 표 9개가 모두 있는가
//   ④ 5단계 추가 SQL(0002: 희망 동 저장 칸)이 실행되었는가
//   ⑤ 6단계 추가 SQL(0003: 추첨 저장 함수)이 실행되었는가
//   ⑥ 추가 SQL(0004: 계급·인원 삭제)이 실행되었는가
// 값 자체는 보여주지 않으므로 로그인 없이 열 수 있습니다.
// ─────────────────────────────────────────────────────────────
import { connection } from "next/server";
import { getSupabaseAdmin, getSupabaseEnvStatus } from "@/lib/supabase-server";

// 2단계(supabase/migrations/0001_init.sql)에서 만드는 표 이름 목록
const EXPECTED_TABLES = [
  "members", // 인원
  "posts", // 근무 자리(진료실·동) 설정
  "duty_day_overrides", // 근무일 수동 추가/삭제
  "duty_day_post_counts", // 날짜별 자리 인원 변경
  "responses", // 희망/미희망 응답
  "absences", // 휴가·부상
  "draws", // 추첨 실행 기록
  "assignments", // 확정 명단
  "audit_logs", // 변경 이력
] as const;

type Check = { ok: boolean; message: string };

// Supabase에 실제로 접속해 보는 함수.
// 비밀 키가 맞아야만 성공하는 "관리용 사용자 목록 1건 조회"로 시험합니다.
async function checkSupabaseConnection(): Promise<Check> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "접속 성공" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// 표가 모두 만들어졌는지 확인하는 함수.
// 각 표에 "몇 줄 있니?"만 물어봅니다(내용은 가져오지 않음). 표가 없으면 오류가 납니다.
async function checkTables(): Promise<Check> {
  const supabase = getSupabaseAdmin();
  const results = await Promise.all(
    EXPECTED_TABLES.map(async (table) => {
      const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
      return { table, ok: !error };
    }),
  );
  const missing = results.filter((r) => !r.ok).map((r) => r.table);
  if (missing.length === 0) {
    // 기본 근무 자리(진료실 + 6개 동)가 들어갔는지도 함께 확인
    const { count } = await supabase.from("posts").select("*", { count: "exact", head: true });
    return { ok: true, message: `표 ${EXPECTED_TABLES.length}개 모두 있음 · 근무 자리 ${count ?? 0}개 등록됨` };
  }
  return { ok: false, message: `아직 없는 표: ${missing.join(", ")}` };
}

// 5단계 추가 SQL(0002)을 실행했는지: responses 표에 post_id 칸이 있는지 확인
async function checkMigration0002(): Promise<Check> {
  const { error } = await getSupabaseAdmin().from("responses").select("post_id", { head: true, count: "exact" });
  if (error) return { ok: false, message: "supabase/migrations/0002_response_post.sql 을 SQL Editor에서 실행해 주세요." };
  return { ok: true, message: "희망 동(post_id) 칸 있음" };
}

// 6단계 추가 SQL(0003)을 실행했는지: record_draw 함수가 있는지 확인.
// 날짜를 비워서(null) 부르면, 함수가 있을 때는 "날짜 없음" 오류로 아무것도 저장되지 않고 끝나며,
// 함수가 없을 때는 "함수를 찾을 수 없음"(PGRST202) 오류가 납니다.
async function checkMigration0003(): Promise<Check> {
  const { error } = await getSupabaseAdmin().rpc("record_draw", {
    p_duty_date: null,
    p_triggered_by: "manual",
    p_executed_by: null,
    p_clinic_shortage: 0,
    p_general_shortage: 0,
    p_assignments: [],
  });
  if (error?.code === "PGRST202") {
    return { ok: false, message: "supabase/migrations/0003_record_draw.sql 을 SQL Editor에서 실행해 주세요." };
  }
  return { ok: true, message: "추첨 저장 함수(record_draw) 있음" };
}

// 추가 SQL(0004)을 실행했는지: members 표에 rank(계급) 칸이 있는지 확인
async function checkMigration0004(): Promise<Check> {
  const { error } = await getSupabaseAdmin().from("members").select("rank", { head: true, count: "exact" });
  if (error) return { ok: false, message: "supabase/migrations/0004_rank_and_delete.sql 을 SQL Editor에서 실행해 주세요." };
  return { ok: true, message: "계급(rank) 칸 있음" };
}

// 추가 SQL(0008: 운전병 + 주말 운전 따로 + 선탑 + 제외 종류)을 실행했는지: is_driver 칸, 주말 운전·선탑 자리, drive_wants 표 확인
async function checkMigration0006(): Promise<Check> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("members").select("is_driver", { head: true, count: "exact" });
  const { count } = await db.from("posts").select("id", { head: true, count: "exact" }).eq("pool", "driver");
  const { error: e2 } = await db.from("drive_wants").select("member_id", { head: true, count: "exact" });
  const { count: escort } = await db.from("posts").select("id", { head: true, count: "exact" }).eq("pool", "escort");
  if (error || !count || e2 || !escort) return { ok: false, message: "supabase/migrations/0008_escort.sql 을 SQL Editor에서 실행해 주세요." };
  return { ok: true, message: "운전병·주말 운전·선탑 준비됨" };
}

// 추가 SQL(0009: 휴가 계산기)을 실행했는지: leaves 표와 입대일 칸이 있는지 확인
async function checkMigration0009(): Promise<Check> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("leaves").select("id", { head: true, count: "exact" });
  const { error: e2 } = await db.from("members").select("enlist_date", { head: true, count: "exact" });
  if (error || e2) return { ok: false, message: "supabase/migrations/0009_leave_calculator.sql 을 SQL Editor에서 실행해 주세요." };
  return { ok: true, message: "휴가 계산기 준비됨" };
}

// 추가 SQL(0010: 추첨 제외 인원)을 실행했는지
async function checkMigration0010(): Promise<Check> {
  const { error } = await getSupabaseAdmin().from("members").select("draw_excluded", { head: true, count: "exact" });
  if (error) return { ok: false, message: "supabase/migrations/0010_draw_excluded.sql 을 SQL Editor에서 실행해 주세요." };
  return { ok: true, message: "추첨 제외 칸 있음" };
}

export default async function Home() {
  // 이 화면을 열 때마다 서버에서 새로 확인하도록 합니다(미리 만들어 두지 않음).
  await connection();

  const env = getSupabaseEnvStatus();
  const envReady = env.hasUrl && env.hasSecretKey;
  const conn = envReady
    ? await checkSupabaseConnection()
    : { ok: false, message: "환경변수가 아직 없어 접속을 시도하지 않았습니다." };
  const tables = conn.ok
    ? await checkTables()
    : { ok: false, message: "접속이 되어야 확인할 수 있습니다." };
  const m0002 = tables.ok ? await checkMigration0002() : { ok: false, message: "표가 먼저 있어야 합니다." };
  const m0003 = tables.ok ? await checkMigration0003() : { ok: false, message: "표가 먼저 있어야 합니다." };
  const m0004 = tables.ok ? await checkMigration0004() : { ok: false, message: "표가 먼저 있어야 합니다." };
  const m0006 = tables.ok ? await checkMigration0006() : { ok: false, message: "표가 먼저 있어야 합니다." };
  const m0009 = tables.ok ? await checkMigration0009() : { ok: false, message: "표가 먼저 있어야 합니다." };
  const m0010 = tables.ok ? await checkMigration0010() : { ok: false, message: "표가 먼저 있어야 합니다." };

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold">군견훈육중대 주말출근 관리체계</h1>
      <p className="mt-1 text-sm text-zinc-500">준비 상태 점검 화면</p>

      <ul className="mt-6 space-y-3">
        <StatusRow label="Supabase 주소 (SUPABASE_URL)" ok={env.hasUrl} detail={env.urlHint} />
        <StatusRow label="Supabase 비밀 키 (SUPABASE_SECRET_KEY)" ok={env.hasSecretKey} detail={env.keyHint} />
        <StatusRow label="Supabase 실제 접속" ok={conn.ok} detail={conn.message} />
        <StatusRow label="데이터 창고 (2단계 표)" ok={tables.ok} detail={tables.message} />
        <StatusRow label="5단계 추가 SQL (0002)" ok={m0002.ok} detail={m0002.message} />
        <StatusRow label="6단계 추가 SQL (0003)" ok={m0003.ok} detail={m0003.message} />
        <StatusRow label="계급·삭제 추가 SQL (0004)" ok={m0004.ok} detail={m0004.message} />
        <StatusRow label="운전병·주말 운전·선탑 추가 SQL (0008)" ok={m0006.ok} detail={m0006.message} />
        <StatusRow label="휴가 계산기 추가 SQL (0009)" ok={m0009.ok} detail={m0009.message} />
        <StatusRow label="추첨 제외 인원 추가 SQL (0010)" ok={m0010.ok} detail={m0010.message} />
      </ul>

      {!conn.ok ? (
        <p className="mt-6 rounded-lg bg-orange-50 p-4 text-orange-800">
          ⚠️ Supabase 접속 설정이 아직 덜 되었습니다. README의 &quot;1단계&quot; 안내를 확인해 주세요.
        </p>
      ) : !tables.ok || !m0002.ok || !m0003.ok || !m0004.ok || !m0006.ok || !m0009.ok || !m0010.ok ? (
        <p className="mt-6 rounded-lg bg-orange-50 p-4 text-orange-800">
          ⚠️ 접속은 성공! 아직 실행하지 않은 SQL 파일(supabase/migrations 폴더)을 Supabase SQL Editor에서
          실행해 주세요. (README 참고)
        </p>
      ) : (
        <p className="mt-6 rounded-lg bg-green-50 p-4 text-green-800">
          ✅ 서버·데이터 창고 모두 정상입니다.
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
