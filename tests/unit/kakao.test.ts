import assert from "node:assert";
import { buildKakaoText } from "../../src/lib/roster-text";
const posts = [{id:1,name:"진료실",required:2},{id:2,name:"관리 1동",required:1},{id:3,name:"관리 2동",required:3},{id:9,name:"없는동",required:0}];
const t = buildKakaoText("2026-10-11", posts, [{postId:1,name:"홍길동"},{postId:1,name:"김철수"},{postId:2,name:"이영희"},{postId:3,name:"박민수"}]);
assert.strictEqual(t, "[10/11(일) 근무 명단]\n■ 진료실 (2명)\n- 김철수\n- 홍길동\n■ 관리 1동 (1명)\n- 이영희\n■ 관리 2동 (1명) (빈자리 2)\n- 박민수");
console.log(t); console.log("ALL OK");
