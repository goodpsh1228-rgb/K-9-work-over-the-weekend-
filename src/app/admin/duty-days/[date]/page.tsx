// ─────────────────────────────────────────────────────────────
// 날짜별 자리 인원 설정 화면 (/admin/duty-days/2026-10-12 같은 주소) — 관리자 전용
// 그날만 진료실·각 동의 필요 인원을 기본값과 다르게 정할 수 있습니다.
// 칸을 기본값으로 되돌리고 저장하면 그 자리의 날짜별 설정은 지워집니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { formatLong, isValidDate } from "@/lib/kst";
import { autoLabel } from "@/lib/duty-days";
import { isDrawn } from "@/lib/duty-days-server";
import { Notice, Page } from "@/components/ui";
import { savePostCountsAction } from "../actions";

export default async function DutyDayDetailPage({ params, searchParams }: PageProps<"/admin/duty-days/[date]">) {
  await requireAdmin();
  const { date } = await params;
  if (!isValidDate(date)) notFound();
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const db = getSupabaseAdmin();
  const [{ data: posts }, { data: counts }, drawn] = await Promise.all([
    db.from("posts").select("id, name, pool, default_count").eq("is_active", true).order("sort_order"),
    db.from("duty_day_post_counts").select("post_id, required_count").eq("duty_date", date),
    isDrawn(date),
  ]);
  const custom = new Map((counts ?? []).map((c) => [c.post_id as number, c.required_count as number]));

  // 합계 (진료실 / 일반 동)
  const value = (p: { id: number; default_count: number }) => custom.get(p.id) ?? p.default_count;
  const clinicTotal = (posts ?? []).filter((p) => p.pool === "clinic").reduce((s, p) => s + value(p), 0);
  const generalTotal = (posts ?? []).filter((p) => p.pool === "general").reduce((s, p) => s + value(p), 0);

  return (
    <Page title="날짜별 인원 설정">
      <p className="text-lg font-semibold">{formatLong(date)}</p>
      <p className="mb-4 text-sm text-zinc-500">{autoLabel(date) ?? "추가 근무일"}</p>

      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {drawn && <Notice kind="warn">이미 추첨이 끝난 날이라 인원을 바꿀 수 없습니다.</Notice>}
      </div>

      <form action={savePostCountsAction} className="mt-4 space-y-2">
        <input type="hidden" name="date" value={date} />
        {(posts ?? []).map((p) => (
          <label key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span>
              {p.name}
              <span className="ml-2 text-xs text-zinc-500">기본 {p.default_count}명</span>
              {custom.has(p.id) && <span className="ml-1 text-xs text-purple-700">· 변경됨</span>}
            </span>
            <input
              type="number"
              name={`count_${p.id}`}
              defaultValue={value(p)}
              min={0}
              max={50}
              required
              disabled={drawn}
              inputMode="numeric"
              className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-right text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
        ))}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          합계: 진료실 {clinicTotal}명 · 일반 {generalTotal}명
        </p>
        {!drawn && (
          <button type="submit" className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white">
            저장
          </button>
        )}
      </form>

      <Link href="/admin/duty-days" className="mt-6 block text-center text-sm text-zinc-500 underline">
        근무일 목록으로
      </Link>
    </Page>
  );
}
