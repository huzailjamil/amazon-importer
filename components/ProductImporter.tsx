"use client";

import { useEffect, useMemo, useState } from "react";

type VariationOption = { value: string; asin?: string; available?: boolean; selected?: boolean };
type Variation = { name: string; selected?: string; options: VariationOption[] };
type ProductVideo = { url: string; poster?: string };
type Facts = {
  sourceUrl?: string; title?: string; description?: string; brand?: string; sku?: string;
  price?: string; currency?: string; images?: string[]; videos?: ProductVideo[]; features?: string[];
  specifications?: Record<string, string>; categories?: string[]; tags?: string[]; productType?: string;
  variations?: Variation[]; availability?: string; rating?: string; reviewCount?: string;
};
type Product = { title: string; descriptionHtml: string; seoTitle: string; metaDescription: string; tags: string[]; primaryKeyword: string; secondaryKeywords: string[]; imageAltText: string[]; seoScore: number };
type Store = { id: string; name: string; domain: string };

const blank: Product = { title: "", descriptionHtml: "", seoTitle: "", metaDescription: "", tags: [], primaryKeyword: "", secondaryKeywords: [], imageAltText: [], seoScore: 0 };

function normalizeFacts(parsed: Facts): Facts {
  if (!parsed.title || typeof parsed.title !== "string") throw new Error("Copied product data does not contain a title");
  return {
    sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : "",
    title: parsed.title,
    description: typeof parsed.description === "string" ? parsed.description : "",
    brand: typeof parsed.brand === "string" ? parsed.brand : "",
    sku: typeof parsed.sku === "string" ? parsed.sku : "",
    price: typeof parsed.price === "string" ? parsed.price : "",
    currency: typeof parsed.currency === "string" ? parsed.currency : "",
    images: Array.isArray(parsed.images) ? parsed.images.filter(value => typeof value === "string").slice(0, 20) : [],
    videos: Array.isArray(parsed.videos) ? parsed.videos.filter(video => video && typeof video.url === "string").slice(0, 12) : [],
    features: Array.isArray(parsed.features) ? parsed.features.filter(value => typeof value === "string").slice(0, 50) : [],
    specifications: parsed.specifications && typeof parsed.specifications === "object" ? parsed.specifications : {},
    categories: Array.isArray(parsed.categories) ? parsed.categories.filter(value => typeof value === "string").slice(0, 20) : [],
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter(value => typeof value === "string").slice(0, 30) : [],
    productType: typeof parsed.productType === "string" ? parsed.productType : "",
    variations: Array.isArray(parsed.variations) ? parsed.variations.filter(item => item && typeof item.name === "string" && Array.isArray(item.options)).slice(0, 3) : [],
    availability: typeof parsed.availability === "string" ? parsed.availability : "",
    rating: typeof parsed.rating === "string" ? parsed.rating : "",
    reviewCount: typeof parsed.reviewCount === "string" ? parsed.reviewCount : ""
  };
}

