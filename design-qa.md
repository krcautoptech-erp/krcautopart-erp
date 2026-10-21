# GR A5 compact layout — design QA

## A4 selected compact ledger implementation

final result: passed

This additional pass covers the production JSX/CSS layout fixture, not authenticated end-to-end PDF delivery.

- Source: `C:/Users/Riew/.codex/generated_images/01a0f862-909b-70e1-a8ec-bccccfbbf050/exec-3b92745e-d1c8-41d2-93c9-656a8b3fb5a4.png` (1054 × 1492 pixels).
- Implementation: `C:/Users/Riew/AppData/Local/Temp/gr-receipt-layout-A4.png` (1588 × 2246 pixels; 794 × 1123 CSS viewport, density 2).
- Full-view comparison: `C:/Users/Riew/AppData/Local/Temp/gr-a4-comparison.png`; both pages normalized to 620 × 877 without distorting their aspect ratios.
- State: A4 portrait, 24 populated lines, supplier/reference information, totals, notes and signatures.
- Typography: reused Sarabun/system document fonts, 9.5pt item descriptions, bold black received quantities, smaller Lot details. Inspected the full-size capture for Thai marks, table labels and signature readability.
- Layout: shared company header retained; borderless supplier/references with a divider, compact gray grid with red top rule, totals, unboxed notes/signatures. First comparison prompted increasing row height to 7.15mm and body size to 9.5pt; the revised comparison shows all 24 rows inside the page.
- Colors: white paper, black content, gray grid, restrained red rules/headings. No red received-quantity emphasis remains.
- Assets: original logo and shared header/footer, not a generated replacement. Header proportions intentionally follow existing configurable company branding, so raster mockup glyphs/logo size are not claimed pixel-identical.
- Content: source mockup total 276 is arithmetically inconsistent with its quantities; the fixture correctly shows 272 for the displayed lines. Real totals always derive from receipt data, separately by unit.
- Behavior: 49 lines paginate 24 / 24 / 1; long names trigger reduced page capacity for both A4 and A5 rather than clipping. Per the subsequent user request, A4 pads missing items with blank rows to preserve the full-height grid; totals count only actual items.
- Remaining gap: authenticated web preview, delivered PDF and physical printer output have not been verified in this pass. No database or receipt data was modified.
- Verification: full lint and final production build passed. Final full test rerun passed 348/348; the preceding concurrent build/test run timed out in the two browser-layout tests at their 15-second limit. No timeout limit was increased to hide this intermittent load-related failure.

---

final result: passed

Scope: the selected eight-item A5 landscape mockup, rendered from the production GR article JSX and stylesheet with representative document data. This result covers layout fixtures, not an authenticated end-to-end GR workflow.

## Visual evidence

- Selected source: `C:/Users/Riew/.codex/generated_images/01a0f862-909b-70e1-a8ec-bccccfbbf050/exec-72f87d8e-fa2b-4449-a986-78d2e7ca06fe.png`
- Implementation screenshot: `C:/Users/Riew/AppData/Local/Temp/gr-a5-eight-rows.png`
- Side-by-side comparison: `C:/Users/Riew/AppData/Local/Temp/gr-a5-comparison.png`
- Both images were compared at a common 760 × 536 display area. The source raster has a slightly different aspect ratio from physical A5; exact pixel equality is not asserted.
- The browser fixture also visibly showed all eight rows, totals, notes and signatures inside the 210 × 148 mm page.

## Review and fixes

- Preserved the shared company header/footer instead of reproducing the raster header as a separate component.
- Matched the borderless supplier/reference sections, six-column grid, black received quantities, total row and three unboxed signatures.
- Corrected the collapsed table's top border so the selected red rule remains visible.
- Retained the shared footer's print timestamp. Actual system font metrics, configurable company branding and real data may differ from the generated mockup.
- No remaining overlap or clipping was observed in the representative eight-row screen/print fixture.

## Behavioral evidence

- Seventeen items paginate as 8 / 8 / 1 without losing items.
- Long descriptions trigger the production font-ready measurement and reduce capacity instead of hiding text.
- Quantity totals keep different units separate.
- If even one item cannot fit A5, printing/export is blocked with a request to use A4.
- All 344 automated tests passed; the four focused GR tests passed again after the final border adjustment.
- Full ESLint and production build passed after the final CSS-only border adjustment.

## Limits

- Authenticated GR preview/print/export could not be exercised: the KRC app on port 3000 requires login, and port 3001 currently serves another project. User login was requested without requesting credentials.
- Physical printer output and unusually large uploaded company logos were not tested on hardware.
- A4 retains its existing layout; this change implements the selected A5 mockup only.


## Delivery schedule mobile filters — 2026-10-21

final result: passed

- Source: C:/Users/Riew/.codex/generated_images/01a15f23-9dd7-7481-80f9-ef0a078177cd/exec-85b22ed9-ea81-4388-901e-2c573dd092f2.png (854 x 1844 raster, nominal 390 x 844 CSS mobile concept).
- User override: preserve shared controls and table; sheet content-sized with maximum half the viewport, footer buttons remain outside its scrollable body.
- Implementation: docs/delivery-schedules/mobile-filter-half-sheet.jpg and mobile-filter-final.jpg (390 x 844 requested CSS viewport; native screenshot density). Source and implementation were opened together in the same comparison input, each scaled proportionally to mobile width; scoped comparison covers filter toolbar and open sheet rather than generated source data.
- Typography: existing Sarabun family, shared label hierarchy, readable secondary monthly-total explanation. Filter badge has explicit 10px type and tabular numeral in a fixed 18 x 18 box.
- Spacing/layout: shared rounded top corners and existing grid controls retained. Open sheet 422px at viewport height 844, 300px at height 600. Footer bottom equals viewport bottom in both states. Only inner body scrolls, measured scrollTop 73px while footer stayed at 844px.
- Colors/assets: existing ERP semantic red, white surface, Lucide icons; no new raster assets. Mobile daily/forecast table headers use white surface as requested; cell geometry retained.
- Content: monthly deliveries > 0 exclude forecasts and out-of-month deliveries. Real October archive reduces 169 parts to 72. Forecast-only and day-window filters remain independent; source order, quantity descending and Part No. sorting available. Real count replaces illustrative 84.
- Interaction checks: open/close, clear, monthly filter, sort, inner-body scroll, uncompressed badge, desktop entry visibility; shared /items sheet also content-sizes to 257px with footer at 844px. No captured browser console errors. 13 relevant tests, lint and production build passed.
- Comparison history: source near-full-screen shared sheet and clipped numeric badge were corrected; post-fix screenshots and geometry above confirm the requested changes. Extra existing customer/section/display-Forecast controls remain below the fold inside the scrollable body to preserve functionality.
- Residual gap: no repeat physical iPad/Safari or Android touch run in this change; responsive browser checks do not certify hardware scroll physics.
