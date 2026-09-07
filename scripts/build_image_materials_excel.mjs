import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outDir = "outputs/019fc280-0866-7c92-a359-7eff48684ac5";

const sourceRows = [
  [1,2.0,108,1220,"SAPH440","14053-01"],
  [1,2.0,80,1220,"SAPH440","16278-BZ120-03"],
  [1,2.0,120,1220,"SAPH440","16278-BZ120-04"],
  [1,2.0,65,1220,"SAPH440","21021A030P-02"],
  [1,1.6,61,1220,"SAPH440","1310B345-03"],
  [1,2.0,75,1220,"SAPH440","13049-7MA0A-01"],
  [1,4.5,63,1220,"SPHC-P/O","16278-645WL-02"],
  [1,4.5,93,1220,"SPHC-P/O","16278-645WL-03"],
  [1,2.6,75,1220,"SPHC-P/O","23770-130YL-02"],
  [1,2.0,112,1220,"SPHC-P/O","21021A030P-01"],
  [1,4.5,77,1220,"SPHC-P/O","16278-851YN-01"],
  [1,4.5,102,1220,"SPHC-P/O","16278-851YN-02"],
  [1,4.5,100,1220,"SPHC-P/O","16278-851YN-04"],
  [1,3.2,98,1220,"SPHC-P/O","16278-851YN-07"],
  [1,2.0,57,1220,"SPHC-P/O","16278-851YN-08"],
  [1,3.2,26,1220,"SPHC-P/O","16278-851YN-05"],
  [2,2.0,108,1220,"SAPH440","14053-01"],
  [2,2.0,80,1220,"SAPH440","16278-BZ120-03"],
  [2,2.0,120,1220,"SAPH440","16278-BZ120-04"],
  [2,2.0,65,1220,"SAPH440","21021A030P-02"],
  [2,1.6,61,1220,"SAPH440","1310B345-03"],
  [2,2.0,75,1220,"SAPH440","13049-7MA0A-01"],
  [3,1.2,76,1220,"SPCC","16025-851YL-3"],
  [3,2.0,89,1220,"SPCC","17761-T9AA"],
  [3,1.0,39,1220,"SPCC","25733-02"],
  [3,1.6,26,1220,"SPCC","21021A370P"],
  [3,1.6,42,1220,"SPCC","2102A370P-03"],
  [3,1.0,96,1220,"SPCEN","1710A687"],
  [3,1.6,88,1220,"SPHC-P/O","49713A00P-B1"],
  [3,1.6,120,1220,"SPHC-P/O","49714A020P-B1"],
  [3,1.6,74,1220,"SPHC-P/O","47401A00P-B1"],
  [3,1.6,70,1220,"SPHC-P/O","36168-55AA"],
  [3,1.4,85,1220,"SPCC","46398-3M0A"],
  [3,1.2,330,1220,"SPCC","17762-3C0"],
  [3,1.2,310,1220,"SPCC","17763-3C0"],
  [3,3.2,1220,2440,"SPHC-P/O",""],
  [3,2.6,1220,2440,"SPHC-P/O",""],
  [4,10.0,84,1220,"SS400","21021A130P-03"],
  [4,6.0,75,1220,"SPHC-P/O","16027-01"],
  [4,2.0,45,1220,"SPHC-P/O","25706-01"],
  [4,2.0,51,1220,"SPHC-P/O","25706-03"],
  [4,1.6,65,1220,"SPHC-P/O","16279-851YM-1"],
  [4,2.6,76,1220,"SPHC-P/O","23770-851YL-2"],
  [4,2.6,93,1220,"SPHC-P/O","23812-0E010-1"],
  [4,2.6,120,1220,"SPHC-P/O","49721A00P-B1/B2"],
  [4,2.3,105,1220,"SPHC-P/O","49721A00P-B3"],
  [4,4.5,53,1220,"SPHC-P/O","16278-851YM-01"],
  [4,4.5,68,1220,"SPHC-P/O","16278-851YM-02"],
  [4,4.5,67,1220,"SPHC-P/O","16279-851YM-3"],
  [4,2.0,73,1220,"SPHC-P/O","16027-075YN-01"],
  [4,2.0,78,1220,"SPHC-P/O","16268-964YL-01"],
  [4,2.0,86,1220,"SPHC-P/O","16268-964YL-02"],
  [4,1.6,70,1220,"SPHC-P/O","19540-64AA"],
  [4,1.6,90,1220,"SPHC-P/O","21021A060P-01"],
  [4,1.6,78,1220,"SPHC-P/O","21511W010P-01"],
  [4,1.6,80,1220,"SPHC-P/O","21511W010P-02"],
  [4,1.6,124,1220,"SPHC-P/O","21519W000P-01"],
  [4,1.6,146,1220,"SPHC-P/O","21519W000P-02"],
];

