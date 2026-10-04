import { ReportWorkspace } from "./report-workspace";

export default function ReportsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ReportWorkspace>{children}</ReportWorkspace>;
}
