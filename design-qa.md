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
