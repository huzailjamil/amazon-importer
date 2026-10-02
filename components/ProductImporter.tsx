"use client";

import { useMemo, useState } from "react";

type Facts = { sourceUrl?: string; title?: string; description?: string; brand?: string; sku?: string; price?: string; currency?: string; images?: string[] };
type Product = { title: string; descriptionHtml: string; seoTitle: string; metaDescription: string; tags: string[]; primaryKeyword: string; secondaryKeywords: string[]; imageAltText: string[]; seoScore: number };
type Store = { id: string; name: string; domain: string };

const blank: Product = { title: "", descriptionHtml: "", seoTitle: "", metaDescription: "", tags: [], primaryKeyword: "", secondaryKeywords: [], imageAltText: [], seoScore: 0 };

export default function ProductImporter({ stores }: { stores: Store[] }) {
  const [url, setUrl] = useState("");
  const [facts, setFacts] = useState<Facts>({});
  const [product, setProduct] = useState<Product>(blank);
  const [selectedStore, setSelectedStore] = useState(stores[0]?.id || "");
  const [savedId, setSavedId] = useState("");
  const [busy, setBusy] = useState<"" | "import" | "ai" | "save" | "publish">("");
  const [message, setMessage] = useState("Paste an authorized product page URL, or enter facts manually.");
  const tagsText = useMemo(() => product.tags.join(", "), [product.tags]);

  async function importUrl() {
    setBusy("import"); setMessage("Reading product page…");
    try {
      const res = await fetch("/api/import/url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      setFacts(json.productFacts);
      setProduct(p => ({ ...p, title: json.productFacts.title || p.title, descriptionHtml: json.productFacts.description || p.descriptionHtml }));
      setMessage("Product facts imported. Review them, then run AI optimization.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(""); }
  }

  async function optimize() {
    setBusy("ai"); setMessage("Generating original SEO content…");
    try {
      const sourceFacts = { ...facts, sourceUrl: url || facts.sourceUrl, title: facts.title || product.title, description: facts.description || product.descriptionHtml };
      const res = await fetch("/api/ai/optimize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productFacts: sourceFacts, profile: { market: "default", language: "English", tone: "clear ecommerce" } }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Optimization failed");
      setProduct(json.product);
      setMessage("AI optimization complete. Review before saving or publishing.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Optimization failed"); }
    finally { setBusy(""); }
  }

  async function saveDraft() {
    setBusy("save"); setMessage("Saving draft…");
    try {
      const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        sourceUrl: url,
        title: product.title,
        descriptionHtml: product.descriptionHtml,
        vendor: facts.brand || "",
        productType: "",
        seoTitle: product.seoTitle,
        metaDescription: product.metaDescription,
        primaryKeyword: product.primaryKeyword,
        tags: product.tags,
        secondaryKeywords: product.secondaryKeywords,
        imageAltText: product.imageAltText,
        images: facts.images || [],
        seoScore: product.seoScore
      }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSavedId(json.product.id);
      setMessage("Draft saved securely to your account.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(""); }
  }

  async function publish() {
    if (!savedId) { setMessage("Save the product draft first."); return; }
    if (!selectedStore) { setMessage("Connect a Shopify store first."); return; }
    setBusy("publish"); setMessage("Creating Shopify draft…");
    try {
      const res = await fetch("/api/shopify/publish-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: savedId, storeId: selectedStore }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Publish failed");
      setMessage(`Shopify draft created: ${json.product.title}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Publish failed"); }
    finally { setBusy(""); }
  }

  return (
    <div className="workspace-grid">
      <section className="panel large-panel">
        <div className="panel-head"><div><span className="eyebrow">STEP 1</span><h2>Import product facts</h2><p>Paste an Amazon or supplier product page URL. The importer will extract available public product facts for review.</p></div></div>
        <div className="url-row"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://supplier.example.com/product/..." /><button className="button secondary" onClick={importUrl} disabled={!url || !!busy}>{busy === "import" ? "Importing…" : "Import URL"}</button></div>
        <div className="two-col">
          <label className="form-field"><span>Source title</span><input value={facts.title || ""} onChange={e => setFacts({ ...facts, title: e.target.value })} placeholder="Original product title" /></label>
          <label className="form-field"><span>Brand / vendor</span><input value={facts.brand || ""} onChange={e => setFacts({ ...facts, brand: e.target.value })} placeholder="Brand" /></label>
        </div>
        <label className="form-field"><span>Source description / facts</span><textarea rows={7} value={facts.description || ""} onChange={e => setFacts({ ...facts, description: e.target.value })} placeholder="Paste accurate product facts here if URL import is unavailable." /></label>
        <div className="section-divider" />
        <div className="panel-head"><div><span className="eyebrow">STEP 2</span><h2>AI SEO rewrite</h2><p>Creates original copy while preserving factual attributes.</p></div><button className="button primary" onClick={optimize} disabled={!!busy || !(facts.title || product.title)}>{busy === "ai" ? "Generating…" : "Generate with AI"}</button></div>
        <label className="form-field"><span>SEO product title</span><input value={product.title} onChange={e => setProduct({ ...product, title: e.target.value })} /></label>
        <label className="form-field"><span>Description HTML</span><textarea rows={11} value={product.descriptionHtml} onChange={e => setProduct({ ...product, descriptionHtml: e.target.value })} /></label>
        <div className="two-col">
          <label className="form-field"><span>Meta title</span><input value={product.seoTitle} onChange={e => setProduct({ ...product, seoTitle: e.target.value })} /></label>
          <label className="form-field"><span>Primary keyword</span><input value={product.primaryKeyword} onChange={e => setProduct({ ...product, primaryKeyword: e.target.value })} /></label>
        </div>
        <label className="form-field"><span>Meta description</span><textarea rows={4} value={product.metaDescription} onChange={e => setProduct({ ...product, metaDescription: e.target.value })} /></label>
      </section>

      <aside className="panel sticky-panel">
        <div className="score-card"><div className="score-circle">{product.seoScore || "–"}</div><div><span className="eyebrow">SEO SCORE</span><strong>{product.seoScore ? "Ready for review" : "Not generated yet"}</strong></div></div>
        <label className="form-field"><span>Shopify tags</span><textarea rows={4} value={tagsText} onChange={e => setProduct({ ...product, tags: e.target.value.split(",").map(v => v.trim()).filter(Boolean) })} /></label>
        <div className="mini-section"><span>Secondary keywords</span><div className="chips">{product.secondaryKeywords.map(k => <span key={k}>{k}</span>)}{!product.secondaryKeywords.length && <em>Generated after AI optimization</em>}</div></div>
        <div className="mini-section"><span>ALT text suggestions</span><div className="chips">{product.imageAltText.map(k => <span key={k}>{k}</span>)}{!product.imageAltText.length && <em>Generated after AI optimization</em>}</div></div>
        <div className="section-divider" />
        <label className="form-field"><span>Destination store</span><select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}><option value="">Select a connected store</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name} — {s.domain}</option>)}</select></label>
        <button className="button secondary wide" onClick={saveDraft} disabled={!!busy || !product.title}>{busy === "save" ? "Saving…" : savedId ? "Save another draft" : "Save draft"}</button>
        <button className="button success wide" onClick={publish} disabled={!!busy || !savedId || !selectedStore}>{busy === "publish" ? "Publishing…" : "Send to Shopify as Draft"}</button>
        <div className="status-box">{message}</div>
      </aside>
    </div>
  );
}
