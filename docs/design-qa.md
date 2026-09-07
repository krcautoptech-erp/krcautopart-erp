# Purchase Order Modal Design QA

- Reference: `codex-clipboard-ea1ed612-884b-453d-910e-7509eaf6b0dd.png`
- Previous rendered state: `codex-clipboard-f46485f7-b839-4f20-81e1-01e0a04429a1.png`
- Scope: create-PO modal only. Existing ERP header, sidebar, PO list, and persistence behavior are unchanged.
- Implemented: compact 1088 x 843 maximum canvas, reference-aligned section heights, visible bordered form controls, compact eight-row item table, supplier notes, totals, and fixed action footer.
- Static checks: TypeScript, targeted ESLint, Thai Mojibake scan, and generated Tailwind utility inspection passed.
- Visual verification: blocked because both available browser sessions redirect the authenticated dashboard route to Login.
- Database verification: outside this visual-only change; the existing PO migration still requires a linked Supabase project with sufficient privileges.

final result: blocked
