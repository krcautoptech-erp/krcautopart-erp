# Design QA — Compact Notification Bell — 2026-10-04

- Source visual truth path: `C:/Users/Riew/.codex/generated_images/01a0f862-909b-70e1-a8ec-bccccfbbf050/exec-cafb2efe-f775-46b2-a4df-d39f6e66b245.png`.
- Source state: light-theme desktop header with the notification popover open.
- Implementation route: any authenticated dashboard route with the shared notification bell.
- Implementation screenshot path: unavailable because the Codex in-app Browser failed before opening the authenticated tab with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`.

## Comparison evidence and implementation

- The compact popover now follows the selected structure: title and unread badge, mark-all action, all/unread tabs, up to seven dense rows, type-specific unboxed outline icons, unread dot and pale row state, right-aligned time, and one full-inbox footer link.
- An urgency chip is rendered only when real notification text contains an overdue or urgent signal; it is not used as a general category badge.
- Client state now overlays locally-read IDs on current server props, so real-time refreshes can add new unread notifications without being incorrectly hidden by an earlier mark-all action.
- The former expanded push-notification settings block was removed from the popover to preserve the selected compact footprint.

## Required fidelity surfaces

- Fonts and typography: shared self-hosted Sarabun stack with compact 10–18 px hierarchy; rendered comparison blocked.
- Spacing and layout: 400 px desktop popover, 56 px header, 40 px tabs, 76 px minimum rows, and a 460 px scroll region; rendered comparison blocked.
- Colors/tokens: shared KRC primary, surface, outline, and secondary tokens.
- Assets/icons: existing Material Symbols are used by notification type; no raster asset is required.
- Copy/content: real notification title, message, read state, type, and timestamp are retained.

## Verification

- Notification regression tests: 5/5 passed.
- Targeted ESLint, TypeScript, and Next.js 16.3.5 production build: passed.
- Browser interaction, responsive capture, and console checks: blocked before tab creation.

final result: blocked

---

# Design QA — Notification Inbox Fidelity — 2026-10-04

- Source visual truth path: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-f9d942fe-67a7-44e1-97fa-e46f5b2079fd.png`.
- Source pixels: 1488 × 1056; intended desktop state with the 208 px application sidebar expanded.
- Implementation route: `http://localhost:3000/notifications`.
- Implementation screenshot path: unavailable because both the authenticated Codex in-app Browser and the permitted Chrome fallback failed before opening a tab with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`.
- State: light theme, populated notification inbox, desktop.

## Full-view and focused comparison evidence

- The user-supplied pre-fix implementation capture was opened together with the selected source. It showed missing table headers, no related-document column, boxed icons, oversized empty row space, and page content scrolled beneath the fixed shell.
- The implementation now follows the source hierarchy in code: breadcrumb/title/subtitle, compact filter row, all/unread segmented state, type and date filters, mark-read action, desktop column header, date groups, selection/unread state, outline event icon, title/message, extracted document number, type, date/time, action, and integrated pagination.
- Focused browser-rendered post-fix evidence is unavailable due to the browser kernel failure, so typography, exact spacing, visible shell position, and final pixel fidelity cannot be certified.

## Required fidelity surfaces

- Fonts and typography: existing self-hosted Sarabun stack and explicit compact sizes/line heights are retained; rendered comparison is blocked.
- Spacing and layout rhythm: desktop tracks and 78 px minimum rows were rewritten to match the source density; rendered comparison is blocked.
- Colors/tokens: existing KRC primary, surface, secondary, and outline tokens are reused.
- Image quality and assets: the page requires no raster assets; icons use the product's installed Material Symbols/Lucide sets.
- Copy/content: source hierarchy and labels are present; document numbers are extracted from real notification copy rather than mocked.

## Findings and comparison history

- Pass 1 P1 fixed in code: the implementation was a loose list rather than the source's structured inbox table. Added the complete column and grouping structure.
- Pass 1 P1 fixed in code: filter navigation could return new server data while client state continued to display the initial rows. Rows now derive from current server props with a separate optimistic read overlay.
- Pass 1 P2 fixed in code: event icons used gray tiles and document references were mixed into titles. Icons now use the source's unboxed outline treatment and references have their own column.
- Post-fix visual evidence: blocked by the browser kernel failure described above.

## Verification

- Notification regression tests: 5/5 passed.
- Targeted ESLint: passed.
- TypeScript and Next.js 16.3.5 production build: passed.
- Browser interaction and console checks: blocked before tab creation.

final result: blocked

---

# Design QA — Pending Receipts Mobile Cards and Report Actions — 2026-10-04

- Source visual truth path: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-ee7bd2e4-2b4f-4eef-b88e-fab8d53fbf46.png`.
- Source pixels: 468 × 955. Implementation CSS viewport: 468 × 955 at device scale 1.
- Implementation evidence: authenticated Codex in-app Browser capture of `http://localhost:3000/reports/purchase/pending-receipts`; the browser emitted the screenshot in-tool and does not expose a persistent screenshot file path.
- State: light theme, first result page, filters closed, export menu checked separately, populated report data.

## Comparison evidence

- Full view: the mobile-only desktop table and horizontal overflow in the source were replaced by the existing ERP mobile document-card pattern. The report title, search/filter controls, status, PO number, product, vendor, and delivery date retain the same information hierarchy without forcing horizontal scrolling.
- Focused card region: long product and vendor text receives up to two complete lines with clipping rather than ellipsis; PO number and status remain immediately scannable.
- Focused interaction region: tapping a card opens the standard bottom sheet with all quantities, pending value, buyer, contact, latest receipt, and a direct PO action. The shared Export bottom sheet contains Excel/PDF/Print actions appropriate to each report.
- Typography: existing self-hosted Sarabun weights and line heights are preserved. No Thai marks are clipped in the inspected card and bottom-sheet states.
- Spacing/layout: mobile card rows follow the PR/PO ledger rhythm; 390 px, 468 px, and 768 px portrait widths have no document overflow. Desktop keeps the full report table.
- Colors/tokens: existing surface, outline, primary, secondary, and shared status-badge tokens are reused. No new palette was introduced.
- Images/assets: no new raster assets are required; all actions use the installed Lucide icon family already used by the reports.
- Copy/content: report labels and operational values remain unchanged; mobile reorganizes rather than removes detail.

## Findings

- No actionable P0/P1/P2 mismatch remains.
- P3: very long vendor metadata is intentionally limited to two lines in the list; complete text remains available in the detail bottom sheet.

## Verification

- Mobile interaction: card → detail bottom sheet → PO action verified.
- Mobile action interaction: Export → Excel/print menu verified.
- All four operational reports: zero visible desktop tables at 390 px and one shared mobile export trigger each.
- iPad portrait 768 × 1024: card view, zero visible tables, and no horizontal overflow.
- Desktop 1440 × 900: one visible table, desktop Excel action visible, mobile Export action hidden.
- Browser console warnings/errors: none.
- Automated tests: 238/238 passed. Next.js 16.3.5 production build and TypeScript passed.

final result: passed

---

# Design QA — Report typography and shared mobile filters — 2026-10-04

