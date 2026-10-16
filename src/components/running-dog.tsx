"use client";
// ─────────────────────────────────────────────────────────────
// 진행 막대 위를 달리는 흑백 강아지(셰퍼드) — 그림 파일 없이 코드로 그립니다.
// - 다리마다 관절(윗다리·아랫다리·발)이 있고, 실제 질주(갤럽) 단계별 각도를 정해 두고
//   그 사이를 부드럽게 이어서 매 화면(초당 약 60번)마다 다시 그립니다.
// - 앞쪽 다리는 흰색, 먼 쪽 다리는 회색이라 입체감이 납니다. 뒷발이 땅을 찰 때 먼지가 납니다.
// - 휴대폰 "동작 줄이기" 설정을 켠 사람에게는 멈춘 자세로만 보입니다.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from "react";

type P = [number, number];
const R = Math.PI / 180;
const CYCLE = 0.46; // 한 걸음(질주 한 바퀴)에 걸리는 초

// 점들을 지나는 부드러운 닫힌 곡선(캣멀-롬 곡선 → SVG 베지어)
function smooth(p: P[]) {
  const n = p.length;
  const g = (i: number) => p[(i + n) % n];
  let d = `M${p[0][0].toFixed(2)},${p[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const [a, b, c, e] = [g(i - 1), g(i), g(i + 1), g(i + 2)];
    d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(2)},${(b[1] + (c[1] - a[1]) / 6).toFixed(2)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(2)},${(c[1] - (e[1] - b[1]) / 6).toFixed(2)} ${c[0].toFixed(2)},${c[1].toFixed(2)}`;
  }
  return d + "Z";
}

// 반복되는 키프레임 사이를 부드럽게 보간 (t: 0~1 한 바퀴)
type Frames = [number, number[]][];
function key(frames: Frames, t: number) {
  t = ((t % 1) + 1) % 1;
  const n = frames.length;
  let i = 0;
  while (i < n - 1 && frames[i + 1][0] <= t) i++;
  const f0 = frames[i], f1 = frames[(i + 1) % n];
  const t1 = f1[0] + (i + 1 >= n ? 1 : 0);
  const u = (t - f0[0]) / (t1 - f0[0]);
  const fm = frames[(i - 1 + n) % n], f2 = frames[(i + 2) % n];
  return f0[1].map((v0, k) => {
    const v1 = f1[1][k], vm = fm[1][k], v2 = f2[1][k];
    return v0 + 0.5 * u * (v1 - vm + u * (2 * vm - 5 * v0 + 4 * v1 - v2 + u * (3 * (v0 - v1) + v2 - vm)));
  });
}

// 시작점에서 각도(0=아래, +는 앞쪽)와 길이대로 관절을 이어 붙임
function chain(o: P, angs: number[], lens: number[]) {
  const pts: P[] = [o];
  let p = o;
  angs.forEach((a, i) => {
    p = [p[0] + Math.sin(a * R) * lens[i], p[1] + Math.cos(a * R) * lens[i]];
    pts.push(p);
  });
  return pts;
}

// 질주 동작: [한 바퀴 중 시점, [윗다리, 아랫다리, 발] 각도]
const FRONT: Frames = [[0, [40, 72, 95]], [0.18, [22, 18, 60]], [0.32, [-6, -14, 8]], [0.46, [-32, -62, -120]], [0.62, [-8, -58, -150]], [0.8, [22, 20, -40]]];
const BACK: Frames = [[0, [-48, -86, -62]], [0.18, [-16, -100, -30]], [0.36, [30, -46, 10]], [0.5, [52, 8, 44]], [0.66, [34, -22, 6]], [0.82, [-12, -58, -22]]];
const LF = [12, 13, 6], LB = [13, 13, 10];

