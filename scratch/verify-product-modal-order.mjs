import fs from "node:fs";

const modalFieldOrder = [
  "ERP Code / รหัสสินค้า",
  "Part Name / ชื่อชิ้นงาน",
  "Unit / หน่วยนับ",
  "Part Number / หมายเลขชิ้นส่วน",
  "Model / รุ่น",
  "Raw Material / ชนิดวัตถุดิบ",
  "Standard / มาตรฐาน STD",
  "Plating / งานชุบเคลือบผิว",
  "Sheets per unit / จำนวนแผ่น",
  "Workpieces per sheet / ชิ้นงานต่อแผ่น",
  "COST / ต้นทุน (บาท)",
  "SELLING PRICE / ราคาขายกลาง (บาท)",
  "Status / สถานะการใช้งาน",
];

const detailOrder = [
  "Unit / หน่วยนับ",
  "Part Number / หมายเลขชิ้นส่วน",
  "Model / รุ่น",
  "Raw Material / วัตถุดิบ",
  "Standard / มาตรฐาน",
  "Plating / ชุบ",
  "Sheets per unit / จำนวนแผ่น",
  "Workpieces per sheet / ชิ้นงานต่อแผ่น",
  "Cost / ต้นทุน",
  "Median Price / ราคากลาง",
];

function assertOrdered(source, labels, file) {
  let previousIndex = -1;
  for (const label of labels) {
    const index = source.indexOf(label);
    if (index === -1) {
      throw new Error(`${file}: missing label "${label}"`);
    }
    if (index <= previousIndex) {
      throw new Error(`${file}: label "${label}" is out of order`);
    }
    previousIndex = index;
  }
}

function getFieldBlock(source, label, file) {
  const start = source.indexOf(`label="${label}"`);
  if (start === -1) {
    throw new Error(`${file}: missing label "${label}"`);
  }
  const end = source.indexOf("</ProductField>", start);
  if (end === -1) {
    throw new Error(`${file}: field "${label}" is missing a closing ProductField`);
  }
  return source.slice(start, end);
}

for (const file of [
  "src/app/(dashboard)/products/_components/product-add-modal.tsx",
  "src/app/(dashboard)/products/_components/product-edit-modal.tsx",
]) {
  const source = fs.readFileSync(file, "utf8");
  assertOrdered(source, modalFieldOrder, file);
  if (!source.includes('checked={draft.status === "ใช้งาน"}')) {
    throw new Error(`${file}: status must use a checkbox toggle`);
  }
  const partNumberBlock = getFieldBlock(source, "Part Number / หมายเลขชิ้นส่วน", file);
  const partNameBlock = getFieldBlock(source, "Part Name / ชื่อชิ้นงาน", file);
  const erpCodeBlock = getFieldBlock(source, "ERP Code / รหัสสินค้า", file);
  if (!erpCodeBlock.includes("required")) {
    throw new Error(`${file}: erp code must be required`);
  }
  if (!partNumberBlock.includes('className="sm:col-span-2"')) {
    throw new Error(`${file}: part number must span the full row`);
  }
  if (partNameBlock.includes('className="sm:col-span-2"')) {
    throw new Error(`${file}: part name must stay paired with unit`);
  }
}

{
  const file = "src/app/(dashboard)/products/_components/product-detail-modal.tsx";
  const source = fs.readFileSync(file, "utf8");
  assertOrdered(source, detailOrder, file);
}

console.log("product modal order verified");
