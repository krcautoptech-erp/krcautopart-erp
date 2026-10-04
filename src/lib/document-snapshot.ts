import { createHash } from "node:crypto";

/**
 * Document Snapshot & Archival Engine
 * Conforms to 2026 ERP Audit & ISO 32000-2 Canonical Printable Artifact principles.
 * Reference: docs/Printlogic.md (Lines 1321: "เก็บ hash เมื่อเอกสารต้อง audit")
 */

export interface DocumentSnapshot<T = unknown> {
  documentType: string;
  documentNumber: string;
  version: number;
  capturedAt: string;
  capturedBy: string;
  hash: string;
  metadata?: Record<string, unknown>;
  payload: T;
}

export interface CreateSnapshotParams<T> {
  documentType: string;
  documentNumber: string;
  payload: T;
  capturedBy: string;
  version?: number;
  metadata?: Record<string, unknown>;
  capturedAt?: string;
}

/**
 * Produces a deterministic canonical string from any JSON-serializable object
 * by sorting keys recursively.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([_, val]) => val !== undefined)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

  const serializedProps = entries.map(
    ([key, val]) => `${JSON.stringify(key)}:${canonicalizeJson(val)}`,
  );

  return `{${serializedProps.join(",")}}`;
}

/**
 * Computes a deterministic SHA-256 hash for document payload verification.
 */
export function computeDocumentHash(payload: unknown): string {
  const canonicalString = canonicalizeJson(payload);
  return createHash("sha256").update(canonicalString, "utf8").digest("hex");
}

/**
 * Creates an immutable snapshot for an approved business document.
 * Protects historical records against future master data changes.
 */
export function createDocumentSnapshot<T>(
  params: CreateSnapshotParams<T>,
): DocumentSnapshot<T> {
  const {
    documentType,
    documentNumber,
    payload,
    capturedBy,
    version = 1,
    metadata,
    capturedAt = new Date().toISOString(),
  } = params;

  const hash = computeDocumentHash(payload);

  return {
    documentType,
    documentNumber,
    version,
    capturedAt,
    capturedBy,
    hash,
    metadata,
    payload,
  };
}

/**
 * Verifies that a document snapshot has not been tampered with.
 */
export function verifyDocumentSnapshot(
  snapshot: DocumentSnapshot<unknown>,
): boolean {
  if (!snapshot || !snapshot.hash || !snapshot.payload) {
    return false;
  }
  const expectedHash = computeDocumentHash(snapshot.payload);
  return snapshot.hash === expectedHash;
}
