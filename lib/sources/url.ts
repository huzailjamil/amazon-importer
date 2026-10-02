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

function isAmazonHost(hostname: string) {
  return /(^|\.)amazon\.(com|ca|de|es|fr|it|nl|pl|se|co\.uk|com\.au|com\.br|com\.mx|co\.jp|in|sg|ae|sa|com\.tr|eg|com\.be)$/i.test(hostname);
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
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache"
        }
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) throw new Error("Source redirect had no destination");
        current = new URL(location, current);
        continue;
      }
      return { res, finalUrl: current };
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

function cleanText(value: string | undefined | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstText($: cheerio.CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const value = cleanText($(selector).first().text());
    if (value) return value;
  }
  return "";
}

function currencyFromPrice(price: string, hostname: string) {
  if (price.includes("£")) return "GBP";
  if (price.includes("€")) return "EUR";
  if (price.includes("₹")) return "INR";
  if (price.includes("¥") || price.includes("￥")) return hostname.endsWith(".co.jp") ? "JPY" : "CNY";
  if (price.includes("د.إ")) return "AED";
  if (price.includes("﷼") || price.includes("ر.س")) return "SAR";
  if (price.includes("C$") || hostname.endsWith(".ca")) return "CAD";
  if (price.includes("A$") || hostname.endsWith(".com.au")) return "AUD";
  if (price.includes("$")) return "USD";
  return "";
}

function normalizePrice(value: string) {
  const match = value.replace(/\s+/g, " ").match(/[\d.,]+/);
  return match ? match[0] : "";
}

function amazonAsin(url: URL, $: cheerio.CheerioAPI) {
  const fromPage = cleanText($('#ASIN').attr("value")) || cleanText($('[name="ASIN"]').first().attr("value")) || cleanText($('[data-asin]').first().attr("data-asin"));
  const fromUrl = url.pathname.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1] || "";
  return (fromPage || fromUrl).toUpperCase();
}

function amazonImages($: cheerio.CheerioAPI, html: string) {
  const urls: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const decoded = value.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    if (/^https?:\/\//i.test(decoded)) urls.push(decoded);
  };

  const image = $("#landingImage");
  add(image.attr("data-old-hires"));
  add(image.attr("src"));

  const dynamic = image.attr("data-a-dynamic-image");
  if (dynamic) {
    try {
      Object.keys(JSON.parse(dynamic)).forEach(add);
    } catch {}
  }

  for (const el of $("#altImages img").toArray()) {
    const src = $(el).attr("src");
    if (src) add(src.replace(/\._[^.]+_\./, "."));
  }

  for (const match of html.matchAll(/"hiRes"\s*:\s*"(https?:\\?\/\\?\/[^"]+)"/g)) add(match[1]);
  return [...new Set(urls)].slice(0, 12);
}

function importAmazon(url: URL, html: string, $: cheerio.CheerioAPI) {
  if (/validateCaptcha|captchacharacters|Enter the characters you see below|Robot Check/i.test(html)) {
    throw new Error("Amazon returned a CAPTCHA/block page. Wait and try again with a normal product URL.");
  }

  const title = firstText($, ["#productTitle", "#title"]);
  if (!title) throw new Error("Amazon product title was not found. The page may be unavailable or blocked.");

  const brandRaw = firstText($, ["#bylineInfo", "a#bylineInfo", "#brand"]);
  const brand = brandRaw
    .replace(/^Visit the\s+/i, "")
    .replace(/\s+Store$/i, "")
    .replace(/^Brand:\s*/i, "")
    .trim();

  const bullets = $("#feature-bullets li span.a-list-item")
    .toArray()
    .map(el => cleanText($(el).text()))
    .filter(value => value && !/Make sure this fits/i.test(value));

  const longDescription = firstText($, ["#productDescription", "#aplus_feature_div", "#bookDescription_feature_div"]);
  const description = [...new Set([longDescription, ...bullets].filter(Boolean))].join("\n\n");
  const priceText = firstText($, [
    "#corePrice_feature_div .a-price .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    "#price_inside_buybox",
    ".a-price .a-offscreen"
  ]);

  const asin = amazonAsin(url, $);
  return {
    sourceUrl: url.toString(),
    title,
    description,
    brand,
    sku: asin,
    price: normalizePrice(priceText),
    currency: currencyFromPrice(priceText, url.hostname),
    images: amazonImages($, html)
  };
}

function importGeneric(url: URL, $: cheerio.CheerioAPI) {
  const ld: any = findProductJsonLd($);
  const title = ld?.name || $('meta[property="og:title"]').attr("content") || $("title").text().trim();
  const description = ld?.description || $('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content") || "";
  const imageRaw = ld?.image || $('meta[property="og:image"]').attr("content");
  const images = (Array.isArray(imageRaw) ? imageRaw : imageRaw ? [imageRaw] : [])
    .map((x: any) => typeof x === "string" ? x : x?.url)
    .filter(Boolean)
    .slice(0, 12);
  const brand = typeof ld?.brand === "string" ? ld.brand : ld?.brand?.name;
  const sku = ld?.sku || ld?.mpn || "";
  const offers = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;
  return {
    sourceUrl: url.toString(),
    title: cleanText(title),
    description: cleanText(description),
    brand: brand ? String(brand) : "",
    sku: sku ? String(sku) : "",
    price: offers?.price ? String(offers.price) : "",
    currency: offers?.priceCurrency ? String(offers.priceCurrency) : "",
    images
  };
}

export async function importFromUrl(rawUrl: string) {
  const startUrl = await assertSafeUrl(rawUrl);
  const { res, finalUrl } = await fetchSafe(startUrl);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) throw new Error("Source did not return an HTML page");
  const html = await readLimitedText(res);
  if (!res.ok && !isAmazonHost(finalUrl.hostname)) throw new Error("Source returned HTTP " + res.status);
  const $ = cheerio.load(html);
  if (isAmazonHost(finalUrl.hostname)) return importAmazon(finalUrl, html, $);
  if (!res.ok) throw new Error("Amazon returned HTTP " + res.status + ". It may be temporarily blocking automated requests.");
  return importGeneric(finalUrl, $);
}
