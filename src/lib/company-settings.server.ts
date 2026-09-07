import "server-only";

import {
  createCompanyBranding,
  DEFAULT_COMPANY_BRANDING,
  DEFAULT_DOCUMENT_SETTINGS,
  normalizeCompanyHeaderFieldOrder,
  type CompanyBranding,
  type CompanyDocumentContext,
} from "@/lib/company-settings";
import { createClient } from "@/utils/supabase/server";

type PublicBrandingRow = {
  company_id: string;
  dark_logo_mode: string | null;
  legal_name_en: string | null;
  legal_name_th: string | null;
  logo_dark_path: string | null;
  logo_light_path: string | null;
  logo_updated_at: string | null;
};

type CompanyDocumentRow = {
  address_line: string | null;
  branch_code: string | null;
  branch_type: string | null;
  company_document_settings:
    | {
        footer_text_en: string | null;
        footer_text_th: string | null;
        header_field_order: string[] | null;
        header_style: string | null;
        logo_width_mm: number | null;
        show_address: boolean | null;
        show_email: boolean | null;
        show_phone: boolean | null;
        show_tax_id: boolean | null;
        show_website: boolean | null;
      }
    | {
        footer_text_en: string | null;
        footer_text_th: string | null;
        header_field_order: string[] | null;
        header_style: string | null;
        logo_width_mm: number | null;
        show_address: boolean | null;
        show_email: boolean | null;
        show_phone: boolean | null;
        show_tax_id: boolean | null;
        show_website: boolean | null;
      }[]
    | null;
  dark_logo_mode: string | null;
  district: string | null;
  email: string | null;
  id: string;
  legal_name_en: string | null;
  legal_name_th: string | null;
  logo_dark_path: string | null;
  logo_light_path: string | null;
  phone: string | null;
  postal_code: string | null;
  province: string | null;
  subdistrict: string | null;
  tax_id: string | null;
  updated_at: string | null;
  website: string | null;
};

const DEFAULT_COMPANY_DOCUMENT_CONTEXT: CompanyDocumentContext = {
  branding: DEFAULT_COMPANY_BRANDING,
  company: {
    address: "",
    branchCode: "00000",
    branchType: "head_office",
    email: "",
    phone: "",
    taxId: "",
    website: "",
  },
  documentSettings: DEFAULT_DOCUMENT_SETTINGS,
};

function firstRelation<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function formatDocumentAddress(row: CompanyDocumentRow) {
  return [
    row.address_line,
    row.subdistrict ? `ตำบล/แขวง ${row.subdistrict}` : "",
    row.district ? `อำเภอ/เขต ${row.district}` : "",
    row.province ? `จังหวัด ${row.province}` : "",
    row.postal_code,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function getPublicCompanyBranding(): Promise<CompanyBranding> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_public_company_branding",
    );

    if (error) {
      console.error("Unable to load company branding:", error.message);
      return DEFAULT_COMPANY_BRANDING;
    }

    const row = (data?.[0] ?? null) as PublicBrandingRow | null;
    return createCompanyBranding(
      row
        ? {
            companyId: row.company_id,
            darkLogoMode: row.dark_logo_mode,
            legalNameEn: row.legal_name_en,
            legalNameTh: row.legal_name_th,
            logoDarkPath: row.logo_dark_path,
            logoLightPath: row.logo_light_path,
            updatedAt: row.logo_updated_at,
          }
        : null,
    );
  } catch (error) {
    console.error("Unable to load company branding:", error);
    return DEFAULT_COMPANY_BRANDING;
  }
}

export async function getCompanyDocumentContext(): Promise<CompanyDocumentContext> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("company_profiles")
      .select(
        `
          id,
          legal_name_th,
          legal_name_en,
          tax_id,
          branch_type,
          branch_code,
          address_line,
          subdistrict,
          district,
          province,
          postal_code,
          phone,
          email,
          website,
          logo_light_path,
          logo_dark_path,
          dark_logo_mode,
          updated_at,
          company_document_settings (
            header_style,
            logo_width_mm,
            footer_text_th,
            footer_text_en,
            header_field_order,
            show_tax_id,
            show_address,
            show_phone,
            show_email,
            show_website
          )
        `,
      )
      .eq("is_default", true)
      .eq("status", "active")
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.error("Unable to load company document settings:", error.message);
      }
      return DEFAULT_COMPANY_DOCUMENT_CONTEXT;
    }

    const row = data as unknown as CompanyDocumentRow;
    const settings = firstRelation(row.company_document_settings);
    const branding = createCompanyBranding({
      companyId: row.id,
      darkLogoMode: row.dark_logo_mode,
      legalNameEn: row.legal_name_en,
      legalNameTh: row.legal_name_th,
      logoDarkPath: row.logo_dark_path,
      logoLightPath: row.logo_light_path,
      updatedAt: row.updated_at,
    });

    return {
      branding,
      company: {
        address: formatDocumentAddress(row),
        branchCode: row.branch_code ?? "00000",
        branchType: row.branch_type === "branch" ? "branch" : "head_office",
        email: row.email ?? "",
        phone: row.phone ?? "",
        taxId: row.tax_id ?? "",
        website: row.website ?? "",
      },
      documentSettings: settings
        ? {
            footerTextEn: settings.footer_text_en ?? "",
            footerTextTh: settings.footer_text_th ?? "",
            headerFieldOrder: normalizeCompanyHeaderFieldOrder(
              settings.header_field_order,
            ),
            headerStyle:
              settings.header_style === "standard" ? "standard" : "compact",
            logoWidthMm: Number(settings.logo_width_mm ?? 34),
            showAddress: settings.show_address !== false,
            showEmail: settings.show_email !== false,
            showPhone: settings.show_phone !== false,
            showTaxId: settings.show_tax_id !== false,
            showWebsite: settings.show_website === true,
          }
        : DEFAULT_DOCUMENT_SETTINGS,
    };
  } catch (error) {
    console.error("Unable to load company document settings:", error);
    return DEFAULT_COMPANY_DOCUMENT_CONTEXT;
  }
}
