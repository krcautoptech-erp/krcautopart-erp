import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultItemFormFields,
  normalizeItemFormFields,
  normalizeItemFormFieldsForTemplate,
  normalizeItemType,
} from "./items.ts";

test("normalizeItemFormFields fills missing fields with safe defaults", () => {
  const fields = normalizeItemFormFields({ brand: "required", image: "hidden" });

  assert.equal(fields.brand, "required");
  assert.equal(fields.image, "hidden");
  assert.equal(fields.model, defaultItemFormFields.model);
  assert.equal(fields.description, defaultItemFormFields.description);
});

test("legacy RM config maps to the fields used by the current raw-material form", () => {
  const legacy = Object.fromEntries(Object.entries(defaultItemFormFields).filter(([key]) => ["brand", "model", "partNumber", "dimensions", "image", "attachments", "description", "leadTime", "vendors"].includes(key)));
  const fields = normalizeItemFormFieldsForTemplate(legacy, "raw_material");

  assert.equal(fields.materialGrade, "required");
  assert.equal(fields.itemGroup, "required");
  assert.equal(fields.thickness, "required");
  assert.equal(fields.warehouse, "required");
});

test("legacy FG config maps to the fields used by the current finished-good form", () => {
  const legacy = Object.fromEntries(Object.entries(defaultItemFormFields).filter(([key]) => ["brand", "model", "partNumber", "dimensions", "image", "attachments", "description", "leadTime", "vendors"].includes(key)));
  const fields = normalizeItemFormFieldsForTemplate(legacy, "finished_good");

  assert.equal(fields.partNumber, "required");
  assert.equal(fields.model, "optional");
  assert.equal(fields.materialGrade, "optional");
  assert.equal(fields.sellingPrice, "optional");
});

test("normalizeItemFormFields rejects unknown visibility values", () => {
  const fields = normalizeItemFormFields({ brand: "always" });

  assert.equal(fields.brand, defaultItemFormFields.brand);
});

test("normalizeItemType normalizes persisted form field settings", () => {
  const result = normalizeItemType({
    code: " mro ",
    name: " อะไหล่ ",
    nameEn: " Spare Parts ",
    formTemplate: "general",
    codeMode: "auto",
    codePrefix: " mro ",
    stocked: true,
    purchasable: true,
    sellable: false,
    productionItem: false,
    lotControlled: false,
    serialControlled: false,
    expiryControlled: false,
    dimensionEnabled: false,
    reorderEnabled: false,
    formFields: { ...defaultItemFormFields, partNumber: "required" },
    status: "active",
  });

  assert.equal(result.code, "MRO");
  assert.equal(result.codePrefix, "MRO");
  assert.equal(result.formFields.partNumber, "required");
  assert.equal(result.formFields.brand, defaultItemFormFields.brand);
});