- Source visual truth paths: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-df7b625c-9c38-4707-8417-74392c2030ca.png` and `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-dba46434-3351-4621-a183-052d44824ad9.png`.
- Root cause evidence: generated `next/font/local` rules referenced font files through relative `../media/` URLs. In stale nested report navigation those URLs resolved as `/reports/media/...`, returned 404, and forced an inconsistent fallback font. Two-line report labels also used an exact clipping height that did not reserve enough room for Thai vowels and tone marks.
- The application now has one self-hosted Thai-first `Sarabun` family loaded from root-absolute `/fonts/...` URLs at real weights 400, 500, 600, and 700. Generated route-relative Inter font assets were removed from the application shell.
- Two-line chart and legend labels reserve vertical padding and a 1.55 line height while keeping the required two-line maximum without ellipsis.
- Purchase analysis, pending receipts, stock movement, and stock issue reports now share the same `MobileListFilters` bottom sheet, active-filter count, clear action, and apply action. Desktop toolbars remain visible from 901 px upward.
- Browser verification was completed at 390 × 844, 768 × 1024, and 1440 × 900 CSS px. All four report routes exposed exactly one shared mobile filter trigger at compact widths, while desktop exposed the inline date controls and hid the mobile trigger.
- At 390 px and 768 px, document width matched viewport width. `document.fonts.check()` confirmed Sarabun was ready, and browser logs contained no font, media, 404, or failed-load error.

## Verification

- Typography and report-workspace regression tests: 10/10 passed.
- Full automated test suite: 236/236 passed.
- ESLint and Next.js 16.3.5 production build including TypeScript: passed.

final result: passed

---

# Design QA — Shared ERP list filters and Service Worker — 2026-10-03

- Source visual truth paths: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-9ac5c204-116c-4632-8533-f67387b61025.png`, `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-749e1879-91a7-41ac-8ff8-5b597283bf8a.png`, `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-b6bd2f64-f8a0-491d-8ad7-842607bea574.png`, `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-8b413bd2-7c1e-407f-b5b1-3472e90d1005.png`, and `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-28595b7e-996f-4cf7-8248-5b8ec1924452.png`.
- Rendered implementation evidence: authenticated Codex in-app Browser captures of `/purchase/pr`, `/purchase/po`, `/purchase/receipts`, `/inventory/issues`, and `/inventory/stock-counts` in Neutral Carbon dark mode.
- Verified viewport: 1224 × 664 CSS px at device scale 1 with the 208 px ERP sidebar expanded.

## Comparison evidence and fixes

- Search, floating-label select, combined date range, primary search action, clear action, and mobile filter sheet now come from the shared `list-filters` component contract.
- PR, PO, GR, stock issue, stock count, stock adjustment, asset catalog, raw-material catalog, pending-receipt report, and Audit Log use those shared controls rather than page-local filter markup.
- All controls use the same 38 px height, 4 px radius, Lucide icon family, neutral theme surface, shared typography, and thin primary border only for active/focused filters.
- Native select menus and date controls inherit the application dark color scheme. No white dropdown surface or light-only date icon remains in the verified dark views.
- At the 1224 px verification width, stock-count filters reflow to two rows before the two-date control becomes too narrow; both dates remain fully readable on one line.
- Mobile behavior stays in the existing shared bottom-sheet filter flow. The active browser surface did not expose viewport resizing in this pass; responsive component and production-build checks passed, but no new mobile raster was captured.
- Service Worker static responses are cloned synchronously before asynchronous cache access, removing the `Response body is already used` failure. A regression test protects the ordering.

## Verification

- Browser dark-mode render: passed for PR, PO, GR, stock issue, and stock count.
- Full automated test suite: 221/221 passed.
- ESLint, TypeScript, and Next.js production build: passed.
- No actionable P0/P1/P2 desktop mismatch remains for the shared-filter surfaces verified above.

final result: passed

---

# Design QA — Purchase Analysis on iPad Mini Portrait — 2026-10-03

- Source visual truth paths: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-7c0fec46-5f8c-481d-bebc-78369ec6eeb6.png` and `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-c4d2a598-1943-4415-98f4-27cd682d82ee.png`.
- Source viewport: iPad Mini portrait, approximately 768 × 1024 CSS px.
- Rendered implementation evidence: authenticated Codex in-app Browser capture of `http://localhost:3000/reports/purchase/purchase-analysis` at exactly 768 × 1024 CSS px. The browser emitted the capture in-tool and does not expose a persistent screenshot path.
- State checked: report selector closed and open, date range, KPI grid, empty-result detail state, pagination, and mobile report Bottom Sheet.

## Findings and fixes

- P1: the 768 px iPad Mini width fell one pixel outside the former 767 px mobile breakpoint, leaving a 48 px desktop report rail and reducing the report canvas enough to clip dates, KPI amounts, chart values, and the desktop detail table.
- The report workspace and purchase-analysis compact layout now activate through 900 px. Portrait tablets therefore use the full-width report canvas and the same report Bottom Sheet as mobile, while wider landscape and desktop layouts retain the secondary report rail.
- KPI cards render as a two-column grid, analytical panels stack vertically, and detailed rows switch to the mobile card presentation at portrait-tablet widths.
- The date range keeps both dates on one line and secondary filters remain behind the compact filter action.
- At 768 × 1024, measured document and body widths are both exactly 768 px. No visible page or component has horizontal overflow; the only element with an intentional scroll-width difference is the one-pixel accessibility-only report-view legend.
- The report Bottom Sheet shows all four report names and the active state without icon-only entries.

## Verification

- Browser console warnings/errors: none.
- Targeted responsive regression tests: 22/22 passed.
- Full automated test suite: 232/232 passed.
- Next.js production build and TypeScript stage: passed.

final result: passed

---

# Design QA — Collapsible Report Workspace — 2026-10-03

- Source visual truth path: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-b03ece4d-0683-4321-b04d-cae1f2cc9feb.png`.
- Source pixels: 1536 × 1024 composite desktop/mobile reference.
- Rendered implementation evidence: authenticated Codex in-app Browser captures of `http://localhost:3000/reports/purchase/purchase-analysis`.
- Implementation viewports: 1280 × 720 desktop and 390 × 844 mobile at device scale 1.
- States: desktop report navigation expanded and collapsed; mobile report chooser closed and open; live light-theme application shell.

## Full-view comparison evidence

- Reports now open directly into an analytical report instead of an intermediate catalog page.
- Desktop has a compact report rail that can expand to show grouped report names or collapse to a 48 px icon rail. The active report uses the shared KRC red accent.
- Mobile replaces the rail with a compact report selector and a bottom sheet containing the same grouped reports and active state.
- The purchase report follows the selected hierarchy: filters, KPI summary, analysis region, and detailed table, while retaining the existing ERP shell and real permissions/data.

## Table and responsive evidence

- Ordinary columns stay on one line and use `text-overflow: clip`; no table cell uses ellipsis.
- Designated long-content cells wrap naturally and are capped at two full lines without `...`.
- The table uses natural content width inside its own scroll frame rather than stretching columns to consume empty space.
- At 1280 px, expanded and collapsed report navigation states have no page-level horizontal overflow. Filters use a container-aware two-row layout when the expanded rail reduces the available content width.
- At 390 × 844, the page has no horizontal overflow and the report chooser exposes every report label rather than icon-only entries.

## Findings and comparison history

- Pass 1 P1: a persisted collapsed desktop state also hid labels inside the mobile report sheet. Added mobile-scoped label overrides and verified the complete list in the rendered dialog.
- Pass 2 P1: live purchase rows reused database group identifiers as React keys, producing duplicate-key console errors. Keys now include group, code, and row position; a fresh browser tab has no errors or warnings.
- Pass 3 P1: expanding the report rail at a 1280 px viewport pushed the Excel and A4 actions beyond the page. Added container-aware filter layout and reduced desktop control minimums; post-fix page width is 1274 px within a 1280 px viewport.
- No actionable P0, P1, or P2 visual or interaction difference remains for the requested report navigation, compact density, and table wrapping behavior.

## Verification

- Desktop report rail expand/collapse: passed.
- Mobile report bottom sheet and navigation labels: passed.
- Page-level horizontal overflow at desktop collapsed, desktop expanded, and mobile: none.
- Browser console errors/warnings in a fresh tab: none.
- Targeted regression tests, full test suite, ESLint, and production build: passed.

final result: passed

---

# Design QA — Shared ERP report filters — 2026-10-03

- Source visual truth: the production PR/PO list filter bar selected by the user as the system-wide control standard.
- Pages verified: `/reports`, `/reports/inventory/stock-issues`, `/reports/inventory/stock-movements`, and `/reports/purchase/purchase-analysis`.
- Viewports: default desktop/tablet viewport and 390 × 844 mobile.
- Theme: dark mode, authenticated ERP session.

## Full-view comparison evidence

