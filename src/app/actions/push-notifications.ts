"use server";

import { createClient } from "@/utils/supabase/server";

type BrowserPushSubscription = {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
};

function isValidSubscription(subscription: BrowserPushSubscription) {
  try {
    const endpoint = new URL(subscription.endpoint);
    return (
      endpoint.protocol === "https:" &&
      subscription.endpoint.length <= 2048 &&
      subscription.keys.auth.length >= 16 &&
      subscription.keys.auth.length <= 255 &&
      subscription.keys.p256dh.length >= 32 &&
      subscription.keys.p256dh.length <= 255
    );
  } catch {
    return false;
  }
}

export async function registerPushSubscriptionAction(
  subscription: BrowserPushSubscription,
  userAgent: string,
) {
  if (!isValidSubscription(subscription)) {
    return {
      error: "ข้อมูลการแจ้งเตือนไม่ถูกต้อง กรุณาลองเปิดการแจ้งเตือนใหม่",
      success: false as const,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
      success: false as const,
    };
  }

  const { error } = await supabase.rpc("register_web_push_subscription", {
    p_auth_key: subscription.keys.auth,
    p_endpoint: subscription.endpoint,
    p_p256dh_key: subscription.keys.p256dh,
    p_user_agent: userAgent.slice(0, 500),
  });

  if (error) {
    console.error("Unable to register Web Push subscription:", {
      code: error.code,
      message: error.message,
    });
    return {
      error: "ไม่สามารถเปิดการแจ้งเตือนบนอุปกรณ์นี้ได้",
      success: false as const,
    };
  }

  return { success: true as const };
}

export async function deactivatePushSubscriptionAction(endpoint: string) {
  if (!endpoint.startsWith("https://") || endpoint.length > 2048) {
    return { success: false as const };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false as const };
  }

  const { error } = await supabase.rpc("deactivate_web_push_subscription", {
    p_endpoint: endpoint,
  });

  return { success: !error };
}
