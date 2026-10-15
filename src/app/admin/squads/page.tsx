// ─────────────────────────────────────────────────────────────
// 반·기수 관리 (/admin/squads) — 관리자 전용
//   ① 반별 휴가 TO: 반마다 휴가 희망(계획)·확정 휴가자 수와 명단(예: 병장 홍길동 8.12~8.16 휴가 희망), 가장 많이 겹치는 날
//   ② 반 지정 + 기수 입력: 인원마다 반(미용·진료·훈련·관리·분만)과 기수를 저장
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { Card, Notice, Page } from "@/components/ui";
import { LEAVE_KINDS } from "@/lib/leave";
import { todayKST } from "@/lib/kst";
import { dotsRange, effectiveSquad, mergeConsecutive, peakOverlap, SQUADS } from "@/lib/squads";
import { byRankName } from "@/lib/lineup";
import { updateSquadCohortAction } from "./actions";

type M = { id: number; name: string; rank: string | null; squad: string | null; cohort: number | null; is_clinic: boolean };
type L = { member_id: number; kind: string; start_date: string; end_date: string; planned?: boolean };

export default async function SquadsPage({ searchParams }: PageProps<"/admin/squads">) {
  await requireAdmin();
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const today = todayKST();
  const db = getSupabaseAdmin();

  const mem = await db.from("members").select("id, name, rank, squad, cohort, is_clinic").eq("is_active", true).order("name");
  if (mem.error) {
    return (
      <Page title="반·기수 관리">
        <Notice kind="warn">반·기수 기능을 쓰려면 먼저 추가 SQL(supabase/migrations/0015_cohort_squad.sql)을 Supabase SQL Editor에서 실행해 주세요.</Notice>
      </Page>
    );
  }
  const members = (mem.data ?? []) as M[];
  const fullKinds = LEAVE_KINDS.filter((k) => k.isLeave).map((k) => k.value);
  // 계획 칸(SQL 0013)이 없으면 계획 없이 읽음
  let lv = await db.from("leaves").select("member_id, kind, start_date, end_date, planned").in("kind", fullKinds).gte("end_date", today).order("start_date");
  if (lv.error) lv = (await db.from("leaves").select("member_id, kind, start_date, end_date").in("kind", fullKinds).gte("end_date", today).order("start_date")) as typeof lv;
  const leaves = (lv.data ?? []) as L[];
  const byId = new Map(members.map((m) => [m.id, m]));
  const squadOf = (m: M) => effectiveSquad(m.squad, m.is_clinic);

  const groups = [...SQUADS, null].map((sq) => {
    const ms = members.filter((m) => squadOf(m) === sq);
    const ids = new Set(ms.map((m) => m.id));
    // 한 사람의 이어지는 휴가는 하나로 합쳐서 보여 줌 (예: 10.26~10.28 + 10.29~10.31 → 10.26~10.31)
    const merged = mergeConsecutive(
      leaves.filter((l) => ids.has(l.member_id)).map((l) => ({ key: l.member_id, start: l.start_date, end: l.end_date, planned: l.planned === true })),
    );
    const rows = merged
      .map((l) => ({ member_id: l.key as number, start_date: l.start, end_date: l.end, planned: l.planned, m: byId.get(l.key as number)! }))
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || byRankName(a.m, b.m));
    return { sq, ms, rows, peak: peakOverlap(rows.map((r) => ({ start: r.start_date, end: r.end_date }))) };
  });

  return (
    <Page title="반·기수 관리">
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      {/* ① 반별 휴가 TO */}
      <h2 className="mt-4 mb-1 text-xl font-black tracking-[-0.02em]">반별 휴가 TO</h2>
      <p className="mb-3 text-xs text-muted">오늘 이후 휴가 희망(계획)과 확정 휴가입니다. 같은 날 몇 명이 겹치는지 한눈에 보세요.</p>
      <div className="space-y-3">
        {groups
          .filter((g) => g.sq !== null || g.rows.length > 0)
          .map((g) => (
            <Card key={g.sq ?? "none"} className="overflow-hidden">
              <div className="flex items-center justify-between bg-tile px-4 py-2.5 text-white">
                <p className="font-black">{g.sq ?? "반 미지정"} <span className="text-sm font-normal text-white/70">({g.ms.length}명)</span></p>
                <p className="text-sm">
                  휴가 <b className={g.rows.length ? "text-orange-400" : ""}>{g.rows.length}건</b>
                  {g.peak && g.peak.count > 1 && <span className="ml-2 text-xs text-white/70">최대 겹침 {dotsRange(g.peak.date, g.peak.date)} {g.peak.count}명</span>}
                </p>
              </div>
              {g.rows.length === 0 ? (
                <p className="p-4 text-sm text-muted">예정된 휴가가 없습니다.</p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {g.rows.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 px-4 py-2.5 text-base">
                      <span>
                        <span className="text-muted">{r.m.rank ?? ""}</span> <b>{r.m.name}</b>{" "}
                        <span className="tabular-nums">{dotsRange(r.start_date, r.end_date)}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${r.planned ? "border border-dashed border-blue-600 text-link" : "bg-blue-600 text-white"}`}>
                        {r.planned ? "휴가 희망" : "휴가"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
      </div>

      {/* ② 반 지정 + 기수 */}
      <h2 className="mt-10 mb-1 text-xl font-black tracking-[-0.02em]">반 지정 · 기수 입력</h2>
      <p className="mb-3 text-xs text-muted">
        기수는 숫자가 작을수록 높습니다(866기 &gt; 877기). 본인도 홈에서 직접 입력할 수 있습니다. 반을 &quot;진료반&quot;으로 지정하면 진료실 추첨 대상(진료반)도 함께 켜집니다.
      </p>
      <Card className="divide-y divide-hairline overflow-hidden">
        {members.map((m) => (
          <form key={m.id} action={updateSquadCohortAction} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <input type="hidden" name="member_id" value={m.id} />
            <span className="min-w-24 flex-1 text-sm">
              <b>{m.name}</b> <span className="text-xs text-muted">{m.rank ?? ""}</span>
            </span>
            <input
              name="cohort"
              type="number"
              inputMode="numeric"
              min={1}
              max={9999}
              defaultValue={m.cohort ?? ""}
              placeholder="기수"
              aria-label={`${m.name} 기수`}
              className="h-9 w-20 rounded-full border border-hairline bg-input px-3 text-sm"
            />
            <select name="squad" defaultValue={squadOf(m) ?? ""} aria-label={`${m.name} 반`} className="h-9 rounded-full border border-hairline bg-input px-2 text-sm">
              <option value="">반 없음</option>
              {SQUADS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white">
              저장
            </button>
          </form>
        ))}
      </Card>
      <Link href="/admin" className="mt-6 block text-center text-sm text-muted underline">
        관리자 메뉴로
      </Link>
    </Page>
  );
}