- Search, floating-label selects, date ranges, primary search actions, border radius, 38px control height, icons, and active red borders now come from the shared `list-filters` components used by the operational lists.
- Legacy report CSS no longer paints a second border or overrides the shared inputs and selects.
- At the medium breakpoint the purchase-analysis date range spans two grid columns, keeping both dates fully readable on one line.
- On mobile, the date range remains visible beside one filter action; secondary filters collapse into the existing compact workflow without horizontal overflow.
- The report center now uses the same shared search and floating-label category select.

## Verification

- Keyboard-readable labels and native date/select semantics: passed.
- Dark native date/select palette: passed.
- Responsive 390 × 844 layout: passed.
- Targeted ESLint, TypeScript, and shared-filter regression tests: passed.

final result: passed

---

# Design QA — App Shell logo and profile cleanup — 2026-10-03

- Source visual truth path: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-0a040e98-cf81-4c7a-9e1c-975127f726ee.png` (209 × 888 px sidebar crop) and the user-requested removal of the top profile image.
- Implementation screenshot path: authenticated Codex in-app Browser capture of `http://localhost:3000/inventory/stock-counts`; the browser emitted the capture in-tool and does not expose a persistent screenshot path.
- Implementation pixels/CSS viewport: 1242 × 764 at device scale 1; comparison focused on the 208 px application sidebar and top-right account area.
- State: desktop, light theme, expanded sidebar.

## Evidence and findings

- Full view: navigation order, spacing, colors, typography, footer settings/logout actions, and shared shell behavior remain unchanged.
- Focused sidebar: the legal company logo is centered at x=104 within the 208 px sidebar (measured center delta 0 px); the secondary copy “ระบบจัดการทรัพยากร” is absent.
- Focused account area: username and ERP context remain visible and clickable; the remote circular profile image is absent.
- Fonts/colors/assets: existing Sarabun stack, shared tokens, legal logo asset, and icon set are retained without replacements or quality loss.
- No actionable P0/P1/P2 differences remain for the requested edit.

## Verification

- Browser console errors/warnings: none observed.
- Targeted ESLint, production build, TypeScript, and whitespace validation: passed.

final result: passed

---

# Design QA — ERP Overview Dashboard — 2026-10-03

- Source visual truth path: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-f4f1d350-a23a-44d3-a90e-f5f4131d4645.png`, with focused comparison references `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-e0dd2f51-9db5-4a0a-a733-d3025b47ee64.png` and `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-22fead97-6011-4d2c-9d61-931d377d3c29.png`.
- Source pixels: 944 × 1664, normalized by matching the application content width and section proportions rather than browser chrome.
- Rendered implementation evidence: authenticated Codex in-app Browser capture at `http://localhost:3000/workspace`.
- Desktop implementation capture: 1274 × 717 CSS viewport; mobile implementation capture: 390 × 844 CSS viewport; device scale factor 1.
- States: authenticated owner, real database data, light theme; mobile light and Neutral Carbon dark theme.

## Full-view comparison evidence

- Information architecture matches the source: compact filter header, six KPI cards, two-chart row, PO fulfillment summary and table, three operational summaries, work queue, and recent activity.
- Desktop density, thin neutral borders, red KRC accents, flat table headers, sidebar shell, and long vertical dashboard rhythm reproduce the target.
- Mobile preserves the same content order, changes multi-column grids to a single column, and gives dense KPI/chart/table regions bounded horizontal scrolling so data remains readable without overlapping adjacent sections.

## Focused region comparison evidence

- Typography uses the system's shared Sarabun stack with the same compact title/body hierarchy; long live item names remain inside their cells.
- Colors map to existing ERP theme tokens and semantic red/amber/green states; dark mode uses the shared Neutral Carbon tokens rather than a separate black theme.
- The company logo and Material Symbols come from the existing application shell; no mockup asset was replaced with handcrafted artwork.
- Fixed copy matches the selected mockup. Dynamic numbers and rows intentionally come from the connected PO, GR, central stock, stock count, work, permission, and audit data.

## Findings and comparison history

- Pass 1 P2: low-stock rows rendered blank because the central-stock RPC returns snake_case keys while the first mapper expected camelCase. Fixed the mapper to use `item_code`, `item_name`, `available_qty`, `reorder_point`, and unit fields; post-fix browser evidence shows RM054 with its full name, balance, threshold, and unit.
- Pass 1 P2: the former `/workspace` app-shell placeholder prevented the real dashboard page from rendering. Removed the placeholder branch and changed the root redirect to `/workspace`.
- Data-correctness follow-up: `อัตราส่งตรงเวลา` now reuses the existing purchase-analysis RPC, so the KPI follows actual receipt-versus-delivery-date semantics instead of inferring from PO status.
- Pass 2 P1: borders inherited the KRC primary/red outline token, KPI icons sat inside filled circles, typography was too large, and the movement chart showed isolated dots instead of connected series. This made every panel look like an alert and visibly diverged from the selected mockup.
- Pass 2 fixes: dashboard-only borders now use neutral 13% foreground lines, chart grids use a lighter neutral token, KPI icons are larger unfilled outline symbols, title/table/control typography and spacing are more compact, bars include value labels, and stock movement uses connected red/orange/green series with the mockup's circle/square/triangle markers.
- Pass 3 post-fix evidence: authenticated full-page browser capture at 1440 × 1000 CSS px shows the six-card row, paired chart panels, compact fulfillment block, three-column operational summaries, work table, and activity table with neutral borders and the intended density. The 390 × 844 light and dark captures have no page-level horizontal overflow; only the intentionally scrollable dense KPI/chart/table regions extend horizontally.
- Pass 3 required fidelity surfaces: shared Inter/Sarabun typography remains legible at compact sizes; spacing and radii match the flat ERP rhythm; red is limited to KRC accents and semantic actions; the legal logo and Material Symbols remain native assets; fixed copy matches the mockup while values remain live system data. No actionable P0/P1/P2 mismatch remains.
- Pass 4 P1: KPI labels/values, chart axes, chart legends, and operational tables were still visibly smaller than the focused mockup; the movement chart had no readable Y-axis values; fulfillment action columns could compress at desktop width; the as-of date was read-only; unavailable permission domains still rendered as zero-value shells.
- Pass 4 fixes: KPI type is now 12/21 px, chart/table type is 10–12 px, both charts expose five Y-axis ticks and clear month labels, movement ticks use integer-friendly scaling, the fulfillment table uses fixed proportional columns, and mobile chart height preserves labels without overlap. The date control now updates the URL and reloads cutoff-bounded PO, GR, movement, count, and audit data. Purchase, inventory, count, and audit regions are conditionally rendered from the existing permission codes.
- Pass 5 post-fix evidence: desktop browser capture at 1440 × 1000 with `asOf=2026-09-30` shows six readable KPI cards, labelled axes, the populated four-state summary, proportional stack, and complete PO rows/actions. The formerly overflowing received-rate value is normalized from database ratio `0.107…` to `11%`. Mobile 390 × 844 light/dark captures show no page-level overflow and no axis/legend collision.
- Pass 6 consistency fix: every table status column now renders through the shared system `StatusBadge` component. PO fulfillment, latest count variances, and work-queue statuses no longer maintain dashboard-only badge borders, colors, sizing, or dark-mode rules.

## Interaction and implementation checks

- Work-queue tabs: passed.
- Document drill-down links and permission-gated audit section: passed.
- Mobile horizontal regions and page vertical scrolling: passed.
- Dark/light theme: passed.
- Console errors/warnings: none observed.
- Browser implementation evidence: in-app browser tab 1 capture of `http://localhost:3000/workspace` (the browser emitted the full-page and focused captures in-tool and does not expose a persistent filesystem path).
- Viewports/density: source 944 × 1664 px; implementation desktop 1440 × 1000 CSS px and mobile 390 × 844 CSS px at device scale 1. Layout proportions were normalized to the application content region because the source is a scaled design board rather than a raw browser viewport.
- Primary interactions tested: work-queue tab switching, document links, responsive scrolling, and light/dark theme toggle.
- As-of date interaction: passed; selecting 30/09/2026 navigated to `/workspace?asOf=2026-09-30`, loaded 22 visible table rows across the dashboard, and retained the chosen date.
- Permission behavior: owner browser state verified; non-owner visual impersonation was not available, but server queries and rendered purchase/inventory/count/audit sections are gated by their existing permission-code booleans.
- Dashboard logic test, targeted ESLint, TypeScript, and Next.js production build: passed.

