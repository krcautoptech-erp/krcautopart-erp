export const COMPANY_ASSET_BUCKET = "company-assets";

export const COMPANY_HEADER_FIELDS = [
  "address",
  "taxId",
  "phone",
  "email",
  "website",
] as const;

export type CompanyHeaderField = (typeof COMPANY_HEADER_FIELDS)[number];

export type CompanyBranding = {
  companyId: string | null;
  darkLogoMode: "auto" | "custom";
  legalNameEn: string;
  legalNameTh: string;
  logoDarkUrl: string | null;
  logoLightUrl: string;
  logoVersion: string;
};

export type CompanyBranch = {
  addressLine: string;
  branchCode: string;
  branchName: string;
  district: string;
  email: string;
  id: string;
  isHeadOffice: boolean;
  isRegisteredAddress: boolean;
  phone: string;
  postalCode: string;
  province: string;
  status: "active" | "inactive";
  subdistrict: string;
};

export type CompanyDocumentSettings = {
  documentLogoUrl?: string;
  footerTextEn: string;
  footerTextTh: string;
  headerFieldOrder: CompanyHeaderField[];
  headerStyle: "compact" | "standard";
  logoWidthMm: number;
  showAddress: boolean;
  showEmail: boolean;
  showPhone: boolean;
  showTaxId: boolean;
  showWebsite: boolean;
};

export type CompanyDocumentContext = {
  branding: CompanyBranding;
  company: {
    address: string;
    branchCode: string;
    branchType: "branch" | "head_office";
    email: string;
    phone: string;
    taxId: string;
    website: string;
  };
  documentSettings: CompanyDocumentSettings;
};

export type CompanyProfile = {
  addressLine: string;
  branchCode: string;
  branchType: "branch" | "head_office";
  companyCode: string;
  darkLogoMode: "auto" | "custom";
  district: string;
  email: string;
  id: string;
  legalNameEn: string;
  legalNameTh: string;
  logoDarkPath: string | null;
  logoDarkUrl: string | null;
  logoLightPath: string | null;
  logoLightUrl: string;
  phone: string;
  postalCode: string;
  province: string;
  status: "active" | "inactive";
  subdistrict: string;
  taxId: string;
  updatedAt: string;
  website: string;
};

export type CompanySettingsData = {
  branding: CompanyBranding;
  branches: CompanyBranch[];
  canManage: boolean;
  documentSettings: CompanyDocumentSettings;
  profile: CompanyProfile;
};

export const DEFAULT_COMPANY_BRANDING: CompanyBranding = {
  companyId: null,
  darkLogoMode: "auto",
  legalNameEn: "K.R.C. AUTOPART CO., LTD.",
  legalNameTh: "บริษัท เค.อาร์.ซี. ออโต้พาร์ท จำกัด",
  logoDarkUrl: "/logo/origin-clean.png",
  logoLightUrl: "/logo/origin-clean.png",
  logoVersion: "default",
};

export const DEFAULT_DOCUMENT_SETTINGS: CompanyDocumentSettings = {
  documentLogoUrl: DEFAULT_COMPANY_BRANDING.logoLightUrl,
  footerTextEn: "",
  footerTextTh: "เอกสารจากระบบ KRC ERP",
  headerFieldOrder: [...COMPANY_HEADER_FIELDS],
  headerStyle: "compact",
  logoWidthMm: 34,
  showAddress: true,
  showEmail: true,
  showPhone: true,
  showTaxId: true,
  showWebsite: false,
};

export function normalizeCompanyHeaderFieldOrder(
  value: unknown,
): CompanyHeaderField[] {
  if (!Array.isArray(value)) return [...COMPANY_HEADER_FIELDS];

  const validFields = value.filter(
    (field): field is CompanyHeaderField =>
      typeof field === "string" &&
      COMPANY_HEADER_FIELDS.includes(field as CompanyHeaderField),
  );
  const uniqueFields = [...new Set(validFields)];

  return [
    ...uniqueFields,
    ...COMPANY_HEADER_FIELDS.filter((field) => !uniqueFields.includes(field)),
  ];
}

export function getCompanyAssetUrl(path: string | null | undefined) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl || !path) return null;

  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${baseUrl}/storage/v1/object/public/${COMPANY_ASSET_BUCKET}/${encodedPath}`;
}

export function getDocumentBranding(context: Pick<CompanyDocumentContext, "branding" | "documentSettings">): CompanyBranding {
  // Older document snapshots keep the logo captured before separate document branding existed.
  return { ...context.branding, logoLightUrl: context.documentSettings.documentLogoUrl ?? context.branding.logoLightUrl };
}

const WINDOWS_1252_BYTES = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

function mojibakeScore(value: string) {
  return (value.match(/(?:Ã|Â|à¸|à¹|â€|ï¿½|�)/g) ?? []).length;
}

function decodeLegacyUtf8Once(value: string) {
  const bytes: number[] = [];

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return value;

    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }

    const mappedByte = WINDOWS_1252_BYTES.get(codePoint);
    if (mappedByte === undefined) return value;
    bytes.push(mappedByte);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(bytes),
    );
  } catch {
    return value;
  }
}

export function normalizeLegacyUtf8Text(value: string) {
  let normalized = value;

  for (let pass = 0; pass < 2; pass += 1) {
    const decoded = decodeLegacyUtf8Once(normalized);
    if (decoded === normalized || mojibakeScore(decoded) >= mojibakeScore(normalized)) {
      break;
    }
    normalized = decoded;
  }

  return normalized;
}

export function createCompanyBranding(
  input: {
    companyId?: string | null;
    darkLogoMode?: string | null;
    legalNameEn?: string | null;
    legalNameTh?: string | null;
    logoDarkPath?: string | null;
    logoLightPath?: string | null;
    updatedAt?: string | null;
  } | null,
): CompanyBranding {
  if (!input) return DEFAULT_COMPANY_BRANDING;

  const uploadedLightUrl = getCompanyAssetUrl(input.logoLightPath);
  const lightUrl = uploadedLightUrl ?? DEFAULT_COMPANY_BRANDING.logoLightUrl;
  const darkUrl =
    getCompanyAssetUrl(input.logoDarkPath) ??
    (uploadedLightUrl ? null : DEFAULT_COMPANY_BRANDING.logoDarkUrl);

  return {
    companyId: input.companyId ?? null,
    darkLogoMode:
      input.darkLogoMode === "custom" ? "custom" : "auto",
    legalNameEn:
      normalizeLegacyUtf8Text(input.legalNameEn?.trim() ?? "") ||
      DEFAULT_COMPANY_BRANDING.legalNameEn,
    legalNameTh:
      normalizeLegacyUtf8Text(input.legalNameTh?.trim() ?? "") ||
      DEFAULT_COMPANY_BRANDING.legalNameTh,
    logoDarkUrl: darkUrl,
    logoLightUrl: lightUrl,
    logoVersion: input.updatedAt ?? "default",
  };
}

export function formatCompanyAddress(profile: CompanyProfile) {
  return [
    profile.addressLine,
    profile.subdistrict ? `ตำบล/แขวง ${profile.subdistrict}` : "",
    profile.district ? `อำเภอ/เขต ${profile.district}` : "",
    profile.province ? `จังหวัด ${profile.province}` : "",
    profile.postalCode,
  ]
    .filter(Boolean)
    .join(" ");
}
