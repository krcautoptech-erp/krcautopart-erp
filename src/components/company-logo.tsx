import Image from "next/image";
import type { CompanyBranding } from "@/lib/company-settings";

type CompanyLogoProps = {
  alt?: string;
  branding: CompanyBranding;
  className?: string;
  darkClassName?: string;
  mode?: "adaptive" | "light";
  priority?: boolean;
  size?: "compact" | "document" | "login" | "sidebar";
};

const SIZE_CLASSES = {
  compact: "w-[84px]",
  document: "w-[112px]",
  login: "w-[188px]",
  sidebar: "w-[110px]",
} as const;

export function CompanyLogo({
  alt,
  branding,
  className = "",
  darkClassName = "",
  mode = "adaptive",
  priority = false,
  size = "sidebar",
}: CompanyLogoProps) {
  const sizeClass = SIZE_CLASSES[size];
  const hasCustomDarkLogo =
    branding.darkLogoMode === "custom" && Boolean(branding.logoDarkUrl);
  const darkSource = hasCustomDarkLogo
    ? branding.logoDarkUrl!
    : branding.logoDarkUrl ?? branding.logoLightUrl;
  const autoDarkClass =
    hasCustomDarkLogo ? "" : "invert mix-blend-screen";

  if (mode === "light") {
    return (
      <Image
        alt={alt ?? branding.legalNameTh}
        className={`${sizeClass} h-auto object-contain ${className}`}
        height={800}
        priority={priority}
        src={branding.logoLightUrl}
        style={{ height: "auto" }}
        width={1400}
      />
    );
  }

  return (
    <>
      <Image
        alt={alt ?? branding.legalNameTh}
        className={`${sizeClass} h-auto object-contain dark:hidden ${className}`}
        height={800}
        priority={priority}
        src={branding.logoLightUrl}
        style={{ height: "auto" }}
        width={1400}
      />
      <Image
        alt={alt ?? branding.legalNameTh}
        className={`hidden ${sizeClass} h-auto object-contain dark:block ${autoDarkClass} ${className} ${darkClassName}`}
        height={800}
        priority={priority}
        src={darkSource}
        style={{ height: "auto" }}
        width={1400}
      />
    </>
  );
}
