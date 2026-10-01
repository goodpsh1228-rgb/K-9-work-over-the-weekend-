// ─────────────────────────────────────────────────────────────
// 출근 기록·통계 (/stats) — 모든 인원
//   ① 내 출근 기록: 횟수 요약 + 날짜별 목록 (확정된 앞으로의 근무 포함)
//   ② 전체 인원 출근 횟수 (많은 순) — "나만 많이 뽑힌다"는 걱정을 숫자로 확인
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { Card, Page } from "@/components/ui";
import { formatShort, todayKST } from "@/lib/kst";
import { computeStats, type StatRow } from "@/lib/duty-stats";

const SOURCE = { wanted: "희망", drafted: "차출", admin: "관리자" } as const;

export default async function StatsPage() {
  const me = await requireMember();
  const today = todayKST();
  const db = getSupabaseAdmin();
  const [rows, { data: posts }, { data: members }] = await Promise.all([
    allAssignments(),
    db.from("posts").select("id, name, pool"),
    db.from("members").select("id, name, rank").eq("is_active", true).order("name"),
  ]);
  const postOf = new Map((posts ?? []).map((p) => [p.id as number, p]));
  const statRows: StatRow[] = rows.map((r) => ({
    member_id: r.member_id,
    duty_date: r.duty_date,
    source: r.source,
    pool: postOf.get(r.post_id)?.pool ?? "general",
  }));
  const stats = computeStats(statRows, today);
  const empty = { days: 0, wanted: 0, drafted: 0, admin: 0, drive: 0, escort: 0, recent: 0 };
  const mine = stats.get(me.id) ?? empty;

  // 내 기록: 날짜별로 자리 묶기 (예: 10/3(토) 관리 2동·희망 + 주말 운전)
  const myByDate = new Map<string, string[]>();
  for (const r of rows) {
    if (r.member_id !== me.id) continue;
    const p = postOf.get(r.post_id);
    const label = p?.pool === "general" || p?.pool === "clinic" ? `${p.name}·${SOURCE[r.source as keyof typeof SOURCE]}` : (p?.name ?? "?");
    myByDate.set(r.duty_date, [...(myByDate.get(r.duty_date) ?? []), label]);
  }

  // 전체 인원 (출근일 많은 순 → 이름순)
  const table = (members ?? [])
    .map((m) => ({ ...m, s: stats.get(m.id) ?? empty }))
    .sort((a, b) => b.s.days - a.s.days || a.name.localeCompare(b.name, "ko"));
  const avg = table.length ? table.reduce((t, m) => t + m.s.days, 0) / table.length : 0;

  return (
    <Page title="출근 기록·통계">
      {/* ① 내 기록 요약 */}
      <div className="rounded-2xl bg-[linear-gradient(141deg,#4b2afa_15%,#2c1994_94%)] p-4 text-white shadow-lg shadow-blue-600/25">
        <p className="font-bold">{me.name} 님의 출근</p>
        <div className="mt-3 grid grid-cols-3 text-center">
          <div>
            <p className="text-3xl font-bold tabular-nums">{mine.days}</p>
            <p className="text-sm opacity-90">전체 출근일</p>
          </div>
          <div>
            <p className="text-3xl font-bold tabular-nums">{mine.recent}</p>
            <p className="text-sm opacity-90">최근 4주</p>
          </div>
          <div>
            <p className="text-3xl font-bold tabular-nums">{avg.toFixed(1)}</p>
            <p className="text-sm opacity-90">중대 평균</p>
          </div>
        </div>
        <p className="mt-3 text-center text-sm opacity-90">
          희망 {mine.wanted} · 차출 {mine.drafted} · 관리자 {mine.admin}
          {mine.drive ? ` · 운전 ${mine.drive}` : ""}
          {mine.escort ? ` · 선탑 ${mine.escort}` : ""}
        </p>
      </div>

      <h2 className="mt-6 mb-2 text-lg font-semibold">내 출근 기록</h2>
      {myByDate.size === 0 ? (
        <p className="text-sm text-zinc-500">아직 출근 기록이 없습니다.</p>
      ) : (
        <Card className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {[...myByDate.entries()].map(([d, labels]) => (
            <Link key={d} href={`/day/${d}`} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className={`font-semibold ${d > today ? "text-blue-600" : ""}`}>
                {formatShort(d)}
                {d > today && <span className="ml-1 text-xs font-normal">예정</span>}
              </span>
              <span className="text-right text-zinc-600 dark:text-zinc-400">{labels.join(" + ")}</span>
            </Link>
          ))}
        </Card>
      )}

      {/* ② 전체 인원 */}
      <h2 className="mt-8 mb-1 text-lg font-semibold">전체 인원 출근 횟수</h2>
      <p className="mb-2 text-xs text-zinc-500">확정된 앞으로의 근무 포함 · 출근일은 하루에 두 자리여도 1일 · 많은 순</p>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2 text-left font-medium">이름</th>
              <th className="px-1 py-2 text-right font-medium">출근일</th>
              <th className="px-1 py-2 text-right font-medium">희망</th>
              <th className="px-1 py-2 text-right font-medium">차출</th>
              <th className="px-3 py-2 text-right font-medium">최근4주</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {table.map((m) => (
              <tr key={m.id} className={m.id === me.id ? "bg-blue-50 font-semibold dark:bg-blue-950" : ""}>
                <td className="px-3 py-2">
                  {m.rank ? <span className="text-xs text-zinc-500">{m.rank} </span> : null}
                  {m.name}
                </td>
                <td className="px-1 py-2 text-right tabular-nums">{m.s.days}</td>
                <td className="px-1 py-2 text-right tabular-nums">{m.s.wanted}</td>
                <td className="px-1 py-2 text-right tabular-nums">{m.s.drafted}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.s.recent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}

// 확정 명단 전체 읽기 — Supabase는 한 번에 최대 1,000줄만 주므로 1,000줄씩 나눠 끝까지 읽음
type AssignmentRow = { member_id: number; duty_date: string; source: "wanted" | "drafted" | "admin"; post_id: number };
async function allAssignments(): Promise<AssignmentRow[]> {
  const db = getSupabaseAdmin();
  const out: AssignmentRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("assignments")
      .select("member_id, duty_date, source, post_id")
      .order("duty_date", { ascending: false })
      .order("id")
      .range(from, from + 999);
    out.push(...((data ?? []) as AssignmentRow[]));
    if (!data || data.length < 1000) return out;
  }
}
