// ─────────────────────────────────────────────────────────────
// 한 달 차출 (/admin/draw) — 관리자 전용
//   투표가 모두 마감된 달의 공석을 순번으로 한꺼번에 채우는 화면입니다.
//   차출 뒤에는 각 날짜의 [명단 수정]에서 순번으로 뽑힌 사람의 동을 배정합니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { Notice, Page } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatShort, todayKST } from "@/lib/kst";
import { getMonthStatus, getUnassignedPicks, isValidMonth } from "@/lib/monthly-draw-server";
import { monthlyDrawAction } from "./actions";

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export default async function MonthlyDrawPage({ searchParams }: PageProps<"/admin/draw">) {
  await requireAdmin();
  const sp = await searchParams;
  const thisMonth = todayKST().slice(0, 7);
  const month = typeof sp.month === "string" && isValidMonth(sp.month) ? sp.month : shiftMonth(thisMonth, 1);
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const st = await getMonthStatus(month);
  // 동이 아직 정해지지 않은 순번 뽑힘이 있는 날짜 (차출이 끝난 달만 의미 있음)
  const pendingDong: { date: string; names: string[] }[] = [];
  if (st.executedAt) {
    for (const date of st.days) {
      const rows = await getUnassignedPicks(date);
      if (rows.length > 0) pendingDong.push({ date, names: rows.map((r) => r.name) });
    }
  }
  const canRun = !st.executedAt && st.stillVoting.length === 0 && st.undrawn.length > 0;
  const canRunEarly = !st.executedAt && st.stillVoting.length > 0 && st.undrawn.length > 0; // 투표 마감 전 관리자 차출

  return (
    <Page title="한 달 차출">
      <p className="-mt-4 mb-4 text-sm text-zinc-500">
        투표가 모두 마감된 달의 공석을 순번(높은 기수부터)으로 한꺼번에 채웁니다. 한 달에 한 번만 실행됩니다.
      </p>
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      {/* 달 이동 */}
      <div className="mt-3 flex items-center justify-between rounded-[18px] border border-hairline bg-card px-4 py-2">
        <Link href={`/admin/draw?month=${shiftMonth(month, -1)}`} className="px-2 py-1 text-lg text-link" aria-label="이전 달">‹</Link>
        <b className="text-lg">{month.replace("-", "년 ")}월</b>
        <Link href={`/admin/draw?month=${shiftMonth(month, 1)}`} className="px-2 py-1 text-lg text-link" aria-label="다음 달">›</Link>
      </div>

      <section className="mt-3 space-y-1 rounded-[18px] border border-hairline bg-card p-4 text-sm">
        <p>근무일 <b>{st.days.length}일</b> · 추첨 완료 {st.drawn.length}일 · 추첨 전 {st.undrawn.length}일</p>
        {st.stillVoting.length > 0 ? (
          <p className="text-orange-700">
            아직 투표 중이거나 열리기 전인 근무일이 {st.stillVoting.length}일 있습니다. ({formatShort(st.stillVoting[0])} …) 투표가 마감되면 차출할 수 있습니다.
          </p>
        ) : st.days.length > 0 ? (
          <p className="text-green-700">모든 근무일의 투표가 마감되었습니다.</p>
        ) : null}
        {st.executedAt && <p className="text-muted">이미 차출했습니다. ({st.executedAt.slice(0, 16).replace("T", " ")} UTC)</p>}
      </section>

      {canRun && (
        <section className="mt-3 rounded-[18px] border-2 border-red-600 bg-card p-4">
          <p className="text-lg font-black">{month.replace("-", "년 ")}월 차출하기</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>희망 확정 → 남은 공석을 순번(미희망·미응답자)으로 채웁니다.</li>
            <li>휴가·부상·교육 등으로 못 하는 순번은 자동으로 다음 사람에게 넘기고 빚으로 기록합니다.</li>
            <li>진료실·운전은 자리까지 정해지고, 동은 뽑힌 뒤 [명단 수정]에서 배정합니다.</li>
            <li>한 번만 실행되고 되돌릴 수 없습니다. 출근이 어려운 사람은 먼저 휴가·불참으로 입력하거나 근무일 화면에서 &quot;이 날 추첨에서 빼기&quot;를 해 주세요.</li>
          </ul>
          <form action={monthlyDrawAction} className="mt-3">
            <input type="hidden" name="month" value={month} />
            <ConfirmButton
              message={`${month} 한 달치 근무일 ${st.undrawn.length}일을 순번으로 차출합니다. 한 번만 실행되고 되돌릴 수 없습니다. 진행할까요?`}
              className="min-h-12 w-full rounded-full bg-red-600 px-[22px] text-base font-semibold text-white"
            >
              한 달 차출하기
            </ConfirmButton>
          </form>
        </section>
      )}

      {canRunEarly && (
        <section className="mt-3 rounded-[18px] border-2 border-red-600 bg-card p-4">
          <p className="text-lg font-black">지금 바로 {month.replace("-", "년 ")}월 차출하기 (투표 마감 전)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>지금까지의 희망·미희망·휴가 입력을 기준으로 한 달치를 순번으로 채웁니다.</li>
            <li>차출한 날은 투표가 바로 마감됩니다. 이후 투표·변경은 [명단 수정]으로 처리해야 합니다.</li>
            <li>한 번만 실행되고 되돌릴 수 없습니다. 아직 투표하지 않은 사람은 미희망으로 보고 순번에 들어갑니다.</li>
          </ul>
          <form action={monthlyDrawAction} className="mt-3">
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="force" value="1" />
            <ConfirmButton
              message={`투표가 아직 끝나지 않았지만 ${month} 근무일 ${st.undrawn.length}일을 지금 차출합니다. 한 번만 실행되고 되돌릴 수 없으며, 이후에는 투표할 수 없게 됩니다. 진행할까요?`}
              className="min-h-12 w-full rounded-full bg-red-600 px-[22px] text-base font-semibold text-white"
            >
              지금 차출하기
            </ConfirmButton>
          </form>
        </section>
      )}

      {pendingDong.length > 0 && (
        <section className="mt-3 rounded-[18px] border border-orange-400 bg-card p-4">
          <p className="font-semibold">동 배정이 필요한 날 ({pendingDong.length}일)</p>
          <ul className="mt-2 divide-y divide-hairline text-sm">
            {pendingDong.map((p) => (
              <li key={p.date} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <b>{formatShort(p.date)}</b> <span className="text-muted">{p.names.join(", ")}</span>
                </span>
                <Link href={`/admin/roster/${p.date}`} className="shrink-0 text-link underline">명단 수정</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {st.executedAt && pendingDong.length === 0 && (
        <p className="mt-3 text-sm text-green-700">모든 순번 차출자의 동이 배정되었습니다.</p>
      )}
    </Page>
  );
}
