import Sidebar from "@/components/Sidebar";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <div className="app-shell"><Sidebar user={user} admin /><main className="content-shell">{children}</main></div>;
}
