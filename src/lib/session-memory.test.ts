import assert from "node:assert/strict";
import test from "node:test";
import { matchesMemoryShape, parseFormDraft, parseListMemory, readSessionMemory, sessionMemoryKey, writeSessionMemory, restoreListValue } from "./session-memory.ts";

test("restores only supported report views and page sizes from stale memory", () => {
  assert.equal(restoreListValue("journal", "document", ["document", "product", "department"]), "document");
  assert.equal(restoreListValue("department", "document", ["document", "product", "department"]), "department");
  assert.equal(restoreListValue(200, 20, [20, 50, 100]), 20);
  assert.equal(restoreListValue("bolt", ""), "bolt");
});

test("isolates list state and drafts by user, page, and document", () => {
  const keys = [sessionMemoryKey("alice", "list", "/purchase/pr"), sessionMemoryKey("bob", "list", "/purchase/pr"), sessionMemoryKey("alice", "list", "/purchase/po"), sessionMemoryKey("alice", "draft", "pr:new"), sessionMemoryKey("alice", "draft", "pr:42")];
  assert.equal(new Set(keys).size, keys.length);
  assert.notEqual(sessionMemoryKey("a:b", "list", "c"), sessionMemoryKey("a", "b:list", "c"));
});

test("rejects corrupt or excessive list state and removes unsafe property names", () => {
  for (const raw of [null, "{", "null", "42", "[]", "x".repeat(100_001)]) assert.deepEqual(parseListMemory(raw), {});
  assert.deepEqual(parseListMemory('{"query":"bolt","page":3,"__proto__":{"polluted":true}}'), { query: "bolt", page: 3 });
});

test("restores valid scalar and applied filters but rejects mismatched field types", () => {
  assert.equal(matchesMemoryShape("bolt", ""), true);
  assert.equal(matchesMemoryShape(3, 1), true);
  assert.equal(matchesMemoryShape("3", 1), false);
  assert.equal(matchesMemoryShape(Infinity, 1), false);
  const defaults = { startDate: "", warehouseId: null, search: "" };
  assert.equal(matchesMemoryShape({ startDate: "2026-10-05", warehouseId: 2, search: "bolt" }, defaults), true);
  assert.equal(matchesMemoryShape({ startDate: "", search: "bolt" }, defaults), false);
});

test("restores a form draft only for matching server revision and form shape", () => {
  const initial = { remarks: "", warehouseId: "", lines: [{ quantity: "1", itemId: 1 }] };
  const draft = { remarks: "unfinished", warehouseId: "2", lines: [{ quantity: "4", itemId: 8 }] };
  const raw = JSON.stringify({ revision: "updated-1", value: draft });
  assert.deepEqual(parseFormDraft(raw, initial, "updated-1"), draft);
  assert.equal(parseFormDraft(raw, initial, "updated-2"), null);
  assert.equal(parseFormDraft('{"revision":"updated-1","value":{"remarks":4}}', initial, "updated-1"), null);
  assert.equal(parseFormDraft("null", initial, "updated-1"), null);
});

test("browser storage saves, recovers, deletes and handles unavailable/quota storage", () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } } });
  try {
    assert.equal(writeSessionMemory("draft", "unfinished"), true);
    assert.equal(readSessionMemory("draft"), "unfinished");
    assert.equal(writeSessionMemory("draft", null), true);
    assert.equal(readSessionMemory("draft"), null);
    Object.defineProperty(globalThis, "window", { configurable: true, get: () => { throw new Error("storage blocked"); } });
    assert.equal(writeSessionMemory("draft", "unfinished"), false);
    assert.equal(readSessionMemory("draft"), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
