import assert from "node:assert";
import { buildPostText, buildRankText } from "../../src/lib/roster-text";
// 자리: 설정 순서(진료실 먼저)와 상관없이 글에서는 훈련동 → … → 진료실 → 운전병 → 선탑
const posts = [
  { id: 1, name: "진료실", pool: "clinic", required: 2 },
  { id: 8, name: "주말 운전", pool: "driver", required: 1 },
  { id: 9, name: "선탑", pool: "escort", required: 1 },
  { id: 2, name: "관리 1동", pool: "general", required: 1 },
  { id: 5, name: "훈련동", pool: "general", required: 4 },
  { id: 7, name: "분만실", pool: "general", required: 0 },
];
const roster = [
  { postId: 5, name: "홍원표", rank: "일병" }, { postId: 5, name: "조성휘", rank: "상병" }, { postId: 5, name: "신승민", rank: "일병" },
  { postId: 2, name: "홍예준", rank: "상병" },
  { postId: 1, name: "정영우", rank: "상병" }, { postId: 1, name: "임세윤", rank: "병장" },
  { postId: 8, name: "강민창", rank: "병장" },
  { postId: 5, name: "한정민", rank: "병장" }, { postId: 9, name: "한정민", rank: "병장" },
  { postId: 2, name: "새사람", rank: null },
];
const t1 = buildPostText("2026-10-01", posts, roster);
assert.strictEqual(t1, [
  "필승! 10/1 (목) 출근 명단 입니다",
  "훈련동: 병장 한정민, 상병 조성휘, 일병 신승민, 일병 홍원표",
  "관리 1동: 상병 홍예준, 새사람",
  "진료실: 병장 임세윤, 상병 정영우",
  "운전병: 병장 강민창",
  "선탑: 병장 한정민",
].join("\n"));
console.log(t1); console.log("✔ 동별");
const t2 = buildRankText("2026-10-01", posts, roster);
assert.strictEqual(t2, [
  "필승! 10.01 (목) 출근 명단 입니다!",
  "병장 : 임세윤, 한정민",
  "상병 : 정영우, 조성휘, 홍예준",
  "일병 : 신승민, 홍원표",
  "계급 미지정 : 새사람",
].join("\n"));
console.log(t2); console.log("✔ 계급별 (운전병 제외, 선탑 중복 없음)");
// 선탑 미지정 → "선탑: 미정"
assert.ok(buildPostText("2026-10-01", posts, roster.filter(r => r.postId !== 9)).endsWith("선탑: 미정"));
console.log("ALL OK");