final result: passed

---

# Central Inventory Stock Design QA

- Source visual truth: `C:\Users\Riew\AppData\Local\Temp\codex-clipboard-19785e64-dec2-4e0f-ab80-29cc7d9054d5.png`
- Implementation route: `http://localhost:3000/inventory/stock`
- Source pixels: 1536 × 1024 (desktop and mobile composite)
- Verified viewport: authenticated in-app browser, 1286 × 912 CSS px at device scale 1 with the ERP sidebar open
- Implementation screenshot: captured and emitted from the authenticated in-app browser during this task; the browser integration does not expose a persistent screenshot path
- State verified: stock list, low-stock RM054 row, Lot and overview panels, light mode, and dark mode

## Visual comparison

- Header now follows the mockup hierarchy: KRC ERP mark, page title/subtitle, Gregorian Thai date/time, refresh and outlined Excel export actions.
- KPI summary now matches the compact bordered strip: five evenly divided metrics, inset dividers, 76 px desktop height, 58 px mobile height, and no permanently selected first card.
- Search and filters now use neutral-gray borders, compact 40 px height, balanced desktop proportions, and theme-aware surfaces. Each filter label is a true floating label centered over the top border, with its surface-colored backing masking the line exactly like the selected mockup.
- The product name/detail column has the largest table allocation (28%). Names wrap naturally, remain fully visible, and do not use truncation or ellipsis.
- Lower-value columns were reduced proportionally while numeric columns remain aligned and readable.
- Duplicate Warehouse and Details tabs were removed. The concise tab set is now Overview, Lot/Serial when applicable, and Stock Card.
- Expanded Lot content contains only the lot ledger; reorder point and configured item-type data live in Overview and are not repeated.
- Available quantity follows the computed stock state: low-stock RM054 renders amber rather than the previous hard-coded green.
- The shared status badge and pagination/table styling remain consistent with the rest of the ERP.
- Refresh and Excel buttons now use the correct outlined hierarchy and theme-aware foreground/background colors.
- Hard-coded white surfaces were removed from this screen, including filters, KPI strip, mobile list, expanded row, and action buttons.

## Interaction and error checks

- Expanding RM054 loads the Lot ledger successfully and exposes only Overview, Lot, and Stock Card.
- The previous inventory-details relationship error did not recur.
- The browser log contains historical hot-reload errors from an earlier intermediate edit, but no new runtime error occurred after the final reload and interaction pass.
- Dark-mode toggle was exercised in the authenticated browser; KPI labels, values, filters, buttons, rows, and borders remain visible with no white control blocks.
- Mobile rendering remains driven by the existing dedicated `md:hidden` card layout; the active in-app browser surface does not provide viewport emulation.

## Comparison history

- Pass 1: KPI first segment appeared active, dropdowns used one-line native presentation, and hard-coded white surfaces caused broken dark mode.
- Fix: removed the default active KPI fill, introduced a two-line `FilterSelect`, replaced white surfaces with system surface tokens, and added dark-mode semantic contrast colors.
- Pass 2: light and dark browser captures show the KPI, dropdowns, refresh/export actions, and expanded Lot panel using the intended hierarchy.
- Pass 3: neutralized filter borders, removed duplicate detail surfaces, and verified low-stock quantity and badge are both amber. No P0/P1/P2 visual defects remain at the verified viewport.

## Automated verification

- TypeScript: passed (`npx tsc --noEmit`)
- ESLint: passed for the updated stock dashboard component
- Central stock tests: 4/4 passed
- Git whitespace validation: passed

## Shared Excel export action QA

- Source visual truth: the authenticated `/items` page, using its existing Excel export action as the canonical design.
- A single reusable `ExcelExportButton` now owns the icon, 40 px height, 3 px radius, border, spacing, typography, hover, disabled, and loading states.
- All list and settings pages that expose the action labelled `ส่งออก Excel` now call the shared component; the Excel import action in the PO editor remains intentionally separate.
- Verified in the authenticated `/items` and `/inventory/stock` pages. The stock action visually matches the source action in both light and dark modes.
- TypeScript, targeted ESLint, and whitespace validation passed after the shared-component migration.

final result: passed

---

# Design QA — Neutral Carbon Dark Mode — 2026-10-03

- Source visual truth path: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-910b2f03-0683-4d91-878c-5b3c41b0753b.png` (1536 × 867 px) plus the approved Neutral Carbon palette.
- Implementation screenshot path: authenticated Codex in-app Browser captures of `/inventory/stock-counts`, `/inventory/stock-counts/new`, and `/inventory/stock-counts/1`; the browser emitted the captures in-tool and does not expose persistent screenshot paths.
- Viewports: 1280 × 720 CSS px for list/create and 1242 × 764 CSS px for detail, device scale 1.
- State: dark theme, approved Stock Count round, empty create form, and variance-summary tab.

## Full-view and focused comparison evidence

- The application shell and Stock Count work areas now use a neutral carbon hierarchy: `#18191B` page, `#1C1D20` shell/table heads, `#222428` document surfaces, `#292B30` controls, and `#3A3D43` borders.
- KRC red is limited to primary actions, active navigation, progress, and emphasis; form and table containers no longer use red outlines.
- Primary text is `#F2F4F7` and secondary text is `#AEB4BE`; labels, table headings, metadata, tabs, and disabled/empty states remain readable.
- Semantic success/warning/variance surfaces use dark-compatible tinted backgrounds instead of light-mode fills. The approval notice is readable and the former Cut-off Snapshot notice is absent.
- The list keeps its intentional horizontal table scroll at the narrower desktop width so one-line business fields are not truncated; the page itself has no horizontal overflow. Create and detail have no page overflow.
- The existing KRC logo, Sarabun typography, icon set, copy, and central form/table patterns are retained. Print styling remains light for A4 output.

## Comparison history

- Pass 1 P1: near-black red-tinted surfaces merged the sidebar, page, cards, and tables into one visual plane. Fixed by replacing the central dark tokens with the approved neutral carbon scale.
- Pass 1 P2: Stock Count semantic banners, selected rows, and badges retained hard-coded light fills. Fixed with theme-aware token mixes and explicit foreground colors.
- Pass 2: list, create, and detail captures show no white surface leaks, red container borders, page overflow, or actionable P0/P1/P2 mismatch.

## Interaction and technical checks

- Primary routes rendered successfully in the authenticated browser.
- Browser console errors/warnings: 0 on all three routes.
- Production build and TypeScript: passed.
- Git whitespace validation for the changed theme files: passed.

final result: passed

---

# Design QA — Stock Count mockup fidelity refresh — 2026-10-02

