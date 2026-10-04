"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import {
  COMPANY_ASSET_BUCKET,
  createCompanyBranding,
  DEFAULT_DOCUMENT_SETTINGS,
  normalizeLegacyUtf8Text,
  normalizeCompanyHeaderFieldOrder,
  type CompanyBranch,
  type CompanyDocumentSettings,
  type CompanyProfile,
  type CompanySettingsData,
} from "@/lib/company-settings";
import { getThaiPostalCode } from "@/lib/vendors/thai-address";
import { COMPANY_BRANDING_CACHE_TAG } from "@/lib/company-settings.server";
import { createClient } from "@/utils/supabase/server";

const SETTINGS_PATH = "/settings/company";
const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const LOGO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type AuthenticatedClient = Awaited<ReturnType<typeof createClient>>;

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function booleanValue(formData: FormData, key: string) {
  return formData.get(key) === "true";
}

function mapProfile(row: Record<string, unknown>): CompanyProfile {
  const updatedAt = String(row.updated_at ?? "");
  const branding = createCompanyBranding({
    companyId: String(row.id),
    darkLogoMode: String(row.dark_logo_mode ?? "auto"),
    legalNameEn: row.legal_name_en ? String(row.legal_name_en) : null,
    legalNameTh: String(row.legal_name_th),
    logoDarkPath: row.logo_dark_path ? String(row.logo_dark_path) : null,
    logoLightPath: row.logo_light_path ? String(row.logo_light_path) : null,
    updatedAt,
  });

  return {
    addressLine: row.address_line ? String(row.address_line) : "",
    branchCode: String(row.branch_code ?? "00000"),
    branchType: row.branch_type === "branch" ? "branch" : "head_office",
    companyCode: String(row.company_code),
    darkLogoMode:
      row.dark_logo_mode === "custom" ? "custom" : "auto",
    district: row.district ? String(row.district) : "",
    email: row.email ? String(row.email) : "",
    id: String(row.id),
    legalNameEn: normalizeLegacyUtf8Text(
      row.legal_name_en ? String(row.legal_name_en) : "",
    ),
    legalNameTh: normalizeLegacyUtf8Text(String(row.legal_name_th)),
    logoDarkPath: row.logo_dark_path ? String(row.logo_dark_path) : null,
    logoDarkUrl: branding.logoDarkUrl,
    logoLightPath: row.logo_light_path ? String(row.logo_light_path) : null,
    logoLightUrl: branding.logoLightUrl,
    phone: row.phone ? String(row.phone) : "",
    postalCode: row.postal_code ? String(row.postal_code) : "",
    province: row.province ? String(row.province) : "",
    status: row.status === "inactive" ? "inactive" : "active",
    subdistrict: row.subdistrict ? String(row.subdistrict) : "",
    taxId: row.tax_id ? String(row.tax_id) : "",
    updatedAt,
    website: row.website ? String(row.website) : "",
  };
}

function mapBranch(row: Record<string, unknown>): CompanyBranch {
  return {
    addressLine: String(row.address_line ?? ""),
    branchCode: String(row.branch_code ?? ""),
    branchName: String(row.branch_name ?? ""),
    district: String(row.district ?? ""),
    email: String(row.email ?? ""),
    id: String(row.id),
    isHeadOffice: row.is_head_office === true,
    isRegisteredAddress: row.is_registered_address === true,
    phone: String(row.phone ?? ""),
    postalCode: String(row.postal_code ?? ""),
    province: String(row.province ?? ""),
    status: row.status === "inactive" ? "inactive" : "active",
    subdistrict: String(row.subdistrict ?? ""),
  };
}

function mapDocumentSettings(
  row: Record<string, unknown> | null,
): CompanyDocumentSettings {
  if (!row) return DEFAULT_DOCUMENT_SETTINGS;

  return {
    footerTextEn: String(row.footer_text_en ?? ""),
    footerTextTh: String(row.footer_text_th ?? ""),
    headerFieldOrder: normalizeCompanyHeaderFieldOrder(
      row.header_field_order,
    ),
    headerStyle: row.header_style === "standard" ? "standard" : "compact",
    logoWidthMm: Number(row.logo_width_mm ?? 34),
    showAddress: row.show_address !== false,
    showEmail: row.show_email !== false,
    showPhone: row.show_phone !== false,
    showTaxId: row.show_tax_id !== false,
    showWebsite: row.show_website === true,
  };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "กรุณาเข้าสู่ระบบใหม่" } as const;
  }

  return { supabase, user } as const;
}

