import assert from "node:assert/strict";
import test from "node:test";
import { shouldRunEnterAction } from "./keyboard-workflow.ts";

test("plain Enter in a text or number input runs the workflow action", () => {
  assert.equal(shouldRunEnterAction({ key: "Enter", targetTag: "INPUT", targetType: "text" }), true);
  assert.equal(shouldRunEnterAction({ key: "Enter", targetTag: "INPUT", targetType: "number" }), true);
});

test("Enter does not hijack IME, modified, repeated, or native activation controls", () => {
  assert.equal(shouldRunEnterAction({ key: "Enter", isComposing: true, targetTag: "INPUT" }), false);
  assert.equal(shouldRunEnterAction({ key: "Enter", shiftKey: true, targetTag: "INPUT" }), false);
  assert.equal(shouldRunEnterAction({ key: "Enter", repeat: true, targetTag: "INPUT" }), false);
  assert.equal(shouldRunEnterAction({ key: "Enter", targetTag: "TEXTAREA" }), false);
  assert.equal(shouldRunEnterAction({ key: "Enter", targetTag: "BUTTON" }), false);
  assert.equal(shouldRunEnterAction({ key: "Enter", targetTag: "INPUT", targetType: "checkbox" }), false);
});

test("keys other than Enter keep their native behavior", () => {
  assert.equal(shouldRunEnterAction({ key: "Tab", targetTag: "INPUT" }), false);
});
