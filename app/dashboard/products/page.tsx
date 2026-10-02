import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export default async function ProductsPage() {
  const user = await requireUser();
  const products = await db.product.findMany({ where: { userId: user.id }, include: { store: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return <><header className="page-head"><div><span className="eyebrow">CATALOGUE</span><h1>Your product drafts</h1><p>Only products owned by your account are shown here.</p></div></header><section className="panel dashboard-panel">{products.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>Source</th><th>Store</th><th>Status</th><th>SEO</th><th>Updated</th></tr></thead><tbody>{products.map(p => <tr key={p.id}><td><strong>{p.title}</strong><small>{p.primaryKeyword || "No keyword yet"}</small></td><td>{p.sourceType}</td><td>{p.store?.name || "—"}</td><td><span className="status-pill">{p.status.replaceAll("_", " ")}</span></td><td>{p.seoScore ?? "–"}</td><td>{p.updatedAt.toLocaleDateString()}</td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>No products saved</h3><p>Your saved drafts will appear here.</p></div>}</section></>;
}
