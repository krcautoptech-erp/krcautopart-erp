import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function ReportBackLink() {
  return <Link className="report-back-link inline-flex min-h-9 w-max items-center gap-1.5 text-[13px] font-bold text-secondary hover:text-primary" href="/reports"><ArrowLeft aria-hidden="true" size={17} />กลับศูนย์รวมรายงาน</Link>;
}
