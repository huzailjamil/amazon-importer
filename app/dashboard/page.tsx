import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export default async function DashboardPage() {
  const user = await requireUser();
  const [productCount, storeCount, publishedCount, latest] = await Promise.all([
    db.product.count({ where: { userId: user.id } }),
    db.store.count({ where: { userId: user.id } }),
    db.product.count({ where: { userId: user.id, status: "SHOPIFY_DRAFT" } }),
    db.product.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 })
  ]);
  return (
    <>
      <header className="page-head"><div><span className="eyebrow">WORKSPACE</span><h1>Good to see you, {user.name.split(" ")[0]}</h1><p>Import, rewrite, review and publish products from one place.</p></div><Link className="button primary" href="/dashboard/import">+ Import product</Link></header>
      <section className="stat-grid">
        <div className="stat-card"><span>Total drafts</span><strong>{productCount}</strong><small>Saved in your account</small></div>
        <div className="stat-card"><span>Connected stores</span><strong>{storeCount}</strong><small>Shopify destinations</small></div>
        <div className="stat-card"><span>Shopify drafts</span><strong>{publishedCount}</strong><small>Sent to Shopify safely</small></div>
        <div className="stat-card accent"><span>Account</span><strong>{user.role}</strong><small>Protected workspace</small></div>
      </section>
      <section className="panel dashboard-panel">
        <div className="panel-head"><div><span className="eyebrow">RECENT PRODUCTS</span><h2>Latest drafts</h2></div><Link href="/dashboard/products">View all</Link></div>
        {latest.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>Status</th><th>SEO</th><th>Created</th></tr></thead><tbody>{latest.map(p => <tr key={p.id}><td><strong>{p.title}</strong><small>{p.sourceUrl || "Manual entry"}</small></td><td><span className="status-pill">{p.status.replaceAll("_", " ")}</span></td><td>{p.seoScore ?? "–"}</td><td>{p.createdAt.toLocaleDateString()}</td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>No product drafts yet</h3><p>Start by importing an authorized product page or entering product facts manually.</p><Link className="button primary" href="/dashboard/import">Import your first product</Link></div>}
      </section>
    </>
  );
}