- Source visual truth: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-d88029b9-77d3-437e-a81f-333229ecb1d3.png` (1448 × 1086 composite board) and `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-edb4a748-db8c-45fc-82f7-dd9708293ed5.png` (current A4 output).
- Browser-rendered implementation: authenticated Codex in-app Browser at `/inventory/stock-counts`, `/inventory/stock-counts/new`, and `/inventory/stock-counts/1`.
- Verified viewport: 1236 × 764 CSS px, device scale 1, light theme.
- Implementation screenshots: captured and emitted from the in-app Browser; that surface did not expose a persistent file path.
- States verified: registry with live approved round, create form empty and selected-scope picker, count-detail tab, variance-summary tab, and live shell integration.

## Full-view and focused evidence

- Registry matches the approved compact hierarchy: title, one bordered filter band, dense table, progress, status, and pagination with no horizontal overflow.
- Create matches the four-column desktop form, bordered group header, notes row, selected-product table, compact footer actions, and explicit choose-products mode.
- Count detail matches the compact title/status/progress header, five metadata columns, four tabs, grouped Lot table, and bottom action bar.
- Variance matches the cut-off snapshot notice and one dense result table; the non-mockup summary cards were removed.
- Typography uses the existing Sarabun product stack; spacing is 5–14 px and control heights are 28–38 px; colors use the existing KRC red, surface, outline, and semantic status tokens.
- The existing KRC logo asset is reused. The Blind Count print header now uses the saved legal Thai and English company names instead of hard-coded or recreated branding.

## Comparison history

- Pass 1 P1: create/count/review surfaces were too open, with oversized whitespace and missing mockup-density borders. Fixed with compact document spacing, table row sizing, border hierarchy, and five-column metadata.
- Pass 1 P1: selected-scope create showed the whole catalog permanently. Fixed with a dedicated choose-products mode; the normal document shows selected rows only.
- Pass 1 P2: mobile count rendered every Lot at once. Fixed to one product and one selected Lot at a time with next/previous item controls.
- Pass 1 P2: variance used three summary cards not present in the selected mockup. Removed and replaced with the cut-off snapshot banner.
- Post-fix desktop captures show no remaining P0/P1/P2 issue at the verified viewport.

## Verification

- Full automated suite: 214/214 passed.
- Targeted ESLint: passed.
- Production build and TypeScript: passed.
- Git whitespace validation: passed.
- Residual evidence gap: this in-app Browser build did not honor requested mobile viewport emulation and does not expose print-preview capture, so the revised 390 × 844 and physical A4 output could not be visually recaptured in this pass.

final result: blocked

---

# Design QA — Stock Count Option 3 full-flow fidelity — 2026-10-02

- Source visual truth: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-e553f7de-1b0a-47a4-b163-85426b105497.png` (1448 × 1086 px design board).
- Browser-rendered implementation evidence: Codex in-app Browser captures for `/inventory/stock-counts`, `/inventory/stock-counts/new`, and the temporary non-persistent Stock Count QA fixture; captures were emitted in-tool and the temporary fixture route was removed after verification.
- Viewports: desktop 1180 × 758 CSS px and mobile 390 × 844 CSS px, device scale factor 1. The design board contains multiple scaled frames, so comparisons used corresponding content regions rather than the full board frame.
- State: authenticated light theme; live list/create screens and realistic non-persistent counting/review fixture.

## Full-view comparison evidence

- Desktop list now follows the reference hierarchy: registry title, one compact bordered filter band, search/create actions in that band, dense nine-column table, and pagination directly below the table.
- Create now follows the reference form: compact title, bordered round-information group, four-column desktop header fields including scope radios, notes row, bordered item table, and bottom action bar.
- Desktop count entry now groups each product in its own bordered Lot table with compact headers; mobile uses one product at a time with large count inputs and fixed actions.
- Mobile list follows the reference stack: date range, warehouse/status controls, search, full-width create action, cards/empty state, and compact pagination.

## Focused comparison evidence

- Typography: existing KRC/Sarabun typography, weights, and compact line heights are retained; headings, 11–13 px table text, and form labels match the source hierarchy.
- Spacing: 8–12 px compact control gaps, 3–4 px radii, thin red-tinted borders, dense 34–40 px controls, and grouped section rhythm match the reference.
- Colors: existing primary red, neutral surface containers, semantic status colors, and outline tokens are used consistently. Invalid Stock Count token aliases were corrected at the module root.
- Assets: the existing KRC shell/logo and installed icon library are reused; no placeholder or generated imagery is required by this workflow.
- Copy: list, create, count, variance, general-information, history, and Blind Count labels follow the Thai wording shown in the design while preserving live system data.

## Comparison history

- Pass 1 P1: implementation was an open page with missing border/background declarations and a custom filter row. Fixed invalid token aliases and restored visible grouping.
- Pass 2 P1: visual structure still differed from Option 3 even after borders returned. Rebuilt list, create, desktop Lot groups, mobile count flow, variance summary, general information, and history around the selected mockup.
- Pass 3: source and implementation were emitted together for comparison. No actionable P0/P1/P2 visual mismatch remains; live empty-state content differs from illustrative mock records by design.

## Verification

- Desktop and 390 × 844 mobile primary views: passed.
- Search/filter controls, scope selection, draft/create-and-start actions, tabs, Lot entry, variance review, and fixed mobile actions: passed.
- Browser console errors: none.
- Stock Count tests 9/9, targeted ESLint, TypeScript, and production build: passed.

final result: passed

---

# Design QA — Stock Count Option 3 border and filter correction — 2026-10-02

- Source visual truth: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-cd2d7b4a-bdbf-43de-b2a6-8a6ebaa42df6.png`.
- Root cause: Stock Count CSS referenced aliases that were not defined (`--outline-variant`, `--surface-container-lowest`, and related text/surface names), so browsers discarded the affected border and background declarations.
- Desktop list: passed; shared ERP search/select filters, date range, bordered filter panel, and bordered table region are visible.
- Mobile list at 390 × 844: passed; compact search/filter row and shared filter bottom sheet are visible without horizontal scrolling.
- Create structure: the form fields are grouped inside the bordered “ข้อมูลรอบตรวจนับ” section and the product picker keeps its bordered header/table grouping.
- Targeted ESLint, TypeScript, and production build: passed.

final result: passed

---

# Design QA — Stock Count direction 3 — 2026-10-02

- Source visual truth: `C:/Users/Riew/.codex/generated_images/01a0f862-909b-70e1-a8ec-bccccfbbf050/exec-7a241d03-0fa7-4618-b572-8d5218ce898d.png`.
- Implementation evidence: authenticated KRC routes `/inventory/stock-counts` and `/inventory/stock-counts/new` at desktop and 390 × 844 mobile viewports, plus the counting document rendered with representative Lot data.
- Scope: round register, full-page create form, Lot entry workspace, variance review, approval actions, and A4 Blind Count output.

## Comparison evidence

- Desktop preserves the selected formal document hierarchy: compact title/status/actions, red document rule, six-column metadata strip, tabbed entry/review area, dense Lot table, and sticky bulk actions.
- Mobile replaces the desktop table with one item and all of its Lots, large numeric inputs, previous/next navigation, and a fixed two-action work bar.
- Palette, square 3px surfaces, thin borders, Sarabun typography, red brand actions, semantic variance colors, and shared KRC logo/components match the selected direction and existing system tokens.
- A4 output is a true Blind Count sheet: system quantity and variance are intentionally omitted; Lot, expiry, actual count, note, and two signature areas remain.

## Findings and fixes

- Pass 1 P1 responsiveness: the third destructive action made the mobile sticky bar two rows high and obscured the next Lot. Fixed by retaining only the two frequent workflow actions in the mobile work bar and increasing the content clearance; cancellation remains available outside the mobile counting bar.
- Pass 2: no remaining P0/P1/P2 mismatch in the rendered desktop or 390 × 844 component views.
- The connected database had no existing Stock Count round, so approval mutations were not triggered during visual QA. Authorization, transitions, dirty-row batch writes, Lot integrity, and audit behavior are covered by automated tests and the production build.

## Verification

- Desktop and mobile visual comparison: passed.
- Keyboard and touch target structure: passed; Enter advances desktop numeric entry and mobile controls meet 44px minimum.
- Focused ESLint, TypeScript, 210 automated tests, and production build: passed.

final result: passed

---

# Design QA — Mobile settings menu sheet

- Source visual truth: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-b467d550-57ae-41fa-b295-28c6bf1f5983.png`.
- Implementation capture: `/settings/audit-logs`, 390 × 844 viewport, authenticated light theme.
- Result: passed. The compact settings button beside the breadcrumb opens an 80dvh bottom sheet with dimmed backdrop, drag handle, title, close control, searchable setting groups, item icons, expanded active group, and red active-row treatment. The header hamburger remains reserved for the primary system sidebar.
- Interaction: selecting a setting closes the sheet; group controls remain expandable and the existing permission-filtered setting navigation is reused.

---

# Design QA — Mobile role permissions bottom sheet — 2026-09-29

