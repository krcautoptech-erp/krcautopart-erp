"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { CompanyLogo } from "@/components/company-logo";
import { useApp } from "@/components/app-context";
import { LoginForm } from "@/components/login-form";
import type { CompanyBranding } from "@/lib/company-settings";

const ErpHelpCenter = dynamic(
  () => import("@/components/erp-help-center").then((module) => module.ErpHelpCenter),
  { ssr: false },
);

export function LoginPageClient({
  branding,
}: {
  branding: CompanyBranding;
}) {
  const { toggleDarkMode, isDarkMode } = useApp();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:w-1/2">
        { }
        <img
          alt="Industrial Machinery"
          className="absolute inset-0 h-full w-full object-cover grayscale mix-blend-multiply opacity-50"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuBDmFaX-NMPImwOKKSDnLBBg2XnX5JFq198RO9vTdu3qn0z-XVCFmyk68V-RckeHW1zExrRkf1L35SDcHM8SF3JJfe0raUzVRlfWb0FH4imFblGjRh3yUf0YVMthjBS91HsPCz8qLFzP9bW39ArPXdImVmEVOvPs5VnQv0_1pGufRm4L_LZMIFKGHOEMT3F2HWbTeTDwS-qTmxZx11ber_L-QWZLJfJ0xOPwSNJKnU8nVSpfTQbgIrZ_zgE-VX-71tjLwf0Cp9GAci2"
        />
        <div className="absolute inset-0 bg-primary/40 dark:bg-primary/60" />
        <div className="relative z-10 flex w-full flex-col justify-between p-xl">
          <div />
          <div className="mb-20">
            <h1 className="max-w-lg text-[54px] font-bold leading-tight tracking-tight text-white drop-shadow-lg">
              Powering Industrial Excellence
            </h1>
            <div className="mt-lg h-1 w-24 bg-white" />
          </div>
          <div className="text-label-sm text-white/70">
            © 2026 {branding.legalNameTh}. All rights reserved.
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col overflow-y-auto bg-surface-container-lowest transition-colors duration-300 dark:bg-inverse-surface lg:w-1/2">
        <header className="flex items-center justify-between border-b border-surface-container-highest px-lg py-md dark:border-white/10">
          <div className="lg:hidden">
            <CompanyLogo branding={branding} priority size="sidebar" />
          </div>
          <div className="flex-grow" />
          <button
            aria-label="สลับโหมดสี"
            className="material-symbols-outlined cursor-pointer text-secondary transition-colors hover:text-primary dark:text-on-surface"
            onClick={toggleDarkMode}
            type="button"
          >
            {isDarkMode ? "light_mode" : "dark_mode"}
          </button>
          <button
            aria-label="เปิดคู่มือเข้าสู่ระบบ"
            className="material-symbols-outlined ml-md cursor-pointer text-secondary transition-colors hover:text-primary dark:text-on-surface"
            onClick={() => setIsHelpOpen(true)}
            type="button"
          >
            help
          </button>
        </header>

        <main className="flex flex-grow items-center justify-center p-gutter">
          <div className="w-full max-w-md px-md">
            <div className="mb-lg hidden lg:block">
              <CompanyLogo branding={branding} priority size="login" />
            </div>
            <div className="mb-xl">
              <h2 className="font-headline-xl text-headline-xl mb-xs text-on-surface dark:text-white">
                <span className="text-primary">Log</span>in
              </h2>
              <p className="font-body-lg text-secondary dark:text-secondary-fixed-dim">
                เข้าสู่ระบบ ERP ส่วนกลาง
              </p>
            </div>
            <LoginForm />
          </div>
        </main>

        <footer className="border-t border-surface-container-highest px-lg py-md text-center dark:border-white/10 lg:hidden">
          <span className="text-label-sm text-secondary">
            © 2026 {branding.legalNameTh}
          </span>
        </footer>
      </div>
      {isHelpOpen ? (
        <ErpHelpCenter
          guideIds={["login"]}
          onClose={() => setIsHelpOpen(false)}
          pathname="/login"
          permissionCodes={[]}
        />
      ) : null}
    </div>
  );
}
