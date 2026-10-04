import assert from "node:assert/strict";
import test from "node:test";
import { canPerform } from "./permission-ui.ts";

test("shows an action only to owners or users granted its exact permission", () => {
  assert.equal(canPerform(["pr.view"], false, "pr.edit"), false);
  assert.equal(canPerform(["pr.view", "pr.edit"], false, "pr.edit"), true);
  assert.equal(canPerform([], true, "pr.edit"), true);
  assert.equal(canPerform([], false, null), true);
});

test("supports action groups without granting unrelated permissions", () => {
  assert.equal(canPerform(["pr.edit"], false, ["pr.edit", "pr.delete"]), true);
  assert.equal(canPerform(["pr.view"], false, ["pr.edit", "pr.delete"]), false);
});
