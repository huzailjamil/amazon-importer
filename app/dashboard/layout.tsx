import Sidebar from "@/components/Sidebar";
import { requireUser } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <div className="app-shell"><Sidebar user={user} /><main className="content-shell">{children}</main></div>;
}
