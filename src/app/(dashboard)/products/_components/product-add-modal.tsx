"use client";

import React, { useState } from "react";
import { createProductAction } from "@/app/actions/products";
import type { ProductRecord } from "./product-catalog";
import {
  inputClassName,
  PRODUCT_UNIT_OPTIONS,
  ProductDraft,
  ProductField,
  ProductImagePanel,
  ProductModalShell,
  ProductPriceField,
  ProductStatusToggle,
} from "./product-modal-shared";

interface ProductAddModalProps {
  onClose: () => void;
  materialGrades: { id: number; grade_name: string; status: string }[];
  onSaveSuccess: (newProduct: ProductRecord) => void;
  onError: (msg: string) => void;
}

export function ProductAddModal({
  onClose,
  materialGrades,
  onSaveSuccess,
  onError,
}: ProductAddModalProps) {
  const activeMaterialGrades = materialGrades
    .filter((grade) => grade.status === "active")
    .map((grade) => grade.grade_name);

  const [draft, setDraft] = useState<ProductDraft>({
    part_number: "",
    part_name: "",
    material: activeMaterialGrades[0] || "",
    plating: "",
    std_no: "",
    sheet_count: "",
    parts_per_sheet: "",
    cost_price: "",
    selling_price: "",
    unit: "ชิ้น",
    status: "ใช้งาน",
    model: "",
    erp_code: "",
  });
  const [tempImage, setTempImage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [prevDefaultGrade, setPrevDefaultGrade] = useState(activeMaterialGrades[0]);
  if (activeMaterialGrades[0] !== prevDefaultGrade) {
    setPrevDefaultGrade(activeMaterialGrades[0]);
    if (!draft.material && activeMaterialGrades[0]) {
      setDraft((current) => ({ ...current, material: activeMaterialGrades[0] }));
    }
  }

  const updateDraft = (key: keyof ProductDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setTempImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.erp_code.trim() || !draft.part_number.trim() || !draft.part_name.trim()) {
      return;
    }

    setIsSaving(true);

    const result = await createProductAction({
      part_number: draft.part_number.trim(),
      part_name: draft.part_name.trim(),
      material: draft.material.trim(),
      plating: draft.plating.trim(),
      std_no: draft.std_no.trim(),
      sheet_count: draft.sheet_count.trim() ? parseFloat(draft.sheet_count) : null,
      parts_per_sheet: draft.parts_per_sheet.trim()
        ? parseInt(draft.parts_per_sheet, 10)
        : null,
      primary_image: tempImage || null,
      cost_price: draft.cost_price.trim() ? parseFloat(draft.cost_price) : 0,
      selling_price: draft.selling_price.trim() ? parseFloat(draft.selling_price) : 0,
      unit: draft.unit,
      status: draft.status,
      model: draft.model.trim(),
      erp_code: draft.erp_code.trim(),
    });

    setIsSaving(false);

    if ("error" in result) {
      onError(result.error);
      return;
    }

    if (result.data) {
      onSaveSuccess(result.data as ProductRecord);
    }
  };

  return (
    <ProductModalShell onClose={onClose} title="เพิ่มข้อมูลสินค้า">
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <ProductImagePanel
          imageLabel="รูปตัวอย่างสินค้า"
          imageSrc={tempImage}
          onFileChange={handleFileChange}
          onRemoveImage={() => setTempImage("")}
        />

        <form
          onSubmit={handleSaveProduct}
          className="flex w-full flex-col justify-between overflow-y-auto bg-white/90 p-md custom-scrollbar dark:bg-surface-container-lowest/90 lg:w-[60%] lg:p-lg"
        >
          <div className="grid grid-cols-1 gap-x-md gap-y-md sm:grid-cols-2 sm:gap-x-lg">
            <ProductField
              label="ERP Code / รหัสสินค้า"
              required
              stepNumber="01"
              className="sm:col-span-2"
            >
              <input
                required
                className={`${inputClassName} font-bold`}
                type="text"
                value={draft.erp_code}
                onChange={(event) => updateDraft("erp_code", event.target.value)}
              />
            </ProductField>

            <ProductField
              label="Part Name / ชื่อชิ้นงาน"
              required
              stepNumber="02"
            >
              <input
                required
                className={inputClassName}
                type="text"
                value={draft.part_name}
                onChange={(event) => updateDraft("part_name", event.target.value)}
              />
            </ProductField>

            <ProductField label="Unit / หน่วยนับ" stepNumber="03">
              <select
                className={inputClassName}
                value={draft.unit}
                onChange={(event) => updateDraft("unit", event.target.value)}
              >
                {PRODUCT_UNIT_OPTIONS.map((unit) => (
                  <option
                    key={unit}
                    value={unit}
                    className="bg-white dark:bg-surface-container-lowest"
                  >
                    {unit}
                  </option>
                ))}
              </select>
            </ProductField>

            <ProductField
              label="Part Number / หมายเลขชิ้นส่วน"
              required
              stepNumber="04"
              className="sm:col-span-2"
            >
              <input
                required
                className={`${inputClassName} font-bold text-primary`}
                type="text"
                value={draft.part_number}
                onChange={(event) => updateDraft("part_number", event.target.value)}
              />
            </ProductField>

            <ProductField label="Model / รุ่น" stepNumber="05">
              <input
                className={inputClassName}
                type="text"
                value={draft.model}
                onChange={(event) => updateDraft("model", event.target.value)}
              />
            </ProductField>

            <ProductField label="Material Grade / เกรดวัสดุ" stepNumber="06">
              <select
                className={inputClassName}
                value={draft.material}
                onChange={(event) => updateDraft("material", event.target.value)}
              >
                <option value="">เลือกเกรดวัสดุ</option>
                {activeMaterialGrades.map((material) => (
                  <option
                    key={material}
                    value={material}
                    className="bg-white dark:bg-surface-container-lowest"
                  >
                    {material}
                  </option>
                ))}
              </select>
            </ProductField>

            <ProductField label="Standard / มาตรฐาน STD" stepNumber="07">
              <input
                className={inputClassName}
                type="text"
                value={draft.std_no}
                onChange={(event) => updateDraft("std_no", event.target.value)}
              />
            </ProductField>

            <ProductField label="Plating / งานชุบเคลือบผิว" stepNumber="08">
              <input
                className={inputClassName}
                type="text"
                value={draft.plating}
                onChange={(event) => updateDraft("plating", event.target.value)}
              />
            </ProductField>

            <ProductField label="Sheets per unit / จำนวนแผ่น" stepNumber="09">
              <input
                className={inputClassName}
                type="number"
                step="any"
                value={draft.sheet_count}
                onChange={(event) => updateDraft("sheet_count", event.target.value)}
              />
            </ProductField>

            <ProductField
              label="Workpieces per sheet / ชิ้นงานต่อแผ่น"
              stepNumber="10"
            >
              <input
                className={inputClassName}
                type="number"
                value={draft.parts_per_sheet}
                onChange={(event) => updateDraft("parts_per_sheet", event.target.value)}
              />
            </ProductField>

            <ProductPriceField
              label="COST / ต้นทุน (บาท)"
              value={draft.cost_price}
              tone="text-primary"
              onChange={(event) => updateDraft("cost_price", event.target.value)}
            />

            <ProductPriceField
              label="SELLING PRICE / ราคาขายกลาง (บาท)"
              value={draft.selling_price}
              tone="text-secondary dark:text-secondary-fixed"
              onChange={(event) => updateDraft("selling_price", event.target.value)}
            />

            <ProductField
              label="Status / สถานะการใช้งาน"
              stepNumber="11"
              className="sm:col-span-2"
            >
              <ProductStatusToggle
                checked={draft.status === "ใช้งาน"}
                onChange={(checked) =>
                  updateDraft("status", checked ? "ใช้งาน" : "ระงับการใช้งาน")
                }
              />
            </ProductField>
          </div>

          <div className="mt-lg flex items-end justify-end border-t border-outline-variant pt-md">
            <div className="flex w-full flex-col-reverse gap-sm sm:w-auto sm:flex-row sm:gap-md">
              <button
                onClick={onClose}
                className="w-full rounded border border-outline-variant bg-transparent px-lg py-md font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-low sm:w-auto"
                disabled={isSaving}
                type="button"
              >
                ยกเลิก
              </button>
              <button
                className="w-full rounded bg-primary px-lg py-md font-label-md text-label-md text-on-primary shadow transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 sm:w-auto"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? "กำลังบันทึก..." : "บันทึกสินค้า"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </ProductModalShell>
  );
}
