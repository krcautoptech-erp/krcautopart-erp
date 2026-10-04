import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeJson,
  computeDocumentHash,
  createDocumentSnapshot,
  verifyDocumentSnapshot,
} from "./document-snapshot.ts";

test("canonicalizes JSON deterministically regardless of key order", () => {
  const objA = { b: 2, a: 1, c: { y: "hello", x: "world" } };
  const objB = { c: { x: "world", y: "hello" }, a: 1, b: 2 };

  assert.equal(canonicalizeJson(objA), canonicalizeJson(objB));
  assert.equal(computeDocumentHash(objA), computeDocumentHash(objB));
});

test("creates a valid document snapshot with sha256 hash", () => {
  const poData = {
    poNumber: "PO-2026-0001",
    vendorName: "บริษัท สหพัฒน์ จำกัด",
    grandTotal: 154000.5,
    items: [
      { code: "ITEM-A", qty: 10, price: 1000 },
      { code: "ITEM-B", qty: 20, price: 7200 },
    ],
  };

  const snapshot = createDocumentSnapshot({
    documentType: "purchase_order",
    documentNumber: "PO-2026-0001",
    payload: poData,
    capturedBy: "admin@krc.co.th",
  });

  assert.equal(snapshot.documentType, "purchase_order");
  assert.equal(snapshot.documentNumber, "PO-2026-0001");
  assert.equal(snapshot.capturedBy, "admin@krc.co.th");
  assert.equal(snapshot.version, 1);
  assert.match(snapshot.hash, /^[a-f0-9]{64}$/);
  assert.equal(verifyDocumentSnapshot(snapshot), true);
});

test("detects tampering when payload is modified after snapshot", () => {
  const snapshot = createDocumentSnapshot({
    documentType: "purchase_order",
    documentNumber: "PO-2026-0002",
    payload: { poNumber: "PO-2026-0002", grandTotal: 5000 },
    capturedBy: "purchaser",
  });

  assert.equal(verifyDocumentSnapshot(snapshot), true);

  // Tamper with payload
  (snapshot.payload as { grandTotal: number }).grandTotal = 99999;
  assert.equal(verifyDocumentSnapshot(snapshot), false);
});
