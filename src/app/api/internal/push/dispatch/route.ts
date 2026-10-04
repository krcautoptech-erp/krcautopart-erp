import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { dispatchQueuedWebPush } from "@/lib/web-push.server";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request, secret: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const providedBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json(
      { error: "PUSH_DISPATCH_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const result = await dispatchQueuedWebPush(admin, 100);
    const cleanup = await admin.rpc("prune_notification_delivery_history");
    if (cleanup.error) {
      console.error("Unable to prune notification delivery history:", cleanup.error);
    }
    return NextResponse.json({ ...result, success: true });
  } catch (error) {
    console.error("Web Push dispatcher failed:", error);
    return NextResponse.json(
      { error: "PUSH_DISPATCH_FAILED", success: false },
      { status: 500 },
    );
  }
}
