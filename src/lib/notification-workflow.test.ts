import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/20260926152111_align_action_notifications.sql"), "utf8");
const pushQueueMigration = readFileSync(
  join(root, "supabase/migrations/20261004074800_notification_delivery_queue_and_stock_count_events.sql"),
  "utf8",
);

test("approval tasks follow current permissions and close for all recipients", () => {
  assert.match(migration, /when 'purchase_requisition' then 'pr\.approve'/);
  assert.match(migration, /when 'purchase_order' then 'po\.approve'/);
  assert.match(migration, /role_permission\.permission_id is not null/);
  assert.match(migration, /old\.status = 'pending_approval' and new\.status <> 'pending_approval'/);
  assert.match(migration, /notification\.id = recipient\.notification_id/);
  assert.match(migration, /event_key <> 'submitted' or \(select public\.authorize\('po\.approve'\)\)/);
});

test("PO and GR notifications open their linked document", () => {
  const poPage = readFileSync(join(root, "src/app/(dashboard)/purchase/po/page.tsx"), "utf8");
  const poList = readFileSync(join(root, "src/app/(dashboard)/purchase/po/_components/po-list-page.tsx"), "utf8");
  assert.match(poPage, /initialOpenOrderId = Number\.isSafeInteger\(requestedOrderId\)/);
  assert.match(poList, /getPurchaseOrderPrintDetailAction\(initialOpenOrderId\)/);
  assert.match(migration, /'\/purchase\/po\?po=' \|\| v_po\.id/);
  assert.match(migration, /goods_receipt_cancelled_notification/);
});

test("push delivery queue is private, retryable, and stock-count permission scoped", () => {
  const dispatcher = readFileSync(
    join(root, "src/app/api/internal/push/dispatch/route.ts"),
    "utf8",
  );
  const proxy = readFileSync(join(root, "src/proxy.ts"), "utf8");
  const worker = readFileSync(join(root, "scripts/dispatch-web-push.mjs"), "utf8");
  assert.match(pushQueueMigration, /create table if not exists public\.notification_push_deliveries/);
  assert.match(pushQueueMigration, /enable row level security/);
  assert.match(pushQueueMigration, /revoke all on public\.notification_push_deliveries from anon, authenticated/);
  assert.match(pushQueueMigration, /for update of delivery skip locked/);
  assert.match(pushQueueMigration, /v_attempts >= 5/);
  assert.match(pushQueueMigration, /grant execute on function public\.claim_web_push_deliveries\(integer\) to service_role/);
  assert.match(pushQueueMigration, /claim_own_web_push_deliveries[\s\S]*from public, anon, authenticated/);
  assert.match(pushQueueMigration, /get_document_push_targets[\s\S]*from public, anon, authenticated/);
  assert.match(pushQueueMigration, /permission\.permission_code = 'stock_count\.review'/);
  assert.match(pushQueueMigration, /app_user\.id is distinct from v_actor_id/);
  assert.match(pushQueueMigration, /when 'stock_count' then \(select public\.authorize\('stock_count\.view'\)\)/);
  assert.match(pushQueueMigration, /interval '30 days'/);
  assert.match(pushQueueMigration, /interval '90 days'/);
  assert.match(dispatcher, /PUSH_DISPATCH_SECRET/);
  assert.match(dispatcher, /timingSafeEqual/);
  assert.match(dispatcher, /prune_notification_delivery_history/);
  assert.match(proxy, /pathname === "\/api\/internal\/push\/dispatch"/);
  assert.match(worker, /Production dispatch requires HTTPS/);
  assert.match(worker, /AbortSignal\.timeout\(20_000\)/);
  assert.match(worker, /authorization: `Bearer \$\{secret\}`/);
});

test("invalid VAPID subscriptions are retired instead of retried forever", () => {
  const migration = readFileSync(
    join(root, "supabase/migrations/20261004110916_retire_invalid_web_push_subscriptions.sql"),
    "utf8",
  );
  const client = readFileSync(join(root, "src/components/push-notification-control.tsx"), "utf8");
  const appShell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
  assert.match(migration, /p_status_code in \(401, 403, 404, 410\)/);
  assert.match(migration, /push_subscription_vapid_rejected/);
  assert.match(client, /subscriptionUsesVapidKey/);
  assert.match(client, /unsubscribe\(\)/);
  assert.match(appShell, /PushSubscriptionSynchronizer/);
});
