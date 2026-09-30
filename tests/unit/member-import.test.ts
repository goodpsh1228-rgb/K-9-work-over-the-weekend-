import { parseMemberTable, buildResultCsv } from "../../src/lib/member-import";
import assert from "node:assert";
let r = parseMemberTable("﻿이름,초기비밀번호,진료반 여부,관리자 여부\r\n가짜A,1234,O,X\r\n가짜B,,x,o\r\n\r\n\"가짜,C\",,예,아니오\n");
assert.deepStrictEqual(r.errors, []);
assert.deepStrictEqual(r.rows.map(x=>[x.name,x.password,x.isClinic,x.isAdmin]), [["가짜A","1234",true,false],["가짜B","",false,true],["가짜,C","",true,false]]);
r = parseMemberTable("가짜A\t\tO\t\n가짜B\t5678\t\tO");  // 표 붙여넣기(탭), 제목 없음
assert.deepStrictEqual(r.errors, []);
assert.deepStrictEqual(r.rows.map(x=>[x.name,x.isClinic,x.isAdmin]), [["가짜A",true,false],["가짜B",false,true]]);
r = parseMemberTable("이름,비번,진료반,관리자\n가짜A,1,O,X\n가짜B,,모름,X\n가짜C,,X,X\n가짜C,,X,X\n,1234,X,X");
console.log(r.errors);
assert.strictEqual(r.errors.length, 4);
assert.strictEqual(parseMemberTable("").errors[0], "등록할 인원이 없습니다.");
assert.ok(buildResultCsv([{name:"가짜A",password:"012345",generated:true}]).startsWith("﻿이름"));
console.log("ALL OK");
{
  const r = parseMemberTable("이름,비번,진료반,관리자,계급\n가짜A,,O,X,상등병\n가짜B,,X,X,병장\n가짜C,,X,X,\n가짜D,,X,X,대위");
  assert.deepStrictEqual(r.rows.map(x => x.rank), ["상병","병장",null]);
  assert.strictEqual(r.errors.length, 1); assert.match(r.errors[0], /계급 "대위"/);
  console.log("RANK OK");
}
