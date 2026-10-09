# Opening stock design QA — 2026-10-08

Status: PASS for selected import-editor visual changes; BLOCKED for full database workflow sign-off. Not claimed pixel-perfect.

Reference: codex-clipboard-54d5d16d-06ae-48e3-92df-346eb725568f.png, preserving actual KRC shell.

Latest comparison: desktop 1488×1056, mobile 390×844. Evidence: output/opening-stock/desktop.jpg and mobile.jpg. Reused DataTable/DataTableFrame and Pagination. White inputs, neutral borders, Excel artwork, separate uploaded-file strip, four summary metrics, compact table and error text under status. Desktop footer no longer overlays pagination. Mobile uses expandable product/Lot groups; document width and scroll width both 384px.

Intentional differences: real company navigation remains unchanged; migration safety warning and disabled save/review remain visible. Real calculation gives 2 products and ฿18,150.00 for fixture rows, not the inconsistent example figures. Mobile sticky footer appears midway in full-page capture because it follows the viewport; normal scrolling retains access to the rows.

Verified authenticated editor at localhost:3001, desktop 1440×1000 and mobile 390×844: shared item picker, full product names, grouped expandable Lots, adding multiple Lots, validation, calculated value, draft recovery. Mobile document width 384px equals scroll width 384px (no horizontal overflow).

Database used by app has not applied opening-stock migration. Save/review/post/reversal screens and populated register drawer cannot be verified against real application data yet. No production stock was changed for visual testing.

Remaining: compare populated register and immutable document states against references after user runs migration; real mobile keyboard and touch verification. Local fixture SQL checks are separate functional evidence, not visual sign-off.

## Shared mobile document forms — selected option 3

Source visual truth: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-a95b184f-6bef-41df-a740-78e4d0402272.png` (853 × 1844 pixels).

Implementation evidence directory: `C:/Users/Riew/.codex/visualizations/2026/10/01/01a0f862-909b-70e1-a8ec-bccccfbbf050/`.
Captures: `pr-shared-mobile.jpg`, `pr-shared-desktop.jpg`, `po-shared-mobile.jpg`, `gr-shared-mobile.jpg`, `issue-shared-mobile.jpg`, `pr-shared-dark.jpg`, `adjustment-shared-dark.jpg`.

Comparison: source and final PR capture opened together in one tool result. Requested viewport 393 × 852, observed CSS viewport 394 × 852; implementation JPEG is 393 × 852 pixels (verified from the saved file), approximately 1 screenshot pixel per CSS pixel. Source evaluated at 853/393 = 2.17 source pixels per comparison pixel. Same light theme, item tab, RM002 quantity 1 and RM003 quantity 3, with the same second-row note. The source is a design image, not evidence of a particular browser font or native select implementation.

Fidelity surfaces:

- Typography: retained KRC font and brand assets; full product names, 16px entry text and inputs, strong code hierarchy. No ellipsis in product names. Existing draft-safety status is intentionally retained above tabs.
- Rhythm: thin neutral-bordered white cards, paired quantity/unit, label above full-width note, compact tools, collapsible purpose and fixed footer. Small differences in logo/card padding are P3 refinements; no blocking layout drift in the selected pattern.
- Colors: white light-mode fields/cards, filled red type badge, red actions and active tab. Dark-mode surfaces use system tokens with lighter red action labels.
- Assets: reused actual company logo and installed icon library; no approximated brand artwork.
- Copy/content: actual product codes/names and database units retained. Units are read-only rather than the mock's dropdown because these document lines do not authorize unit changes. GR Lot controls, PO source-PR references, costs, permissions and issue allocations remain intact.

Comparison history:

1. Initial PO browser capture showed desktop 52px cell heights producing excess gaps and overlapping price hints (P2). Removed those heights only on mobile. Revised `po-shared-mobile.jpg` shows correctly sized header, reference, paired values and unobscured price hints.
2. Initial GR capture showed a squeezed unit field and redundant desktop instructions (P2). Stretched the paired unit field and hid the desktop-only instruction heading on mobile. Revised `gr-shared-mobile.jpg` preserves both quantity and Lot controls.
3. Initial issue capture showed disabled print/next actions using footer space (P2). Hid unavailable actions only on mobile and paired cancel/save; revised issue capture verifies the footer.
4. Initial adjustment dark capture showed a desktop width rule leaving side gaps (P2). Added a mobile-specific width override; revised dark capture verifies the full-width surface.
5. Final PR reference/capture comparison: white cards, paired fields, note label on its own line, tools and footer verified after fixes.

Interactions checked: PR multi-item selection, quantity/note edits, tab round-trip retaining quantity 3, search filtering, purpose expansion, local draft recovery; PO approved-PR selection and four-item addition; GR PO selection and review; issue warehouse context and item selection; adjustment document/items tabs and empty state. Desktop PR remains a table and hides mobile navigation. At 320px, browser assertions verified no document/button overflow and retained quantity. Browser console error list was empty at the final PR capture.

Code verification: 320 tests passed, TypeScript check and targeted ESLint passed. No document submitted, no stock posted or deleted during UI checks.

Remaining: physical iPhone/iPad keyboard, Safari touch/scroll calibration and committed-document transaction tests were not run. Other non-document forms have not been forcibly converted; the reusable components are available to their appropriate callers. Prior opening-stock database blockers above are unchanged.

final result: passed