// t(걸음 수)에 해당하는 강아지 모양을 SVG 조각들로 계산
function drawDog(t: number, T: number) {
  const flex = (1 - Math.cos(2 * Math.PI * t)) / 2; // 0: 몸을 쭉 뻗음, 1: 웅크림
  const S0: P = [19, -6], H0: P = [-21 + flex * 6, -5 + flex * 1.5]; // 어깨, 엉덩이
  const fN = chain(S0, key(FRONT, t), LF), fF = chain([S0[0] - 2, S0[1]], key(FRONT, t + 0.08), LF);
  const bN = chain(H0, key(BACK, t), LB), bF = chain([H0[0] - 2, H0[1]], key(BACK, t + 0.07), LB);
  // 가장 낮은 발이 땅(y=26)에 닿게 하고, 공중 구간에서는 살짝 떠오름
  const low = Math.max(fN[3][1], fF[3][1], bN[3][1], bF[3][1]);
  const tt = ((t % 1) + 1) % 1;
  const lift = 3.2 * Math.exp(-Math.pow((((tt + 0.5) % 1) - 0.5) / 0.07, 2)) + 2.6 * Math.exp(-Math.pow((tt - 0.47) / 0.07, 2));
  const dy = 26 - low - lift;
  const sh = ([x, y]: P): P => [x, y + dy];
  const S = sh(S0), H = sh(H0);
  const mid = (S[0] + H[0]) / 2, arch = flex * 3.5;

  // 머리(달릴 때 살짝 끄덕임)
  const ha = 6 * Math.sin(2 * Math.PI * (t + 0.15)) * R;
  const hx = S[0] + 9, hy = S[1] - 9.5 + 1.5 * Math.sin(2 * Math.PI * (t + 0.1));
  const hp = (x: number, y: number): P => [hx + x * Math.cos(ha) - y * Math.sin(ha), hy + x * Math.sin(ha) + y * Math.cos(ha)];
  const head = [hp(-1, -4), hp(5, -6.5), hp(9.5, -5.5), hp(12.5, -3.6), hp(19.5, -1.2), hp(22.5, 0.6), hp(22.4, 2.8), hp(18.5, 4.4), hp(12, 5.6), hp(5, 7)];
  // 몸통 윤곽: 엉덩이 위 → 등 → 목 → 머리 → 가슴 → 배(허리 잘록) → 허벅지 → 엉덩이
  const body = smooth([
    [H[0] - 1, H[1] - 7], [mid - 2, H[1] - 8.5 - arch], [S[0] - 3, S[1] - 9.5],
    [S[0] + 3, S[1] - 11], ...head, [S[0] + 9, S[1] + 0.5],
    [S[0] + 7, S[1] + 6], [S[0] + 1, S[1] + 11.5], [mid + 4, S[1] + 10 - flex],
    [mid - 6, H[1] + 5.5 - flex], [H[0] + 6, H[1] + 8], [H[0] - 3, H[1] + 7], [H[0] - 8, H[1]],
  ]);
  // 쫑긋한 귀 두 개
  const e1 = [hp(0, -4.5), hp(1.2, -12.5), hp(5.5, -5.8)], e2 = [hp(3, -5.8), hp(5.6, -13), hp(8.6, -5.4)];
  const ears = `M${e1.join("L")}Z M${e2.join("L")}Z`;
  // 꼬리: 낮게 뒤로 휘날림
  const tw = Math.sin(2 * Math.PI * (t - 0.2));
  const tb: P = [H[0] - 6, H[1] - 4];
  const tp: P[] = [[tb[0] + 1, tb[1] + 1], [tb[0] - 7, tb[1] + 1 + tw * 1.5], [tb[0] - 14, tb[1] + 3 + tw * 3.5], [tb[0] - 21, tb[1] + 6 + tw * 5]];
  const ws = [3.4, 3.6, 3, 1];
  const tail = smooth([...tp.map((q, i): P => [q[0], q[1] - ws[i]]), ...tp.map((q, i): P => [q[0], q[1] + ws[i] * 0.8]).reverse()]);
  // 다리: 관절마다 둥근 끝 선
  const leg = (c: P[], w: number[], col: string) =>
    c.slice(0, 3).map((a, i) => {
      const A = sh(a), B = sh(c[i + 1]);
      return `<path d="M${A[0].toFixed(2)},${A[1].toFixed(2)}L${B[0].toFixed(2)},${B[1].toFixed(2)}" stroke="${col}" stroke-width="${w[i]}" stroke-linecap="round" fill="none"/>`;
    }).join("");
  const legs = (f: P[], b: P[], col: string) => leg(f, [7, 5, 4.2], col) + leg(b, [10, 5.2, 4.2], col);
  // 먼지: 뒷발이 땅을 찰 때 뒤쪽으로 퍼지며 사라짐
  let dust = "";
  for (let c = Math.floor(t) - 2; c <= Math.floor(t); c++) {
    const age = T - (c + 0.66) * CYCLE;
    if (age < 0 || age > 0.55) continue;
    const a = age / 0.55;
    for (let j = 0; j < 3; j++) {
      dust += `<circle cx="${(-14 - j * 4 - a * 16).toFixed(1)}" cy="${(25 - a * (4 + j * 2)).toFixed(1)}" r="${((1.4 + j * 0.5) * (1 + a * 1.8)).toFixed(1)}" fill="#8e8e93" opacity="${(0.55 * (1 - a)).toFixed(2)}"/>`;
    }
  }
  const eye = hp(13, -1), nose = hp(22.6, 1.6);
  return { body, ears, tail, far: legs(fF, bF, "#8e8e93"), near: legs(fN, bN, "#fff"), dust, eye, nose };
}

export function RunningDog({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const q = (id: string) => el.querySelector(`[data-p="${id}"]`)!;
    const paint = (T: number) => {
      const d = drawDog(T / CYCLE, T);
      q("body").setAttribute("d", d.body);
      q("ears").setAttribute("d", d.ears);
      q("tail").setAttribute("d", d.tail);
      q("far").innerHTML = d.far;
      q("near").innerHTML = d.near;
      q("dust").innerHTML = d.dust;
      q("eye").setAttribute("cx", String(d.eye[0])); q("eye").setAttribute("cy", String(d.eye[1]));
      q("nose").setAttribute("cx", String(d.nose[0])); q("nose").setAttribute("cy", String(d.nose[1]));
    };
    // "동작 줄이기"를 켠 경우: 한 자세로 멈춰 있음
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(0.12 * CYCLE);
      return;
    }
    let id = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      paint((now - t0) / 1000);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id); // 화면을 떠나면 멈춤
  }, []);

  return (
    <svg ref={svg} viewBox="-50 -42 100 70" className={className} style={{ overflow: "visible", ...style }} aria-hidden="true">
      <g data-p="dust" />
      <g data-p="far" />
      <path data-p="tail" fill="#fff" />
      <path data-p="body" fill="#fff" />
      <path data-p="ears" fill="#fff" />
      <g data-p="near" />
      <circle data-p="eye" r="1.6" fill="#1d1d1f" />
      <circle data-p="nose" r="1.7" fill="#1d1d1f" />
    </svg>
  );
}