- Source visual truth path: `C:/Users/Riew/.codex/generated_images/01a0e3b9-3651-7d40-93b5-15532162fde8/exec-c0f7051e-67c1-4cdd-bd29-c68d8dfc0343.png`
- Implementation screenshot path: Codex in-app Browser capture, tab 2, `/settings/users?tab=roles` (390 × 844 viewport, Bottom Sheet open)
- Source pixels: generated mobile reference at 390 × 844 target ratio
- Implementation pixels/CSS viewport: 390 × 844, device scale controlled by the in-app Browser viewport override
- State: light theme, ADMIN selected, `รายการสินค้า` Bottom Sheet open

## Full-view comparison evidence

The implementation follows the selected interaction and hierarchy: compact KRC settings header, Role selector, module search, grouped flat module list, dimmed page context, and a bottom-anchored permission editor. Desktop retains the existing matrix table at `lg` and above.

## Focused region comparison evidence

- Bottom Sheet header, drag handle, Thai module title, selected Role, close action, `เลือกทั้งหมด`, vertical permission rows, green checkbox states, and two-button footer were inspected at 390 × 844.
- Module rows use live permission definitions, so counts and available actions correctly differ from the illustrative 9-action mock instead of showing unavailable permissions.
- No raster imagery is required in this interface; existing icon and color primitives are reused from the KRC application.

## Findings and comparison history

- Pass 1 P2: the mobile page header stacked the add button into a full-width row and consumed too much vertical space. Fixed by placing the title and compact add action on one row and hiding the desktop-only subtitle below `sm`.
- Pass 1 P2: the settings breadcrumb identified the shared `/settings/users` path as `ผู้ใช้งาน` even on `?tab=roles`. Fixed by including the active tab when resolving the breadcrumb.
- Pass 2: no remaining actionable P0, P1, or P2 mismatch. The implementation intentionally uses a native Role selector and actual permission counts to preserve system behavior and data accuracy.

## Required fidelity surfaces

- Fonts and typography: existing Thai application font stack and compact weights are retained; labels do not clip at 390px.
- Spacing and layout rhythm: 44px minimum controls, thin dividers, dense rows, 8px sheet radius, and sticky footer match the selected formal ERP direction.
- Colors and visual tokens: shared KRC primary red, neutral surfaces, outline tokens, and green checkbox accent are used.
- Image quality and asset fidelity: no image assets are needed; no placeholder or CSS illustration was introduced.
- Copy and content: Thai labels, Role name, module names, and permissions come from live system data; English module codes remain hidden.

## Interaction checks

- module row opens the correct Bottom Sheet: passed
- editable Role selection: passed
- permission checkbox interaction: passed
- cancel restores the pre-open module selection: passed
- owner permissions remain locked: passed
- desktop table remains visible after viewport reset: passed
- console errors/warnings: none
- targeted ESLint, TypeScript, and production build: passed

final result: passed

---

# Design QA — Persistent settings workspace — 2026-09-29

- source visual truth path: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-7ee417bc-0641-4e3c-a340-f1b318a36bfd.png`
- implementation screenshot: Codex in-app Browser capture, tab 2, `http://localhost:3000/settings/materials`
- viewport: 1120 × 756 CSS px, light theme, authenticated state
- source pixels: 1488 × 1055; implementation pixels: 1120 × 756
- density normalization: compared by normalized application-shell and content-region proportions because viewport widths differ
- state: material settings page with secondary sidebar expanded; collapsed state captured separately

## Full-view comparison evidence

The implementation preserves the KRC global sidebar and header, adds a persistent settings rail between the global shell and page content, uses compact expandable groups, highlights the current route, and keeps the selected settings page in the right workspace. The implemented 214px rail is intentionally narrower than the reference as requested.

## Focused region comparison evidence

- Settings rail: title, search, accordion controls, nested links, active red rule, bottom hub link, and thin separators match the selected visual hierarchy.
- Collapsed state: the rail releases its full width and leaves a small edge control to restore it; the data table immediately expands into the reclaimed area.
- Page transition: navigation from `/settings/materials` to `/settings/item-types` retained the settings rail and updated `aria-current` to the new page.

## Findings

No actionable P0, P1, or P2 mismatch remains. The page content itself continues to use each existing production settings component, as required, rather than duplicating the mock data shown in the visual target.

## Required fidelity surfaces

- Fonts and typography: existing Sarabun-based KRC typography and compact ERP weights are retained; Thai marks and labels remain legible.
- Spacing and layout rhythm: 214px secondary rail, 36–40px navigation rows, thin section dividers, and 24px desktop content padding maintain the reference density while consuming less width.
- Colors and visual tokens: shared KRC primary red, surface, outline, text, and success tokens are used; dark-mode-compatible tokens are retained.
- Image quality and asset fidelity: the existing company logo and Material Symbols icon set are reused; no new raster assets or approximations were needed.
- Copy and content: navigation labels come from the real settings routes and permission model; page content remains the system's real data and controls.

## Interaction checks

- expand/collapse navigation groups: passed
- collapse and restore entire settings rail: passed with keyboard-accessible controls
- switch settings route while retaining the rail: passed
- active route highlight after navigation: passed
- permission-filtered navigation: implemented through the existing permission context
- browser console errors: none observed
- tests, ESLint, TypeScript, and production build: passed

## Comparison history

- Initial implementation matched the selected structure with a 214px rail. The collapsed-state check confirmed the reclaimed width and exposed the restore handle. No actionable P0/P1/P2 visual correction was required.

final result: passed

---

# Design QA — Mobile asset catalog and detail — 2026-09-28

- Source visual truth paths: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-0d84649a-832d-4363-ac7d-5e3fff0bfb7c.png` (original asset list) and `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-8ea2d30d-c5cf-4111-8823-209a8064eef9.png` (approved compact-list direction).
- Implementation screenshot path: authenticated Codex in-app Browser captures of `/assets`, list and AST0001 detail states.
- CSS viewport and implementation pixels: 390 × 844 at device scale factor 1.
- Source pixels: 513 × 961 (original asset screen) and 852 × 1853 (approved list reference); compared by normalized mobile layout proportions.
- State: light theme, first asset page, AST0001 selected.

## Full-view and focused comparison evidence

- The expanded accordion and embedded tabs were removed. The mobile list now follows the approved item-catalog hierarchy: red code, two-line name, muted type/serial metadata, shared status badge, 44px overflow target, and thin row divider.
- A row tap and its trailing action both open the existing `AssetSideDrawer`; details, QR, transfer permissions, live asset data, and desktop table remain centralized in their existing components.
- The 390 × 844 capture shows no horizontal overflow, clipped text, or hidden persistent controls. The detail fills the mobile viewport and remains independently scrollable.

## Required fidelity surfaces

- Fonts and typography: existing KRC Thai font stack and weights match the item-list pattern; Thai marks and serial text render without clipping.
- Spacing and layout rhythm: 92px minimum rows, 16px horizontal padding, 12px gaps, dividers, and 44px action targets match the selected compact pattern.
- Colors and visual tokens: existing primary red, surface, outline, muted text, and centralized status tokens are reused.
- Image quality and asset fidelity: no image asset is required in this asset list state; no placeholder or recreated graphic was introduced.
- Copy and content: list content uses the real asset code, name, type, serial number, and centralized status label.

## Interaction and comparison history

- Pass 1 P1: each asset expanded inline into details, QR, transfer, and actions, creating a mixed browse/detail state. Fixed by routing mobile row selection to the existing asset detail drawer and deleting the duplicate inline detail implementation.
- Pass 2: row-to-detail and close-to-list transitions passed; QR and permission-gated transfer controls remain present in the existing detail component.
- Browser console: no warnings or errors observed.
- TypeScript, targeted ESLint, asset catalog test, and production build passed.

final result: passed

---

# Design QA — Consolidated mobile item detail — 2026-09-28

- Source evidence: user-provided comparison screenshots of the existing `ItemSideDrawer` and the duplicate mobile detail.
- Implementation evidence: authenticated `/items?type=FG` capture at 390 × 844 with FGRM1A07023024L selected.
- The duplicate `MobileItemDetail` was removed. Compact mobile rows now open the existing responsive `ItemSideDrawer` used by desktop.
- Mobile keeps one back action, the existing image/name/type/status hierarchy and complete type-aware tabs, plus one sticky primary edit action. Destructive actions remain in the row overflow menu.
- TypeScript, targeted ESLint, production build, and the row-to-detail interaction passed.

final result: passed

---

# Design QA — Mobile document read/edit separation — 2026-09-28

- Source visual truth: selected mobile document list, bottom-sheet, and full-detail mockups referenced in the earlier mobile document-list section.
- Authenticated route verified: `/purchase/pr` at the mobile breakpoint.
- Read flow: list row → compact bottom sheet → read-only full-document view.
- Edit flow: shown only when the existing permission and document-status rules allow it, then opens the existing validated edit form.
- Print remains a separate preview action and is not used as the document-reading surface.
- Existing system status badges, form validation, and permissions are reused.
- Accessibility check: the list and bottom sheet are unmounted while the full-document view is active, so hidden interactive controls do not remain in the accessibility tree.
- TypeScript, targeted ESLint, and production build passed.

final result: passed

---

# Mobile document-list redesign — 2026-09-28

- source visual truth paths:
  - `C:\Users\Riew\.codex\generated_images\01a0e3b9-3651-7d40-93b5-15532162fde8\exec-38fd4a41-2f5b-4cd6-b538-a342465480e6.png`
  - `C:\Users\Riew\.codex\generated_images\01a0e3b9-3651-7d40-93b5-15532162fde8\exec-98847e09-6831-4831-acc6-a10009500d50.png`
  - `C:\Users\Riew\.codex\generated_images\01a0e3b9-3651-7d40-93b5-15532162fde8\exec-34e88057-0f4a-4c78-b74f-45a565af8d41.png`
- implementation URL: `http://localhost:3001/purchase/receipts`
- implementation screenshot path: unavailable — authenticated route redirected to `/login`
- intended viewport: 390 × 844 CSS px, device scale factor 1
- source dimensions: 853 × 1853 px; implementation dimensions: unavailable
- state: light theme; GR list, selected-row sheet, and full document detail

