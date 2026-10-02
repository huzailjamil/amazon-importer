import { requireUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const user = await requireUser();
  return <><header className="page-head"><div><span className="eyebrow">ACCOUNT</span><h1>Settings</h1><p>Account and workspace details.</p></div></header><section className="panel settings-card"><div className="setting-row"><span>Name</span><strong>{user.name}</strong></div><div className="setting-row"><span>Email</span><strong>{user.email}</strong></div><div className="setting-row"><span>Role</span><strong>{user.role}</strong></div><div className="setting-row"><span>Status</span><strong className="green-text">Active</strong></div></section></>;
}