const key = r => r.slice(1).join("|");
const itemName = r => `${Number(r[1]).toFixed(1)}*${r[2]}*${r[3]} ${r[4]}${r[5] ? ` (${r[5]})` : ""}`;
const steelType = grade => {
  if (grade === "SAPH440" || grade === "SPHC-P/O" || grade === "SS400") return "เหล็กแผ่นรีดร้อน";
  if (grade === "SPCC" || grade === "SPCEN") return "เหล็กแผ่นรีดเย็น";
  return "ไม่ระบุ";
};
const seen = new Set();
const all = sourceRows.map((r, i) => {
  const duplicate = seen.has(key(r));
  seen.add(key(r));
  return [i + 1, r[0], itemName(r), r[4], steelType(r[4]), r[1], r[2], r[3], duplicate ? "ซ้ำ" : "ไม่ซ้ำ"];
});
const unique = all.filter(r => r[8] === "ไม่ซ้ำ").map((r, i) => [i + 1, r[2], r[3], r[4], r[5], r[6], r[7]]);

const wb = Workbook.create();
const main = wb.worksheets.add("รายการไม่ซ้ำ");
const raw = wb.worksheets.add("ข้อมูลจากรูปทั้งหมด");

main.getRange("A1:G1").merge();
main.getRange("A1").values = [["รายการวัสดุจากรูปภาพ (ตัดรายการซ้ำแล้ว)"]];
main.getRange("A2:G2").values = [["ลำดับ","ชื่อรายการ","เกรดวัสดุ","กลุ่มวัตถุดิบ","ความหนา","กว้าง","ยาว"]];
main.getRange(`A3:G${unique.length + 2}`).values = unique;
main.tables.add(`A2:G${unique.length + 2}`, true, "UniqueMaterialsTable").style = "TableStyleMedium2";

raw.getRange("A1:I1").merge();
raw.getRange("A1").values = [["ข้อมูลถอดจากรูปทั้งหมด (รวมรายการซ้ำ)"]];
raw.getRange("A2:I2").values = [["ลำดับทั้งหมด","รูปที่","ชื่อรายการ","เกรดวัสดุ","กลุ่มวัตถุดิบ","ความหนา","กว้าง","ยาว","สถานะ"]];
raw.getRange(`A3:I${all.length + 2}`).values = all;
raw.tables.add(`A2:I${all.length + 2}`, true, "AllImageRowsTable").style = "TableStyleMedium2";

for (const [sheet, cols, rows] of [[main,7,unique.length+2],[raw,9,all.length+2]]) {
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(2);
  sheet.getRangeByIndexes(0,0,1,cols).format = {fill:"#1F4E78",font:{bold:true,color:"#FFFFFF",size:15},horizontalAlignment:"center",verticalAlignment:"center"};
  sheet.getRangeByIndexes(0,0,1,cols).format.rowHeight = 28;
  sheet.getRangeByIndexes(1,0,1,cols).format = {fill:"#D9EAF7",font:{bold:true,color:"#163A5F"},horizontalAlignment:"center",verticalAlignment:"center",wrapText:true};
  sheet.getRangeByIndexes(1,0,rows-1,cols).format.borders = {insideHorizontal:{style:"thin",color:"#D9E2F3"},bottom:{style:"thin",color:"#A6B8CC"}};
  sheet.getRangeByIndexes(2,0,rows-2,Math.min(2,cols)).format.horizontalAlignment = "center";
}
raw.getRange(`B3:B${all.length+2}`).format.numberFormat = "0";
main.getRange(`E3:E${unique.length+2}`).format.numberFormat = "0.0";
main.getRange(`F3:G${unique.length+2}`).format.numberFormat = "0";
raw.getRange(`F3:F${all.length+2}`).format.numberFormat = "0.0";
raw.getRange(`G3:H${all.length+2}`).format.numberFormat = "0";
main.getRange("A:G").format.font = {name:"Aptos",size:11};
raw.getRange("A:I").format.font = {name:"Aptos",size:11};
main.getRange("A:A").format.columnWidth = 9; main.getRange("B:B").format.columnWidth = 46; main.getRange("C:C").format.columnWidth = 16; main.getRange("D:D").format.columnWidth = 22; main.getRange("E:G").format.columnWidth = 13;
raw.getRange("A:B").format.columnWidth = 12; raw.getRange("C:C").format.columnWidth = 46; raw.getRange("D:D").format.columnWidth = 16; raw.getRange("E:E").format.columnWidth = 22; raw.getRange("F:H").format.columnWidth = 13; raw.getRange("I:I").format.columnWidth = 12;
raw.getRange("I19:I24").format = {fill:"#FCE8E6",font:{color:"#B3261E",bold:true},horizontalAlignment:"center"};
raw.getRange("I3:I18").format.horizontalAlignment = "center";
raw.getRange(`I25:I${all.length+2}`).format.horizontalAlignment = "center";

await fs.mkdir(outDir, {recursive:true});
const inspect = await wb.inspect({kind:"table",range:`รายการไม่ซ้ำ!A1:G${unique.length+2}`,include:"values,formulas",tableMaxRows:8,tableMaxCols:7});
console.log(inspect.ndjson);
const errors = await wb.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",options:{useRegex:true,maxResults:100},summary:"formula errors"});
console.log(errors.ndjson);
for (const sheetName of ["รายการไม่ซ้ำ","ข้อมูลจากรูปทั้งหมด"]) {
  const preview = await wb.render({sheetName,autoCrop:"all",scale:1,format:"png"});
  await fs.writeFile(`${outDir}/${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(`${outDir}/material_data_from_images.xlsx`);
console.log(JSON.stringify({raw:all.length,unique:unique.length,duplicates:all.length-unique.length,path:`${outDir}/material_data_from_images.xlsx`}));
