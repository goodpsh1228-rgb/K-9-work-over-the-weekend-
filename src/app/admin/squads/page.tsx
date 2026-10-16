// ─────────────────────────────────────────────────────────────
// 반 지정 · 기수 입력 (/admin/squads) — 관리자 전용 ("인원 관리"에서 들어옴)
//   인원마다 반(미용·진료·훈련·관리·분만)과 기수를 저장합니다.
//   반별 휴가 TO 현황은 관리자 메뉴의 "반별 휴가 TO"(/admin/leave-to)에서 봅니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { Card, Notice, Page } from "@/components/ui";
import { effectiveSquad, SQUADS } from "@/lib/squads";
import { updateSquadCohortAction } from "./actions";

type M = { id: number; name: string; rank: string | null; squad: string | null; cohort: number | null; is_clinic: boolean };

export default async function SquadsPage({ searchParams }: PageProps<"/admin/squads">) {
  await requireAdmin();
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const db = getSupabaseAdmin();

  const mem = await db.from("members").select("id, name, rank, squad, cohort, is_clinic").eq("is_active", true).order("name");
  if (mem.error) {
    return (
      <Page title="반 지정 · 기수">
        <Notice kind="warn">반·기수 기능을 쓰려면 먼저 추가 SQL(supabase/migrations/0015_cohort_squad.sql)을 Supabase SQL Editor에서 실행해 주세요.</Notice>
      </Page>
    );
  }
  const members = (mem.data ?? []) as M[];
  const squadOf = (m: M) => effectiveSquad(m.squad, m.is_clinic);

  return (
    <Page title="반 지정 · 기수">
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      {/* 반 지정 + 기수 */}
      
      <p className="mb-3 text-xs text-muted">
        기수는 숫자가 작을수록 높습니다(866기 &gt; 877기). 본인도 홈에서 직접 입력할 수 있습니다. 반을 &quot;진료반&quot;으로 지정하면 진료실 추첨 대상(진료반)도 함께 켜집니다.
      </p>
      <Card className="mt-2 divide-y divide-hairline overflow-hidden">
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
      <div className="mt-6 flex justify-between text-sm">
        <Link href="/admin/leave-to" className="text-link underline">
          반별 휴가 TO 보기
        </Link>
        <Link href="/admin/members" className="text-muted underline">
          인원 관리로
        </Link>
      </div>
    </Page>
  );
}
