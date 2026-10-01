// ─────────────────────────────────────────────────────────────
// 동 설정 (/admin/posts) — 관리자 전용
//   동 이름과 기본 인원(평소 정원)을 바꾸고, 새 동을 추가하거나 사용 중지합니다.
//   특정 날짜만 다르게 하려면 "공휴일 추가" 화면에서 날짜를 눌러 설정합니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { Card, Notice, Page } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { addPostAction, savePostsAction, togglePostAction } from "./actions";

const POOL_LABEL: Record<string, string> = { clinic: "진료반", general: "일반", driver: "운전병", escort: "관리자 지정" };
const input = "h-11 rounded-lg bg-input px-3 text-base text-foreground outline-none ring-blue-600 focus:ring-2";

export default async function PostsPage({ searchParams }: PageProps<"/admin/posts">) {
  await requireAdmin();
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const { data } = await getSupabaseAdmin().from("posts").select("id, name, pool, default_count, is_active").order("sort_order");
  const posts = data ?? [];
  const active = posts.filter((p) => p.is_active);
  const inactive = posts.filter((p) => !p.is_active);
  const generalTotal = active.filter((p) => p.pool === "general").reduce((s, p) => s + p.default_count, 0);

  return (
    <Page title="동 설정">
      <p className="-mt-4 mb-4 text-sm text-zinc-500">
        기본 인원은 아직 추첨하지 않은 근무일부터 적용됩니다. 특정 날짜만 바꾸려면{" "}
        <Link href="/admin/duty-days" className="underline">
          공휴일 추가
        </Link>
        에서 날짜를 누르세요.
      </p>
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      {/* 이름·기본 인원 */}
      <form action={savePostsAction}>
        <Card className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {active.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2">
              <input name={`name_${p.id}`} defaultValue={p.name} maxLength={30} aria-label="동 이름" className={`${input} min-w-0 flex-1`} />
              <input
                type="number"
                name={`count_${p.id}`}
                defaultValue={p.default_count}
                min={0}
                max={50}
                inputMode="numeric"
                aria-label={`${p.name} 기본 인원`}
                className={`${input} w-16 text-right`}
              />
              <span className="w-14 shrink-0 text-xs text-zinc-500">명 · {POOL_LABEL[p.pool] ?? p.pool}</span>
            </div>
          ))}
        </Card>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">일반 동 합계: {generalTotal}명</p>
        <button type="submit" className="mt-3 h-12 w-full rounded-lg bg-blue-600 font-bold text-white">
          저장
        </button>
      </form>

      {/* 새 동 추가 */}
      <Card className="mt-6 p-4">
        <p className="mb-2 font-semibold">새 동 추가 (일반 추첨)</p>
        <form action={addPostAction} className="flex gap-2">
          <input name="name" required maxLength={30} placeholder="동 이름" className={`${input} min-w-0 flex-1`} />
          <input type="number" name="count" required min={0} max={50} defaultValue={1} inputMode="numeric" aria-label="인원" className={`${input} w-16 text-right`} />
          <button type="submit" className="h-11 shrink-0 rounded-lg bg-blue-600 px-4 font-semibold text-white">
            추가
          </button>
        </form>
      </Card>

      {/* 사용 중지 / 다시 사용 */}
      <Card className="mt-6 p-4">
        <p className="mb-2 font-semibold">동 사용 중지</p>
        <p className="mb-3 text-xs text-zinc-500">없어진 동은 사용 중지하세요. 투표·추첨에서 빠지고, 과거 명단에는 남습니다.</p>
        <ul className="space-y-2 text-sm">
          {[...active.filter((p) => p.pool === "general"), ...inactive].map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className={p.is_active ? "" : "text-zinc-400 line-through"}>{p.name}</span>
              <form action={togglePostAction}>
                <input type="hidden" name="id" value={p.id} />
                <ConfirmButton
                  message={p.is_active ? `${p.name}을(를) 사용 중지할까요?` : `${p.name}을(를) 다시 사용할까요?`}
                  className={`rounded border px-2 py-1 text-xs ${p.is_active ? "border-red-300 text-red-700" : "border-blue-300 text-blue-700"}`}
                >
                  {p.is_active ? "사용 중지" : "다시 사용"}
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      <Link href="/admin" className="mt-6 block text-center text-sm text-zinc-500 underline">
        관리자 메뉴로
      </Link>
    </Page>
  );
}
