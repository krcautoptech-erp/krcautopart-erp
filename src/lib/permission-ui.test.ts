import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageCatalogLifecycle,
  canManageUsers,
  canPerform,
} from "./permission-ui.ts";

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

test("catalog lifecycle follows the server's deactivate-or-edit contract", () => {
  assert.equal(canManageCatalogLifecycle(["items.deactivate"], false), true);
  assert.equal(canManageCatalogLifecycle(["items.edit"], false), true);
  assert.equal(canManageCatalogLifecycle(["items.view"], false), false);
});

test("user account mutations remain owner-only even when legacy grants exist", () => {
  assert.equal(canManageUsers(false), false);
  assert.equal(canManageUsers(true), true);
});
