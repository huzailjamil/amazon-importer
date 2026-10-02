import * as cheerio from "cheerio";
import dns from "dns/promises";
import net from "net";

const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:");
}

async function assertSafeUrl(raw: string) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http/https URLs are supported");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) throw new Error("Private/internal network URLs are not allowed");
  return url;
}

async function fetchSafe(startUrl: URL) {
  let current = startUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    current = await assertSafeUrl(current.toString());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 ProductImporter/2.0 (+authorized ecommerce content import)" }
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) throw new Error("Source redirect had no destination");
        current = new URL(location, current);
        continue;
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many redirects from source URL");
}

async function readLimitedText(res: Response) {
  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > MAX_HTML_BYTES) throw new Error("Source page is too large to import safely");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("Source page exceeded the safe import size limit");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function findProductJsonLd($: cheerio.CheerioAPI) {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const parsed = JSON.parse($(el).text());
      const candidates = Array.isArray(parsed) ? parsed : parsed?.["@graph"] ? parsed["@graph"] : [parsed];
      const product = candidates.find((x: any) => x?.["@type"] === "Product" || (Array.isArray(x?.["@type"]) && x["@type"].includes("Product")));
      if (product) return product;
    } catch {}
  }
  return null;
}

export async function importFromUrl(rawUrl: string) {
  const url = await assertSafeUrl(rawUrl);
  if (/amazon\./i.test(url.hostname)) {
    throw new Error("Direct Amazon page scraping is not enabled. Use an authorized Amazon API/feed or enter the product facts manually, then use AI optimization.");
  }
  const res = await fetchSafe(url);
  if (!res.ok) throw new Error(`Source returned HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) throw new Error("Source did not return an HTML page");
  const html = await readLimitedText(res);
  const $ = cheerio.load(html);
  const ld: any = findProductJsonLd($);
  const title = ld?.name || $('meta[property="og:title"]').attr("content") || $("title").text().trim();
  const description = ld?.description || $('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content") || "";
  const imageRaw = ld?.image || $('meta[property="og:image"]').attr("content");
  const images = (Array.isArray(imageRaw) ? imageRaw : imageRaw ? [imageRaw] : []).map((x: any) => typeof x === "string" ? x : x?.url).filter(Boolean).slice(0, 12);
  const brand = typeof ld?.brand === "string" ? ld.brand : ld?.brand?.name;
  const sku = ld?.sku || ld?.mpn || "";
  const offers = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;
  return {
    sourceUrl: url.toString(),
    title: String(title || "").trim(),
    description: String(description || "").trim(),
    brand: brand ? String(brand) : "",
    sku: sku ? String(sku) : "",
    price: offers?.price ? String(offers.price) : "",
    currency: offers?.priceCurrency ? String(offers.priceCurrency) : "",
    images
  };
}
