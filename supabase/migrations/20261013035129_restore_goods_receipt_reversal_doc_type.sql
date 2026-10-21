-- Opening-stock rollout replaced this allowlist without the existing GR reversal type.
begin;

set local lock_timeout = '5s';

alter table public.inventory_transactions
  drop constraint inventory_transactions_doc_type_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_doc_type_check check (
    reference_doc_type in (
      'goods_receipt', 'goods_receipt_reversal', 'purchase_return',
      'production_issue', 'stock_issue', 'stock_issue_reversal',
      'stock_adjustment', 'stock_adjustment_reversal',
      'opening_balance', 'opening_balance_reversal'
    )
  );

commit;
