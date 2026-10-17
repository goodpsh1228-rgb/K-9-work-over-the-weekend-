"use client";
// ─────────────────────────────────────────────────────────────
// 연간 휴가 달력 (브라우저에서 동작)
//   - 12달을 3열 × 4줄로 펼친 한 장짜리 달력(SVG). 날짜마다 휴가 종류별 색 원, 휴가 계획은 점선 원, 오늘은 검은 테두리.
//   - [이미지로 저장]: 지금 보이는 달력을 그대로 PNG 사진으로 만들어 저장합니다.
//       · 아이폰·안드로이드: 공유 창이 뜨면 "이미지 저장"을 누르면 사진 앱에 저장됩니다.
//       · 컴퓨터·공유 창이 없는 곳: 파일(휴가달력-2026.png)로 내려받습니다.
//   - 화면에 보이는 그림과 저장되는 이미지는 같은 SVG 라서 항상 똑같습니다(글자는 기기 기본 한글 글꼴).
// ─────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from "react";
import { HOLIDAYS } from "@/lib/holidays";
import { addDays, weekday } from "@/lib/kst";
import { LEAVE_HEX, LEAVE_LABEL, monthGrid } from "@/lib/leave";

export type YearLeave = { kind: string; start: string; end: string; planned: boolean };

// 그림 크기 (viewBox 기준 px)
const W = 900, M = 36, GAP = 28, CELL = (W - 2 * M - 2 * GAP) / 3 / 7, ROW = 38, BLOCK = 272, GAPY = 26, TOP = 130;
const H = TOP + 4 * (BLOCK + GAPY) + 96;
const FONT = "-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const BLUE = "#0066cc";