async function fetchCompanySettings(
  supabase: AuthenticatedClient,
): Promise<{ data: CompanySettingsData } | { error: string }> {
  const profileResult = await supabase
    .from("company_profiles")
    .select("*")
    .eq("is_default", true)
    .eq("status", "active")
    .maybeSingle();

  if (profileResult.error) {
    return { error: `ไม่สามารถโหลดข้อมูลบริษัทได้: ${profileResult.error.message}` };
  }
  if (!profileResult.data) {
    return { error: "ไม่พบข้อมูลบริษัทหลักของระบบ" };
  }

  const companyId = String(profileResult.data.id);
  const [branchesResult, documentResult, permissionResult] = await Promise.all([
    supabase
      .from("company_branches")
      .select("*")
      .eq("company_id", companyId)
      .order("is_head_office", { ascending: false })
      .order("branch_code"),
    supabase
      .from("company_document_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase.rpc("authorize", { requested_permission: "company.manage" }),
  ]);

  const error = branchesResult.error ?? documentResult.error ?? permissionResult.error;
  if (error) {
    return { error: `ไม่สามารถโหลดการตั้งค่าบริษัทได้: ${error.message}` };
  }

  const profile = mapProfile(
    profileResult.data as unknown as Record<string, unknown>,
  );

  return {
    data: {
      branding: createCompanyBranding({
        companyId: profile.id,
        darkLogoMode: profile.darkLogoMode,
        legalNameEn: profile.legalNameEn,
        legalNameTh: profile.legalNameTh,
        logoDarkPath: profile.logoDarkPath,
        logoLightPath: profile.logoLightPath,
        updatedAt: profile.updatedAt,
      }),
      branches: (
        (branchesResult.data ?? []) as unknown as Record<string, unknown>[]
      ).map(mapBranch),
      canManage: permissionResult.data === true,
      documentSettings: mapDocumentSettings(
        documentResult.data as unknown as Record<string, unknown> | null,
      ),
      profile,
    },
  };
}

export async function getCompanySettingsAction() {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth;
    return await fetchCompanySettings(auth.supabase);
  } catch (error) {
    console.error("getCompanySettingsAction error:", error);
    return { error: "ไม่สามารถโหลดข้อมูลบริษัทได้" };
  }
}

function validateLogo(file: FormDataEntryValue | null, label: string) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!LOGO_EXTENSIONS[file.type]) {
    return `${label}ต้องเป็นไฟล์ PNG, JPG หรือ WebP`;
  }
  if (file.size > MAX_LOGO_SIZE) {
    return `${label}ต้องมีขนาดไม่เกิน 2 MB`;
  }
  return null;
}

