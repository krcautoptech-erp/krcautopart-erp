import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("app locks browser zoom while mobile form controls remain at least 16px", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(layout, /maximumScale:\s*1/);
  assert.match(layout, /userScalable:\s*false/);
  assert.match(css, /input[\s\S]*select[\s\S]*textarea[\s\S]*font-size:\s*16px\s*!important/);
});

test("login does not depend on icon-font ligatures that flash raw names", () => {
  const loginPage = readFileSync("src/app/(auth)/login/login-page-client.tsx", "utf8");
  const loginForm = readFileSync("src/components/login-form.tsx", "utf8");
  assert.doesNotMatch(loginPage, /material-symbols-outlined/);
  assert.doesNotMatch(loginForm, /material-symbols-outlined/);
});

