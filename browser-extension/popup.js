const status = document.getElementById("status");

document.getElementById("copy").addEventListener("click", async () => {
  status.textContent = "Reading page…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/([a-z0-9-]+\.)?amazon\./i.test(tab.url || "")) {
      throw new Error("Open an Amazon product page first.");
    }
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractAmazonProduct });
    if (!result?.title) throw new Error("No Amazon product was found on this page.");
    await navigator.clipboard.writeText(JSON.stringify(result));
    status.textContent = `Copied “${result.title.slice(0, 45)}…” with ${result.images.length} images.`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not copy this product.";
  }
});

function extractAmazonProduct() {
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const text = selectors => {
    for (const selector of selectors) {
      const value = clean(document.querySelector(selector)?.textContent);
      if (value) return value;
    }
    return "";
  };
  const title = text(["#productTitle", "#title"]);
  const brand = text(["#bylineInfo", "#brand"]).replace(/^Visit the\s+/i, "").replace(/\s+Store$/i, "").replace(/^Brand:\s*/i, "");
  const bullets = [...document.querySelectorAll("#feature-bullets li span.a-list-item")].map(element => clean(element.textContent)).filter(Boolean);
  const longDescription = text(["#productDescription", "#aplus_feature_div", "#bookDescription_feature_div"]);
  const priceText = text(["#corePrice_feature_div .a-price .a-offscreen", "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen", "#priceblock_ourprice", "#priceblock_dealprice", ".a-price .a-offscreen"]);
  const asin = clean(document.querySelector("#ASIN")?.value || document.querySelector('[name="ASIN"]')?.value || location.pathname.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i)?.[1]).toUpperCase();
  const images = [];
  const add = value => { if (typeof value === "string" && /^https?:\/\//i.test(value)) images.push(value.replace(/\._[^.]+_\./, ".")); };
  const main = document.querySelector("#landingImage");
  add(main?.dataset.oldHires);
  add(main?.src);
  try { Object.keys(JSON.parse(main?.dataset.aDynamicImage || "{}")).forEach(add); } catch {}
  document.querySelectorAll("#altImages img").forEach(image => add(image.src));
  let currency = "";
  if (priceText.includes("£")) currency = "GBP";
  else if (priceText.includes("€")) currency = "EUR";
  else if (priceText.includes("₹")) currency = "INR";
  else if (priceText.includes("د.إ")) currency = "AED";
  else if (priceText.includes("$")) currency = location.hostname.endsWith(".ca") ? "CAD" : location.hostname.endsWith(".com.au") ? "AUD" : "USD";
  return {
    sourceUrl: location.href,
    title,
    description: [...new Set([longDescription, ...bullets].filter(Boolean))].join("\n\n"),
    brand,
    sku: asin,
    price: priceText.match(/[\d.,]+/)?.[0] || "",
    currency,
    images: [...new Set(images)].slice(0, 12)
  };
}
