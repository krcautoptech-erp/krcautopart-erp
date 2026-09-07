"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function loginAction(
  _prevState: { error?: string } | null,
  formData: FormData,
) {
  const userId = formData.get("userId") as string;
  const password = formData.get("password") as string;

  if (!userId || !password) {
    return { error: "กรุณากรอกรหัสผู้ใช้งานและรหัสผ่าน" };
  }

  if (userId.trim().length < 8) {
    return { error: "รหัสผู้ใช้งานต้องมีความยาวอย่างน้อย 8 ตัวอักษร" };
  }

  if (password.length < 8) {
    return { error: "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร" };
  }

  const normalizedUserId = userId.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{7,29}$/.test(normalizedUserId)) {
    return { error: "Username ไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่" };
  }
  const email = `${normalizedUserId}@krc.com`;

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Translate common Supabase auth errors to friendly Thai messages
    let message = error.message;
    if (error.message.includes("Invalid login credentials")) {
      message = "รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง";
    } else if (error.message.includes("Email not confirmed")) {
      message = "กรุณายืนยันตัวตนผ่านอีเมลก่อนใช้งาน";
    }
    return { error: message };
  }

  revalidatePath("/items");
  redirect("/items");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
