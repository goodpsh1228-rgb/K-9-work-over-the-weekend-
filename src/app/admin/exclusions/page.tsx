// ─────────────────────────────────────────────────────────────
// 추첨 제외 인원 (/admin/exclusions) — 관리자 전용
//   체크한 사람은 다시 풀 때까지 모든 근무일의 추첨·투표·미응답 목록에서 빠집니다.
//   (날짜를 정해 빼려면 "휴가·부상 (전체)"에서 제외 기간을 입력)
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { Card, Notice, Page } from "@/components/ui";
import { saveExclusionsAction } from "./actions";

export default async function ExclusionsPage({ searchParams }: PageProps<"/admin/exclusions">) {
  await requireAdmin();
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const { data: members, error: loadError } = await getSupabaseAdmin()
    .from("members")
    .select("id, name, rank, draw_excluded, draw_excluded_reason")
    .eq("is_active", true)
    .order("name");
  const list = members ?? [];
  const excluded = list.filter((m) => m.draw_excluded);

  return (
    <Page title="추첨 제외 인원">
      <p className="-mt-4 mb-4 text-sm text-zinc-500">
        체크한 사람은 다시 체크를 풀 때까지 모든 근무일의 추첨에서 빠집니다. 특정 날짜만 빼려면{" "}
        <Link href="/absences" className="underline">
          휴가·부상 (전체)
        </Link>
        에서 입력하세요.
      </p>
      <div className="space-y-3">
        {loadError && <Notice kind="error">추첨 제외 기능용 SQL(supabase/migrations/0010_draw_excluded.sql)을 먼저 실행해 주세요.</Notice>}
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      {/* 지금 제외 중인 사람 */}
      <Card className="mt-3 p-4">
        <p className="font-semibold">지금 추첨 제외 ({excluded.length}명)</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {excluded.length
            ? excluded.map((m) => `${m.name}${m.draw_excluded_reason ? `(${m.draw_excluded_reason})` : ""}`).join(", ")
            : "없음"}
        </p>
      </Card>

      {!loadError && (
        <form action={saveExclusionsAction} className="mt-4 space-y-3">
          <ul className="grid grid-cols-2 gap-x-2 gap-y-1.5">
            {list.map((m) => (
              <li key={m.id}>
                <label className="flex items-center gap-2 rounded-lg bg-input px-3 py-2.5 text-sm has-checked:bg-red-50 has-checked:text-red-800 dark:has-checked:bg-red-950 dark:has-checked:text-red-200">
                  <input type="checkbox" name="ids" value={m.id} defaultChecked={m.draw_excluded} className="h-4 w-4" />
                  {m.rank ? `${m.rank} ` : ""}
                  {m.name}
                </label>
              </li>
            ))}
          </ul>
          <input
            name="reason"
            maxLength={50}
            placeholder="새로 제외하는 사람의 사유 (선택, 예: 파견)"
            className="h-12 w-full rounded-lg bg-input px-3 text-base text-foreground outline-none ring-blue-600 focus:ring-2"
          />
          <button type="submit" className="h-14 w-full rounded-lg bg-blue-600 text-lg font-bold text-white">
            저장
          </button>
          <p className="text-xs text-zinc-500">
            새로 제외되는 사람의 오늘 이후 출근 희망은 자동 취소됩니다. 이미 추첨이 끝난 날의 명단은 바뀌지 않습니다(필요하면 명단 수정).
          </p>
        </form>
      )}

      <Link href="/admin" className="mt-6 block text-center text-sm text-zinc-500 underline">
        관리자 메뉴로
      </Link>
    </Page>
  );
}