async function uploadLogo(
  supabase: AuthenticatedClient,
  companyId: string,
  file: File,
  variant: "dark" | "light",
) {
  const extension = LOGO_EXTENSIONS[file.type];
  const path = `${companyId}/${variant}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from(COMPANY_ASSET_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

  if (error) throw new Error(error.message);
  return path;
}

export async function saveCompanySettingsAction(formData: FormData) {
  const lightLogo = formData.get("logoLight");
  const darkLogo = formData.get("logoDark");
  const lightLogoError = validateLogo(lightLogo, "โลโก้หลัก");
  const darkLogoError = validateLogo(darkLogo, "โลโก้โหมดมืด");
  if (lightLogoError || darkLogoError) {
    return { error: lightLogoError ?? darkLogoError };
  }

  const legalNameTh = textValue(formData, "legalNameTh");
  const taxId = textValue(formData, "taxId").replace(/\D/g, "");
  const branchType =
    textValue(formData, "branchType") === "branch"
      ? "branch"
      : "head_office";
  const branchCode =
    branchType === "head_office"
      ? "00000"
      : textValue(formData, "branchCode").replace(/\D/g, "");
  const province = textValue(formData, "province");
  const district = textValue(formData, "district");
  const subdistrict = textValue(formData, "subdistrict");
  const hasAddressRegion = Boolean(province || district || subdistrict);
  const postalCode =
    province && district && subdistrict
      ? getThaiPostalCode(province, district, subdistrict)
      : "";
  const email = textValue(formData, "email").toLowerCase();

  if (legalNameTh.length < 2 || legalNameTh.length > 200) {
    return { error: "กรุณาระบุชื่อบริษัทภาษาไทยให้ถูกต้อง" };
  }
  if (taxId && taxId.length !== 13) {
    return { error: "เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก" };
  }
  if (!/^\d{5}$/.test(branchCode)) {
    return { error: "รหัสสาขาต้องมี 5 หลัก" };
  }
  if (
    hasAddressRegion &&
    (!province || !district || !subdistrict || !postalCode)
  ) {
    return { error: "กรุณาเลือกจังหวัด อำเภอ/เขต และตำบล/แขวงให้ครบถ้วน" };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
  }

  const companyId = textValue(formData, "companyId");
  if (!companyId) return { error: "ไม่พบรหัสบริษัท" };

  const darkLogoMode =
    textValue(formData, "darkLogoMode") === "custom" ? "custom" : "auto";
  const uploadedPaths: string[] = [];

  try {
    const auth = await requireUser();
    if ("error" in auth) return auth;

    const permissionResult = await auth.supabase.rpc("authorize", {
      requested_permission: "company.manage",
    });
    if (permissionResult.error || permissionResult.data !== true) {
      return { error: "คุณไม่มีสิทธิ์แก้ไขข้อมูลบริษัท" };
    }

    let lightLogoPath: string | null = null;
    let darkLogoPath: string | null = null;

    if (lightLogo instanceof File && lightLogo.size > 0) {
      lightLogoPath = await uploadLogo(
        auth.supabase,
        companyId,
        lightLogo,
        "light",
      );
      uploadedPaths.push(lightLogoPath);
    }

    if (
      darkLogoMode === "custom" &&
      darkLogo instanceof File &&
      darkLogo.size > 0
    ) {
      darkLogoPath = await uploadLogo(
        auth.supabase,
        companyId,
        darkLogo,
        "dark",
      );
      uploadedPaths.push(darkLogoPath);
    }

    const { error } = await auth.supabase.rpc("save_company_settings", {
      p_company_id: companyId,
      p_document_settings: {
        footerTextEn: textValue(formData, "footerTextEn"),
        footerTextTh: textValue(formData, "footerTextTh"),
        headerStyle:
          textValue(formData, "headerStyle") === "standard"
            ? "standard"
            : "compact",
        headerFieldOrder: normalizeCompanyHeaderFieldOrder(
          textValue(formData, "headerFieldOrder").split(","),
        ),
        logoWidthMm: Number(textValue(formData, "logoWidthMm") || 34),
        showAddress: booleanValue(formData, "showAddress"),
        showEmail: booleanValue(formData, "showEmail"),
        showPhone: booleanValue(formData, "showPhone"),
        showTaxId: booleanValue(formData, "showTaxId"),
        showWebsite: booleanValue(formData, "showWebsite"),
      },
      p_logo_dark_path: darkLogoPath,
      p_logo_light_path: lightLogoPath,
      p_profile: {
        addressLine: textValue(formData, "addressLine"),
        branchCode,
        branchType,
        darkLogoMode,
        district,
        email,
        legalNameEn: textValue(formData, "legalNameEn"),
        legalNameTh,
        phone: textValue(formData, "phone"),
        postalCode,
        province,
        subdistrict,
        taxId,
        website: textValue(formData, "website"),
      },
    });

    if (error) {
      if (uploadedPaths.length > 0) {
        await auth.supabase.storage
          .from(COMPANY_ASSET_BUCKET)
          .remove(uploadedPaths);
      }
      return { error: `ไม่สามารถบันทึกข้อมูลบริษัทได้: ${error.message}` };
    }

    revalidatePath("/", "layout");
    revalidatePath(SETTINGS_PATH);
    revalidateTag(COMPANY_BRANDING_CACHE_TAG, { expire: 0 });
    return { success: true as const };
  } catch (error) {
    console.error("saveCompanySettingsAction error:", error);
    return { error: "ไม่สามารถบันทึกข้อมูลบริษัทได้" };
  }
}
