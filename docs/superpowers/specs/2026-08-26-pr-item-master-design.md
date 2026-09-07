# PR Item Master Design

## Goal

Allow purchase requisitions to select every active item whose item type is purchasable, while preserving existing raw-material PR data and leaving PO/receipt behavior unchanged for this phase.

## Data model

`purchase_requisition_items` keeps its snapshot fields (`item_code`, `item_name`, `unit_name`, description) and existing `raw_material_id`. A nullable `item_master_id` references generic Item Master records. Exactly one source reference is required for new purchasable lines: raw material or Item Master. Existing legacy rows remain valid.

The save RPC accepts `source`, `source_id`, quantity, remarks, and needed-by date. It validates active raw materials or active Item Master rows whose active type has `is_purchasable = true`, then writes immutable display snapshots.

## Application model

The PR UI uses a neutral `PurchaseRequisitionItem` model with a stable key (`raw_material:<id>` or `item_master:<id>`). The server loads active raw materials only when RM is purchasable and active generic items only when their type is active and purchasable.

## Selector UX

The selector modal shows only selection control, item code, full item name, and unit. It has no horizontal scrolling. Names wrap naturally, show in one line when space permits, and may occupy up to two complete lines without ellipsis. A type filter and text search remain available above the table.

## Compatibility

Existing PR rows load through their `raw_material_id`. Newly created generic lines load through `item_master_id`. Print views continue using snapshot fields. PO and receipt workflows are not changed in this phase.

## Verification

Unit tests cover stable keys, validation across sources, duplicates, inactive/non-purchasable items, and whole-number units. TypeScript, focused tests, lint, and production build must pass.
