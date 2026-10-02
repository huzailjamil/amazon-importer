import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default function Sidebar({ user, admin = false }: { user: { name: string; email: string; role: string }; admin?: boolean }) {
  return (
    <aside className="sidebar">
      <div className="brand-wrap"><div className="brand-mark">PI</div><div><div className="brand-title">Product Importer</div><div className="brand-sub">AI commerce workspace</div></div></div>
      <nav className="sidebar-nav">
        {admin ? (
          <>
            <Link href="/admin">Overview</Link>
            <Link href="/dashboard">User dashboard</Link>
          </>
        ) : (
          <>
            <Link href="/dashboard">Overview</Link>
            <Link href="/dashboard/import">Import product</Link>
            <Link href="/dashboard/products">Products</Link>
            <Link href="/dashboard/stores">Stores</Link>
            <Link href="/dashboard/settings">Settings</Link>
            {user.role === "ADMIN" && <Link href="/admin">Admin</Link>}
          </>
        )}
      </nav>
      <div className="sidebar-footer">
        <div className="user-chip"><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><div className="user-copy"><strong>{user.name}</strong><span>{user.email}</span></div></div>
        <LogoutButton />
      </div>
    </aside>
  );
}