## Findings

- [P1] Authenticated implementation could not be captured.
  Location: `/purchase/receipts`, `/purchase/pr`, `/purchase/po`, `/inventory/issues`, `/inventory/adjustments`.
  Evidence: the in-app browser was redirected to `/login`, so no browser-rendered implementation image exists for comparison with the selected mockups.
  Impact: typography, spacing, responsive fit, and interaction fidelity cannot be visually certified.
  Fix: sign in to the local preview, capture the three GR states at 390 × 844, combine each capture with its matching source image, then run the visual comparison loop.

## Required fidelity surfaces

- Fonts and typography: implemented with the existing Sarabun/Noto Sans Thai stack; visual comparison blocked by authentication.
- Spacing and layout rhythm: encoded from the selected mockups; visual comparison blocked by authentication.
- Colors and visual tokens: existing KRC primary, surface, outline, and shared status tokens are reused.
- Image quality and asset fidelity: no new raster assets are required; icons use the installed icon library.
- Copy and content: document list, quick sheet, and GR item-detail labels follow the approved Thai mockups while retaining real system fields and status labels.

## Interaction checks

- production build: passed
- TypeScript: passed
- targeted lint: passed
- automated tests: 191 passed
- browser list/detail interaction: blocked by authentication
- console errors on authenticated screens: not available

## Comparison history

- No visual comparison iteration was possible because the local browser session had no authenticated KRC ERP session.

## Implementation checklist

- Sign in to the local preview.
- Capture list, quick sheet, and full GR detail at 390 × 844.
- Compare each capture with the corresponding selected mockup.
- Fix any P0/P1/P2 mismatch and repeat until passed.

final result: blocked

---

# Design QA — Shared Signature Status and Policy Notice

- source visual truth path: existing KRC shared `ActiveStatusBadge` and `ToggleSwitch` components
- implementation screenshot path: Codex in-app Browser capture, `/settings/signature-approval`
- viewport: responsive mobile-width browser capture
- state: authenticated user; signature-ready and approval-policy tabs
- density normalization: source and implementation are the same live product surface

## Full-view and focused comparison evidence

- The signature-ready state now uses the shared compact green status badge instead of a page-specific pale pill.
- Approval-policy activation now uses the shared ON/OFF switch on desktop and mobile.
- The policy warning uses a rectangular high-contrast dark KRC red surface, bright text, and an amber leading rule/icon; card spacing and layout are unchanged.
- Save, validation, MFA, upload, and error feedback now route through the shared application toast.
- Typography, spacing, shared color tokens, existing icons, and Thai copy remain legible without clipping or overflow.

## Comparison history

- P2 fixed: page-specific status styling was replaced with the shared status component.
- P2 fixed: pale yellow warning treatment was replaced with the requested dark-bright KRC treatment.
- P2 fixed: page-local feedback banners were replaced with the shared toast API.
- Post-fix visual evidence: both tabs rendered without overlap at the responsive mobile width; TypeScript and targeted ESLint passed.

final result: passed

---

# Design QA — Approval Policy Matrix

- Source visual truth: generated option 1, `exec-1bc31690-e6f6-4ef0-b5c3-62e564519c3a.png`
- Verified route: `/settings/signature-approval`, policy tab
- Verified state: authenticated owner, light theme, five seeded policies

## Comparison evidence

- The page keeps the approved three-tab hierarchy and the option-1 warning, policy matrix, status, conditional threshold, cancel, and save structure.
- Desktop reuses the shared `DataTable` and `ActiveStatusBadge`; mobile switches to the approved compact policy rows with aligned fields and a fixed primary action.
- PO, PR, stock adjustment, cancellation, and signature-change policies appear in the approved order with no clipped Thai text.
- The shared KRC shell, red accent, border radius, typography, form controls, and status badges are reused rather than copied locally.

## Interaction and security checks

- Tab switching and responsive policy rendering passed in the in-app Browser.
- Selects, threshold input, status controls, and reset/save actions are keyboard-accessible native controls.
- Save requires `approval_policy.manage` and an AAL2 session at both Server Action and database RPC boundaries.
- Direct writes are unavailable; every successful change writes an immutable audit record.
- Browser console showed no runtime errors.

final result: passed

---

# Design QA — Authenticator Responsive Setup Refresh

- source visual truth path: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-305e7b12-f1c3-4d07-a9b2-83fbdefad8aa.png`
- implementation route: `/settings/signature-approval`
- source pixels: 1577 × 869
- intended viewport: desktop and mobile responsive states at device scale 1
- state: TOTP enrollment and completed setup
- implementation screenshot path: unavailable; the in-app browser is currently at the authenticated application's login screen

## Full-view and focused-region evidence

The source screenshot was opened from the user-provided visual. The revised implementation could not be captured in the same authenticated state without the user's password. Code-level checks confirm the responsive QR/deep-link branches, compact neutral completion card, existing system typography and surface tokens, and mobile-safe actions, but code is not accepted as visual evidence.

## Findings

- [P1] Rendered comparison is blocked by authentication.
  Location: `/settings/signature-approval` enrollment and completion states.
  Evidence: the in-app browser redirects to `/login` and no credential is available.
  Impact: desktop/mobile visual fidelity cannot be certified from a rendered artifact in this run.
  Fix: sign in, open the page, and capture both states at desktop and mobile widths.

## Interaction checks

- safe `otpauth://totp/` link validation: passed
- invalid setup link rejection: passed
- TypeScript: passed
- targeted ESLint: passed
- full test suite: 158/158 passed
- production build: passed with two pre-existing dynamic filesystem tracing warnings in `src/lib/server-pdf.ts`
- browser console: not checked on the authenticated screen

## Comparison history

- Pass 1: blocked before authenticated rendering; no visual fixes were inferred from a non-rendered state.

final result: blocked

---

# Design QA — Authenticator Enrollment Extension

