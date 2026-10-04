import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const companyData = readFileSync(
  new URL("./company-settings.server.ts", import.meta.url),
  "utf8",
);
const companyActions = readFileSync(
  new URL("../app/actions/company-settings.ts", import.meta.url),
  "utf8",
);
const pdfRoute = readFileSync(
  new URL("../app/api/documents/pdf/route.ts", import.meta.url),
  "utf8",
);

test("caches only slow-changing company data with bounded TTL and invalidation", () => {
  assert.match(companyData, /revalidate: 300/);
  assert.match(companyData, /company-branding/);
  assert.match(companyActions, /revalidateTag\(COMPANY_BRANDING_CACHE_TAG/);
});

test("loads protected document settings with the authenticated request client", () => {
  assert.doesNotMatch(companyData, /createAdminClient/);
  assert.match(companyData, /loadCompanyDocumentContext\(supabase\)/);
});

test("keeps generated transaction documents out of browser and CDN caches", () => {
  assert.match(pdfRoute, /private, no-cache, no-store, must-revalidate/);
});