export function YearCalendar({ leaves, today, who }: { leaves: YearLeave[]; today: string; who: string }) {
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // 날짜 → 그날의 휴가 (실제 휴가가 계획보다 우선)
  const dayMap = useMemo(() => {
    const map = new Map<string, { kind: string; planned: boolean }>();
    const y0 = `${year}-01-01`, y1 = `${year}-12-31`;
    for (const l of [...leaves].sort((a, b) => Number(b.planned) - Number(a.planned))) {
      if (l.end < y0 || l.start > y1) continue;
      for (let d = l.start < y0 ? y0 : l.start; d <= (l.end > y1 ? y1 : l.end); d = addDays(d, 1)) map.set(d, { kind: l.kind, planned: l.planned });
    }
    return map;
  }, [leaves, year]);
  const kindsUsed = [...new Set([...dayMap.values()].filter((v) => !v.planned).map((v) => v.kind))];
  const hasPlan = [...dayMap.values()].some((v) => v.planned);

  async function save() {
    const el = svgRef.current;
    if (!el || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const clone = el.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(W));
      clone.setAttribute("height", String(H));
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = 2; // 선명하게 2배 크기로 저장
      const canvas = document.createElement("canvas");
      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("이미지 만들기 실패"))), "image/png"));
      const file = new File([blob], `휴가달력-${year}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${year}년 휴가 달력` });
          setNote("공유 창에서 '이미지 저장'을 누르면 사진에 저장돼요.");
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return; // 사용자가 공유 창을 닫음
        }
      }
      const a = document.createElement("a"); // 공유 창이 없는 환경: 파일로 내려받기
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      document.body.appendChild(a); // 일부 브라우저는 화면에 붙어 있어야 파일 이름이 적용됨
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setNote(`${file.name} 로 저장했어요.`);
    } catch {
      setNote("이미지를 만들지 못했어요. 화면을 캡처해서 저장해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="이전 해" className="h-9 w-9 rounded-full border border-hairline bg-card text-lg text-link">
            ‹
          </button>
          <button type="button" onClick={() => setYear(thisYear)} className="h-9 rounded-full border border-hairline bg-card px-3 text-sm font-semibold text-link">
            올해
          </button>
          <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="다음 해" className="h-9 w-9 rounded-full border border-hairline bg-card text-lg text-link">
            ›
          </button>
        </div>
        <button type="button" onClick={save} disabled={busy} className="h-9 rounded-full bg-[#0066cc] px-4 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "만드는 중…" : "이미지로 저장"}
        </button>
      </div>
      {note && <p role="status" className="mb-3 rounded-[11px] bg-green-50 p-2.5 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{note}</p>}

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full rounded-[18px] border border-hairline" role="img" aria-label={`${year}년 휴가 달력`} data-year={year}>
        <rect width={W} height={H} fill="#ffffff" />
        <text x={M} y={78} fontFamily={FONT} fontSize={66} fontWeight={800} fill={BLUE}>{`${year}년`}</text>
        <text x={W - M} y={76} fontFamily={FONT} fontSize={26} fontWeight={600} fill="#6e6e73" textAnchor="end">{who}</text>
        <line x1={M} x2={W - M} y1={104} y2={104} stroke="#e0e0e0" strokeWidth={2} />
        {Array.from({ length: 12 }, (_, i) => {
          const month = `${year}-${String(i + 1).padStart(2, "0")}`;
          const x0 = M + (i % 3) * (CELL * 7 + GAP);
          const y0 = TOP + Math.floor(i / 3) * (BLOCK + GAPY);
          const isNow = today.startsWith(month);
          return (
            <g key={month} data-month={month}>
              <text x={x0} y={y0 + 30} fontFamily={FONT} fontSize={32} fontWeight={800} fill={isNow ? BLUE : "#1d1d1f"}>{`${i + 1}월`}</text>
              {monthGrid(month).map((week, wi) =>
                week.map((d, di) => {
                  if (d === null) return null;
                  const cx = x0 + di * CELL + CELL / 2, cy = y0 + 66 + wi * ROW;
                  const lv = dayMap.get(d);
                  const hex = lv ? LEAVE_HEX[lv.kind] ?? "#6e6e73" : null;
                  const filled = lv && !lv.planned;
                  const red = weekday(d) === 0 || Boolean(HOLIDAYS[d]);
                  const textColor = filled ? "#fff" : lv ? hex! : red ? "#e5484d" : weekday(d) === 6 ? BLUE : "#1d1d1f";
                  return (
                    <g key={d} data-day={d} data-leave={lv ? (lv.planned ? "plan" : "leave") : undefined}>
                      {lv && <circle cx={cx} cy={cy - 8} r={16} fill={filled ? hex! : "none"} stroke={filled ? "none" : hex!} strokeWidth={3} strokeDasharray={filled ? undefined : "5 4"} />}
                      {d === today && <circle cx={cx} cy={cy - 8} r={lv ? 19.5 : 16} fill="none" stroke="#111" strokeWidth={2.6} />}
                      <text x={cx} y={cy} fontFamily={FONT} fontSize={22} fontWeight={filled || d === today ? 800 : 600} fill={textColor} textAnchor="middle">{Number(d.slice(8))}</text>
                    </g>
                  );
                }),
              )}
            </g>
          );
        })}
        {/* 범례: 이 해에 쓴 종류만 */}
        <g data-legend>
          {kindsUsed.map((k, i) => (
            <g key={k} transform={`translate(${M + i * 112} ${H - 74})`}>
              <circle cx={10} cy={-7} r={10} fill={LEAVE_HEX[k] ?? "#6e6e73"} />
              <text x={28} y={0} fontFamily={FONT} fontSize={22} fontWeight={600} fill="#3a3a3c">{LEAVE_LABEL[k] ?? k}</text>
            </g>
          ))}
          {hasPlan && (
            <g transform={`translate(${M + kindsUsed.length * 112} ${H - 74})`}>
              <circle cx={10} cy={-7} r={10} fill="none" stroke="#6e6e73" strokeWidth={3} strokeDasharray="4 3" />
              <text x={28} y={0} fontFamily={FONT} fontSize={22} fontWeight={600} fill="#3a3a3c">계획</text>
            </g>
          )}
          {kindsUsed.length === 0 && !hasPlan && (
            <text x={M} y={H - 74} fontFamily={FONT} fontSize={22} fill="#8e8e93">{`${year}년에 입력한 휴가가 없습니다`}</text>
          )}
        </g>
        <text x={W / 2} y={H - 22} fontFamily={FONT} fontSize={20} fill="#8e8e93" textAnchor="middle">{`군견훈육중대 주말출근 관리체계 · ${today.replaceAll("-", ".")} 기준`}</text>
      </svg>
    </div>
  );
}