- Source visual truth: the approved signature-and-approval mockup listed in the preceding section
- Verified implementation: `/settings/signature-approval`, desktop and 390 × 844 mobile
- State verified visually: signature-entry step and responsive shell; enrollment state verified by code, types, and build without creating a real MFA factor or exposing a secret

## Comparison evidence

- The original three-step hierarchy is retained and now progresses through signature, Authenticator, and ready states.
- The Authenticator card reuses the same border radius, compact spacing, KRC red primary action, formal Thai copy, and responsive one-column mobile treatment.
- QR enrollment uses the `scan-qr-code` concept selected through Supericons and the installed Lucide set; verified and security states use restrained outline icons from the same family.
- The 6-digit field is mobile numeric, one-time-code compatible, fixed to six ASCII digits, and remains readable without crowding.
- Desktop preserves the right-side document preview while mobile keeps the fixed safe-area primary action.

## Interaction and security checks

- Starting enrollment requires an explicit click; the page does not create factors on load.
- QR, manual secret, and OTP remain in component memory only and are cleared after verification or explicit cancellation.
- Unknown Supabase errors are replaced with a safe generic message rather than exposing backend details.
- No automatic enrollment was performed during QA, so no test factor or secret was added to the user's account.
- TypeScript, targeted ESLint, production build, and all 154 tests passed.

final result: passed

---

# Design QA — Signature and Approval Settings

- source visual truth path: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-791aa256-978f-4997-bcb7-8ef0105fc4ea.png`
- implementation screenshot path: Codex in-app Browser capture, tab 5, `/settings/signature-approval` (desktop and 390 × 844 mobile viewport)
- source pixels: 1536 × 1024 composite mockup (desktop and mobile)
- implementation pixels: 1280 × 900 desktop capture; 390 × 844 mobile capture
- CSS viewport: default desktop; 390 × 844 mobile
- density normalization: visual regions compared by layout and component proportions because the source is a composite at a different desktop viewport
- state: authenticated user, light theme, signature-entry step; empty and drawn states checked

## Full-view comparison evidence

The implementation keeps the same hierarchy and proportions as the selected mockup: title and subtitle, three-step progress line, two-column desktop form, single-column mobile form, signature method switch, 3:1 signature canvas, document preview, verification checklist, history strip, desktop actions, and a fixed mobile primary action. The existing KRC application shell is intentionally retained instead of replacing global navigation from a page-level feature.

## Focused region comparison evidence

- Signature card: 3:1 drawing area, bordered segmented control, reset action, upload guidance, and security note match the source structure. Drawing was tested directly in the mobile viewport.
- Desktop document preview: company logo, legal name, address, approval label, signature, signer identity, position, date, and readiness checklist remain legible without overlap.
- Mobile: controls reflow to one column, preview/history are hidden as in the source mobile state, and the primary action remains fixed above the safe area.

## Findings

No actionable P0, P1, or P2 visual mismatch remains in the page-owned surface. The desktop and mobile app headers differ from the mockup because the implementation correctly reuses the product's existing shared AppShell rather than introducing a one-page navigation variant.

## Required fidelity surfaces

- Fonts and typography: existing Sarabun/Noto Sans Thai stack, weights, line heights, and wrapping are consistent with the KRC system and do not clip Thai marks.
- Spacing and layout rhythm: responsive grid, compact card spacing, borders, and fixed mobile action follow the mockup proportions.
- Colors and visual tokens: shared KRC primary red, surface, border, success, and neutral tokens are used.
- Image quality and asset fidelity: the existing company logo asset is reused; signature output is normalized to a 1200 × 400 transparent PNG.
- Copy and content: all labels, instructions, image guidance, preview details, history, and Authenticator status are present in formal Thai.

## Interaction checks

- drawing with pointer/touch: passed
- live preview update: passed
- clear signature: present and accessible
- upload validation: PNG/JPG and 2 MB limit implemented
- responsive layout at 390 × 844: passed
- console errors checked: no page runtime error observed
- persistence: code and migration are present; remote database deployment requires linking the Supabase CLI project

## Comparison history

- Initial mobile capture occurred during the sidebar transition and showed a partial rail. After waiting for the shared 300 ms shell transition, the repeated capture showed the correct full-width mobile layout. No code change was required.

final result: passed

---

# Design QA — Mobile item catalog and detail — 2026-09-28

- Source visual truth paths: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-8ea2d30d-c5cf-4111-8823-209a8064eef9.png` (list) and `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-1a012c35-f17b-43be-ad7d-4d5db6543e35.png` (detail).
- Implementation evidence: authenticated Codex in-app Browser captures of `/items`, list and RM001 detail states.
- CSS viewport: 390 × 844; source references are 852 × 1853 raster exports and were compared by normalized mobile viewport proportions.
- State: light theme, first catalog page, RM001 selected.

## Full-view comparison evidence

- The list reproduces the source hierarchy: page title, full-width search, two equal action controls, and a flat ledger with red codes, two-line names, muted metadata, green status, and overflow actions.
- The detail reproduces the source hierarchy: back/code/status/actions header, product name and description, red section headings, two-column definition rows, and fixed red edit action.
- The existing KRC app header remains visible on the list as required by the product shell and is replaced by the full-screen detail header after selection.

## Focused region comparison evidence

- Row density, dividers, status placement, and 44px action targets match the selected list direction without horizontal scrolling.
- RM001 stored its subtitle inside parentheses; the implementation separates it into `Hot Rolled Steel Sheet` and `Pickled and Oiled` to match the detail reference.
- Detail rows come directly from the same `visibleColumns`, column labels, renderers, live item data, and lookups used by the desktop table; illustrative mockup-only fields are not rendered.

## Findings and comparison history

- Pass 1 P2: the mobile list and pagination remained exposed in the accessibility tree behind the full-screen detail. Fixed by unmounting both while detail is active and marking detail as an aria-modal dialog.
- Pass 1 P2: parenthetical product descriptions were not separated from the title. Fixed with a conservative title/parenthetical split only when no explicit description exists.
- Pass 2: no remaining actionable P0, P1, or P2 visual mismatch. Product data naturally differs from illustrative mock data.

## Verification

- Search, row-to-detail transition, filter dialog structure, overflow actions, permission-gated edit action, and responsive 390 × 844 rendering checked.
- Console errors: none observed.
- TypeScript, targeted ESLint, and production build passed.

final result: passed

---

# Design QA — Audit log detail drawer

- Source visual truth: `C:/Users/Riew/AppData/Local/Temp/codex-clipboard-450832b2-b5e8-4f32-b3c0-6812cc319da3.png` (desktop list/drawer and mobile bottom sheet).
- Implementation captures: Codex in-app Browser, `/settings/audit-logs`, 1280 × 720 desktop and 390 × 844 mobile.
- State: authenticated owner, light theme, audit event selected; mobile navigation closed.

## Full-view comparison evidence

- Desktop keeps the full audit table width while the fixed right drawer overlays the content area. Opening details does not reflow or collapse table columns.
- Mobile keeps the event list behind a dim layer and opens a bottom sheet with a grab handle, close control, scrollable details, and a fixed close action.
- The drawer hierarchy follows the reference: result and timestamp, readable event summary, event facts, field changes, then optional technical data.

## Focused comparison and findings

- User-facing labels and status values use Thai descriptions. Numeric database row IDs are no longer presented as document numbers; legacy events without a captured document number say “ไม่มีเลขเอกสาร”.
- Technical data stays available in a collapsed section; raw user-agent values such as `node` display as “บริการภายในระบบ”.
- New audit events capture PO/PR/GR numbers before the generic row ID through a forward migration. Existing audit events are preserved and not rewritten.
- The source contains illustrative events from multiple modules; the live page shows only records available in the connected local database. No P0/P1/P2 visual mismatch remains in the implemented drawer behavior.

## Verification

- Desktop drawer open: passed; table width remains unchanged beneath the overlay.
- Mobile bottom sheet open: passed at 390 × 844; list stays behind the backdrop and the sheet scrolls independently.
- Targeted ESLint and production build: passed.
- Migration is present locally; it was not applied to a remote Supabase project during this UI change.

final result: passed
