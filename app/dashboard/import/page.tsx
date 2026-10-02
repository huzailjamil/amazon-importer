import ProductImporter from "@/components/ProductImporter";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export default async function ImportPage() {
  const user = await requireUser();
  const stores = await db.store.findMany({ where: { userId: user.id }, select: { id: true, name: true, domain: true }, orderBy: { createdAt: "desc" } });
  return <><header className="page-head"><div><span className="eyebrow">PRODUCT WORKSPACE</span><h1>Import & optimize</h1><p>Review every field before sending a product to a store.</p></div></header><ProductImporter stores={stores} /></>;
}
