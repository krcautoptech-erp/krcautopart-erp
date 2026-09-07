# PR Item Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR selection use all purchasable Item Master records with a compact, non-truncating selector.

**Architecture:** Introduce a source-neutral PR item contract, extend the PR line schema and save RPC compatibly, then adapt the server page, action, and client modal. Snapshot columns remain authoritative for documents.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL, Node test runner, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-08-26-pr-item-master-design.md`

## Global Constraints

- Preserve existing raw-material PR records.
- Only active items in active purchasable item types may be selected.
- Selector table has no horizontal scrolling and never uses ellipsis for item names.
- PO and receipt behavior is out of scope.

---

### Task 1: Source-neutral PR form model

**Files:**
- Modify: `src/lib/purchase-requisition-form.ts`
- Test: `src/lib/purchase-requisition-form.test.ts`

**Interfaces:**
- Produces: `PurchaseRequisitionItem`, `PurchaseRequisitionLineInput`, `getPurchaseRequisitionItemKey`, and source-neutral validation.

- [ ] Write failing tests for mixed sources, duplicate source keys, and non-purchasable items.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Implement the smallest source-neutral model and validation.
- [ ] Run the focused test and confirm it passes.

### Task 2: Backwards-compatible database save contract

**Files:**
- Modify: `supabase/migrations/20260826124613_support_item_master_in_purchase_requisitions.sql`

**Interfaces:**
- Consumes JSON items shaped as `{ source, source_id, quantity, remarks, needed_by_date }`.
- Produces PR rows with either `raw_material_id` or `item_master_id` and complete snapshots.

- [ ] Add the nullable Item Master foreign key and indexes.
- [ ] Replace `save_purchase_requisition` with mixed-source validation and snapshot insertion.
- [ ] Review function privileges, `search_path`, and compatibility constraints.

### Task 3: Server loading and saving

**Files:**
- Modify: `src/app/(dashboard)/purchase/pr/page.tsx`
- Modify: `src/app/actions/purchase-requisitions.ts`

**Interfaces:**
- Consumes active purchasable `item_types`, `item_master`, and `raw_materials`.
- Produces `PurchaseRequisitionItem[]` for the client and mixed-source RPC payloads.

- [ ] Load and normalize purchasable items in parallel.
- [ ] Validate submitted selections against fresh database records.
- [ ] Load existing draft lines from either source.
- [ ] Preserve print behavior through snapshot fields.

### Task 4: PR selector UX

**Files:**
- Modify: `src/app/(dashboard)/purchase/pr/_components/pr-create-modal.tsx`
- Modify: `src/app/(dashboard)/purchase/pr/_components/pr-list-page.tsx`

**Interfaces:**
- Consumes `PurchaseRequisitionItem[]` and stable item keys.
- Produces source-neutral PR line submissions.

- [ ] Rename material-specific UI copy to item/service copy.
- [ ] Replace selector columns with selection, code, name, and unit only.
- [ ] Remove horizontal overflow and render full names in at most two lines without ellipsis.
- [ ] Add item-type filtering and retain multi-select behavior.

### Task 5: Verification

**Files:**
- Verify all modified files.

- [ ] Run focused Node tests.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run focused ESLint.
- [ ] Run `npm run build`.
- [ ] Review the final diff against the spec.
