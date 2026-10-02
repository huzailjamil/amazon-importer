import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const stores = await db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return <><header className="page-head"><div><span className="eyebrow">INTEGRATIONS</span><h1>Connected stores</h1><p>Shopify access tokens are encrypted on the server and never sent to your browser.</p></div></header>{query.connected && <div className="alert success-alert">Shopify store connected successfully.</div>}{query.error && <div className="alert danger">{query.error}</div>}<div className="store-grid"><section className="panel"><span className="eyebrow">CONNECT SHOPIFY</span><h2>Add a Shopify store</h2><p className="muted">Enter the permanent <strong>myshopify.com</strong> domain. Shopify will ask you to approve product permissions.</p><form action="/api/shopify/connect" method="get" className="connect-form"><input name="shop" placeholder="your-store.myshopify.com" required pattern="[a-zA-Z0-9-]+\.myshopify\.com" /><button className="button primary">Connect Shopify</button></form></section><section className="panel"><span className="eyebrow">YOUR STORES</span><h2>{stores.length} connected</h2>{stores.length ? <div className="store-list">{stores.map(s => <div className="store-item" key={s.id}><div className="store-icon">S</div><div><strong>{s.name}</strong><span>{s.domain}</span></div><span className="connected-dot">Connected</span></div>)}</div> : <div className="empty-mini">No Shopify stores connected yet.</div>}</section></div></>;
}