export default function ProductImporter({ stores }: { stores: Store[] }) {
  const [url, setUrl] = useState("");
  const [facts, setFacts] = useState<Facts>({});
  const [product, setProduct] = useState<Product>(blank);
  const [selectedStore, setSelectedStore] = useState(stores[0]?.id || "");
  const [savedId, setSavedId] = useState("");
  const [browserData, setBrowserData] = useState("");
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [busy, setBusy] = useState<"" | "import" | "ai" | "save" | "publish">("");
  const [message, setMessage] = useState("Paste an authorized product page URL, or enter facts manually.");
  const tagsText = useMemo(() => product.tags.join(", "), [product.tags]);

  function loadFacts(imported: Facts, fromExtension = false) {
    setFacts(imported);
    if (imported.sourceUrl) setUrl(imported.sourceUrl);
    setProduct(current => ({
      ...current,
      title: imported.title || current.title,
      descriptionHtml: imported.description || current.descriptionHtml,
      tags: imported.tags?.length ? imported.tags : current.tags
    }));
    setShowDraftPrompt(fromExtension);
    setMessage(`${fromExtension ? "Extension" : "Browser"} product data loaded with ${imported.images?.length || 0} images, ${imported.videos?.length || 0} videos and ${imported.variations?.length || 0} variation groups.`);
  }

  useEffect(() => {
    function receiveExtensionProduct(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.source !== "product-importer-extension" || event.data?.type !== "AMAZON_PRODUCT" || typeof event.data.payload !== "string") return;
      try {
        if (event.data.payload.length > 2_000_000) throw new Error("Extension product data is too large");
        loadFacts(normalizeFacts(JSON.parse(event.data.payload) as Facts), true);
        window.postMessage({ source: "product-importer-dashboard", type: "AMAZON_PRODUCT_ACCEPTED", id: event.data.id }, window.location.origin);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not load extension product data");
      }
    }
    window.addEventListener("message", receiveExtensionProduct);
    return () => window.removeEventListener("message", receiveExtensionProduct);
  }, []);

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

  function importBrowserData() {
    try {
      loadFacts(normalizeFacts(JSON.parse(browserData) as Facts));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read copied browser data");
    }
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
        sourceExternalId: facts.sku || "",
        title: product.title,
        descriptionHtml: product.descriptionHtml,
        vendor: facts.brand || "",
        productType: facts.productType || "",
        seoTitle: product.seoTitle,
        metaDescription: product.metaDescription,
        primaryKeyword: product.primaryKeyword,
        tags: product.tags.length ? product.tags : facts.tags || [],
        secondaryKeywords: product.secondaryKeywords,
        imageAltText: product.imageAltText,
        images: facts.images || [],
        rawData: facts,
        seoScore: product.seoScore
      }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSavedId(json.product.id);
      setShowDraftPrompt(false);
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
        <details className="browser-import">
          <summary>Amazon returned a CAPTCHA? Import from the browser helper</summary>
          <p>Open the product in Amazon, use the Product Importer browser helper, then paste the copied data below.</p>
          <textarea rows={4} value={browserData} onChange={event => setBrowserData(event.target.value)} placeholder='Paste copied product data here…' />
          <button className="button secondary" type="button" onClick={importBrowserData} disabled={!browserData.trim()}>Load copied product</button>
        </details>
        {showDraftPrompt && <div className="draft-prompt"><div><strong>Product received from the extension</strong><p>Would you like to save it as a local draft now, or review and optimize it first?</p></div><div><button className="button success" type="button" onClick={saveDraft} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save as draft"}</button><button className="button secondary" type="button" onClick={() => setShowDraftPrompt(false)}>Review first</button></div></div>}
        <div className="two-col">
          <label className="form-field"><span>Source title</span><input value={facts.title || ""} onChange={e => setFacts({ ...facts, title: e.target.value })} placeholder="Original product title" /></label>
          <label className="form-field"><span>Brand / vendor</span><input value={facts.brand || ""} onChange={e => setFacts({ ...facts, brand: e.target.value })} placeholder="Brand" /></label>
        </div>
        <label className="form-field"><span>Source description / facts</span><textarea rows={7} value={facts.description || ""} onChange={e => setFacts({ ...facts, description: e.target.value })} placeholder="Paste accurate product facts here if URL import is unavailable." /></label>
        <div className="fact-summary">
          <div><span>ASIN / SKU</span><strong>{facts.sku || "—"}</strong></div>
          <div><span>Price</span><strong>{facts.price ? `${facts.currency || ""} ${facts.price}`.trim() : "—"}</strong></div>
          <div><span>Availability</span><strong>{facts.availability || "—"}</strong></div>
          <div><span>Rating</span><strong>{[facts.rating, facts.reviewCount].filter(Boolean).join(" · ") || "—"}</strong></div>
        </div>
        {!!facts.categories?.length && <div className="mini-section"><span>Amazon categories</span><div className="breadcrumb-list">{facts.categories.join(" › ")}</div></div>}
        {!!facts.tags?.length && <div className="mini-section"><span>Source tags</span><div className="chips">{facts.tags.map(tag => <span key={tag}>{tag}</span>)}</div></div>}
        {!!Object.keys(facts.specifications || {}).length && <div className="mini-section"><span>Specifications ({Object.keys(facts.specifications || {}).length})</span><div className="spec-grid">{Object.entries(facts.specifications || {}).map(([key, value]) => <div key={key}><strong>{key}</strong><span>{value}</span></div>)}</div></div>}
        {!!facts.variations?.length && <div className="mini-section"><span>Variations ({facts.variations.length})</span><div className="variation-list">{facts.variations.map(variation => <div key={variation.name}><strong>{variation.name}{variation.selected ? `: ${variation.selected}` : ""}</strong><div className="chips">{variation.options.map(option => <span className={option.available === false ? "unavailable" : option.selected ? "selected" : ""} key={`${variation.name}-${option.value}`}>{option.value}{option.asin ? ` · ${option.asin}` : ""}</span>)}</div></div>)}</div></div>}
        <div className="mini-section">
          <span>Extracted images ({facts.images?.length || 0})</span>
          {facts.images?.length ? <div className="product-image-grid">{facts.images.map((image, index) => <div className="product-image" key={image}><img src={image} alt={`Extracted product image ${index + 1}`} /><button type="button" onClick={() => setFacts({ ...facts, images: facts.images?.filter(item => item !== image) })}>Remove</button></div>)}</div> : <div className="image-empty">Images found on the product page will appear here.</div>}
        </div>
        <div className="mini-section"><span>Extracted videos ({facts.videos?.length || 0})</span>{facts.videos?.length ? <div className="product-video-grid">{facts.videos.map(video => <video key={video.url} controls preload="metadata" poster={video.poster || undefined} src={video.url} />)}</div> : <div className="image-empty">Product videos found on the loaded Amazon page will appear here.</div>}</div>
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
