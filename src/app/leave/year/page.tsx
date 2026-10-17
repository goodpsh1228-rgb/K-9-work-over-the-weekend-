// ─────────────────────────────────────────────────────────────
// 연간 휴가 달력 (/leave/year) — 1년 12달을 한 장에 펼쳐 보고, 이미지로 저장합니다.
//   내 휴가(위로·정기·포상·공가·연가)·외출·면회와 휴가 계획을 날짜마다 색으로 표시.
//   휴가 계산기 화면 위쪽의 작은 "연간 달력" 링크로 들어옵니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { todayKST } from "@/lib/kst";
import { Page } from "@/components/ui";
import { YearCalendar, type YearLeave } from "./year-calendar";

export default async function LeaveYearPage() {
  const me = await requireMember();
  const db = getSupabaseAdmin();
  // 계획 칸(SQL 0013)이 아직 없으면 계획 없이 읽음
  let rows = await db.from("leaves").select("kind, start_date, end_date, planned").eq("member_id", me.id).order("start_date");
  if (rows.error) rows = (await db.from("leaves").select("kind, start_date, end_date").eq("member_id", me.id).order("start_date")) as typeof rows;
  const leaves: YearLeave[] = ((rows.data ?? []) as { kind: string; start_date: string; end_date: string; planned?: boolean | null }[]).map((r) => ({
    kind: r.kind,
    start: r.start_date,
    end: r.end_date,
    planned: r.planned === true,
  }));
  return (
    <Page title="연간 휴가 달력">
      <YearCalendar leaves={leaves} today={todayKST()} who={`${me.rank ? `${me.rank} ` : ""}${me.name}`} />
      <Link href="/leave" className="mt-6 block text-center text-sm text-muted underline">
        휴가 계산기로 돌아가기
      </Link>
    </Page>
  );
}
