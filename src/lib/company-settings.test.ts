import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COMPANY_BRANDING, DEFAULT_DOCUMENT_SETTINGS, getDocumentBranding } from "./company-settings.ts";

test("changing system light and dark logos leaves the document logo independent", () => {
  const context = {
    branding: { ...DEFAULT_COMPANY_BRANDING, logoLightUrl: "/ui-new.png", logoDarkUrl: "/ui-dark-new.png" },
    documentSettings: { ...DEFAULT_DOCUMENT_SETTINGS, documentLogoUrl: "/document-only.png" },
  };
  assert.equal(getDocumentBranding(context).logoLightUrl, "/document-only.png");
  assert.equal(context.branding.logoLightUrl, "/ui-new.png");
});

test("the default document logo does not follow newly uploaded system branding", () => {
  assert.equal(getDocumentBranding({ branding: { ...DEFAULT_COMPANY_BRANDING, logoLightUrl: "/ui-new.png" }, documentSettings: DEFAULT_DOCUMENT_SETTINGS }).logoLightUrl, "/logo/origin-clean.png");
});

test("historic document contexts without the new setting retain their captured logo", () => {
  const { documentLogoUrl: _oldField, ...oldSettings } = DEFAULT_DOCUMENT_SETTINGS;
  assert.equal(getDocumentBranding({ branding: { ...DEFAULT_COMPANY_BRANDING, logoLightUrl: "/historic.png" }, documentSettings: oldSettings }).logoLightUrl, "/historic.png");
});
