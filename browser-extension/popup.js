const status = document.getElementById("status");

async function readActiveAmazonProduct() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/([a-z0-9-]+\.)?amazon\./i.test(tab.url || "")) {
    throw new Error("Open an Amazon product page first.");
  }
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractAmazonProduct });
  if (!result?.title) throw new Error("No Amazon product was found on this page.");
  return result;
}

document.getElementById("copy").addEventListener("click", async () => {
  status.textContent = "Reading page…";
  try {
    const result = await readActiveAmazonProduct();
    await navigator.clipboard.writeText(JSON.stringify(result));
    status.textContent = `Copied “${result.title.slice(0, 45)}…” with ${result.images.length} images.`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not copy this product.";
  }
});

document.getElementById("send").addEventListener("click", async () => {
  status.textContent = "Reading product and opening dashboard…";
  try {
    const product = await readActiveAmazonProduct();
    const pending = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, product };
    await chrome.storage.local.set({ pendingAmazonProduct: pending });
    const dashboardUrl = "https://importer.legendsmarketing.co.uk/dashboard/import";
    const tabs = await chrome.tabs.query({ url: "https://importer.legendsmarketing.co.uk/*" });
    const dashboardTab = tabs.find(tab => tab.url?.includes("/dashboard/import"));
    if (dashboardTab?.id) {
      // Setting a tab to its current URL forces a full reload and can wipe the
      // dashboard form before the extension payload is accepted.
      await chrome.tabs.update(dashboardTab.id, { active: true });
      if (dashboardTab.windowId) await chrome.windows.update(dashboardTab.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: dashboardUrl, active: true });
    }
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not send this product.";
  }
});

function extractAmazonProduct() {
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const safeText = element => {
    if (!element) return "";
    const clone = element.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, template, form, button, input, textarea, select, svg").forEach(child => child.remove());
    return clean(clone.textContent);
  };
  const text = selectors => {
    for (const selector of selectors) {
      const value = safeText(document.querySelector(selector));
      if (value) return value;
    }
    return "";
  };
  const ownText = element => clean([...element?.childNodes || []]
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent)
    .join(" "));
  const titleElement = document.querySelector("#productTitle");
  const metaTitle = clean(document.querySelector("meta[property='og:title']")?.content);
  const title = (ownText(titleElement) || safeText(titleElement) || text(["h1.a-size-large"]) || metaTitle)
    .replace(/\s+(?:Download Images\s*[×x]\s*Product customization|GO PRO Gallery images|Regular Price \(original price\):).*$/i, "")
    .trim();
  const brand = text(["#bylineInfo", "#brand"]).replace(/^Visit the\s+/i, "").replace(/\s+Store$/i, "").replace(/^Brand:\s*/i, "");
  const usefulText = value => value && value.length <= 1500 &&
    !/[{}]|\.aplus-|function\s*\(|position\s*:|font-(?:family|size)\s*:|<img\b/i.test(value) &&
    !/^(?:Product description|From the brand)$/i.test(value);
  const bullets = [...document.querySelectorAll("#feature-bullets li span.a-list-item")]
    .map(safeText)
    .filter(usefulText);
  const descriptionParts = [
    ...document.querySelectorAll("#productDescription p, #productDescription_feature_div p, #bookDescription_feature_div p, #aplus_feature_div h1, #aplus_feature_div h2, #aplus_feature_div h3, #aplus_feature_div h4, #aplus_feature_div h5, #aplus_feature_div h6, #aplus_feature_div p, #aplus_feature_div li")
  ].map(safeText).filter(usefulText);
  const priceText = text(["#corePrice_feature_div .a-price .a-offscreen", "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen", "#priceblock_ourprice", "#priceblock_dealprice", ".a-price .a-offscreen"]);
  const asin = clean(document.querySelector("#ASIN")?.value || document.querySelector('[name="ASIN"]')?.value || location.pathname.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i)?.[1]).toUpperCase();
  const specifications = {};
  document.querySelectorAll("#productOverview_feature_div tr, #productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, #productDetails_detailBullets_sections1 tr, #technicalSpecifications_section_1 tr").forEach(row => {
    const key = safeText(row.querySelector("th, td:first-child")).replace(/:$/, "");
    const value = safeText(row.querySelector("td:last-child"));
    if (key && value && key !== value && key.length < 120 && value.length < 1000) specifications[key] = value;
  });
  document.querySelectorAll("#detailBullets_feature_div li").forEach(item => {
    const key = safeText(item.querySelector(".a-text-bold")).replace(/[:\u200e\u200f]+$/g, "");
    const whole = safeText(item);
    const value = clean(whole.slice(whole.indexOf(key) + key.length).replace(/^\s*:\s*/, ""));
    if (key && value && key.length < 120 && value.length < 1000) specifications[key] = value;
  });
  const categories = [...document.querySelectorAll("#wayfinding-breadcrumbs_feature_div li a, #wayfinding-breadcrumbs_container li a")]
    .map(safeText).filter(Boolean);
  const variationMap = new Map();
  const titleCase = value => clean(value).replace(/_name$/i, "").replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
  const dimensionKey = element => {
    const id = element?.id || "";
    return id.match(/^variation_(.+?)_name$/i)?.[1] ||
      id.match(/^native_dropdown_selected_(.+?)_name$/i)?.[1] ||
      clean(element?.dataset?.dimension || element?.getAttribute?.("data-dimension") || "").replace(/_name$/i, "");
  };
  const readOptionValue = option => {
    let dataValue = clean(option?.dataset?.value);
    if (dataValue.startsWith("{")) {
      try {
        const parsed = JSON.parse(dataValue);
        dataValue = clean(parsed.stringVal || parsed.value || parsed.name);
      } catch {}
    }
    return clean(
      option?.querySelector?.("img")?.alt ||
      option?.getAttribute?.("aria-label") ||
      option?.getAttribute?.("title") ||
      dataValue ||
      safeText(option?.querySelector?.(".a-button-text")) ||
      safeText(option)
    ).replace(/\s*(?:-|–)?\s*(?:Currently unavailable|Unavailable)$/i, "");
  };
  const addVariation = (key, explicitName, selected, optionNodes = []) => {
    if (!key) return;
    const normalizedKey = key.toLowerCase();
    const current = variationMap.get(normalizedKey) || { name: explicitName || titleCase(key), selected: "", options: [] };
    if (explicitName) current.name = explicitName;
    if (selected) current.selected = selected;
    optionNodes.forEach(option => {
      const value = readOptionValue(option);
      if (!value || /^-?\s*(?:select|choose)\b/i.test(value)) return;
      const owner = option.closest?.("[data-defaultasin], [data-asin]") || option;
      const asinValue = clean(owner?.dataset?.defaultasin || owner?.dataset?.asin || option.value).match(/[A-Z0-9]{10}/i)?.[0] || "";
      const unavailable = option.disabled ||
        option.getAttribute?.("aria-disabled") === "true" ||
        /unavailable|swatchunavailable|disabled/i.test(`${option.className || ""} ${owner?.className || ""}`);
      const selectedOption = option.selected ||
        option.checked ||
        option.getAttribute?.("aria-checked") === "true" ||
        /\bselected\b/i.test(`${option.className || ""} ${owner?.className || ""}`);
      const existing = current.options.find(item => item.value.toLowerCase() === value.toLowerCase());
      const next = { value, asin: asinValue, available: !unavailable, selected: !!selectedOption };
      if (existing) Object.assign(existing, { asin: existing.asin || next.asin, available: existing.available || next.available, selected: existing.selected || next.selected });
      else current.options.push(next);
      if (selectedOption && !current.selected) current.selected = value;
    });
    variationMap.set(normalizedKey, current);
  };

  document.querySelectorAll("[id^='variation_'][id$='_name'], select[id^='native_dropdown_selected_'][id$='_name']").forEach(group => {
    const key = dimensionKey(group);
    if (!key) return;
    const label = safeText(group.querySelector?.(".a-form-label")) ||
      safeText(document.querySelector(`label[for="${CSS.escape(group.id)}"]`)).replace(/[:\u200e\u200f]+$/g, "") ||
      titleCase(key);
    const select = group.matches?.("select") ? group : group.querySelector?.("select");
    const selected = select ? readOptionValue(select.selectedOptions?.[0]) : safeText(group.querySelector?.(".selection, .a-dropdown-prompt"));
    const nodes = select
      ? [...select.options]
      : [...group.querySelectorAll("li, option, [data-defaultasin], [data-asin], button[role='radio']")];
    addVariation(key, label, selected, nodes);
  });

  document.querySelectorAll("#twister_feature_div [role='radiogroup'], #twister_feature_div select").forEach(group => {
    const key = dimensionKey(group) ||
      clean(group.getAttribute("aria-label")).replace(/^(?:choose|select)\s+/i, "").replace(/\s+/g, "_") ||
      clean(group.closest("[id]")?.id).match(/(?:variation|twister)[_-](.+?)(?:_name)?$/i)?.[1];
    if (!key) return;
    const label = clean(group.getAttribute("aria-label")).replace(/^(?:choose|select)\s+/i, "") || titleCase(key);
    const nodes = group.matches("select") ? [...group.options] : [...group.querySelectorAll("[role='radio'], [data-defaultasin], [data-asin], button, li")];
    addVariation(key, label, "", nodes);
  });

  function readJsonValueAfter(source, property, opening, closing) {
    const propertyIndex = source.indexOf(`"${property}"`);
    if (propertyIndex < 0) return null;
    const startIndex = source.indexOf(opening, propertyIndex);
    if (startIndex < 0) return null;
    let depth = 0, quoted = false, escaped = false;
    for (let index = startIndex; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === opening) depth += 1;
      else if (character === closing && --depth === 0) {
        try { return JSON.parse(source.slice(startIndex, index + 1)); } catch { return null; }
      }
    }
    return null;
  }

  for (const script of document.scripts) {
    const source = script.textContent || "";
    if (!source.includes('"dimensionValuesDisplayData"')) continue;
    const dimensions = readJsonValueAfter(source, "dimensions", "[", "]");
    const displayData = readJsonValueAfter(source, "dimensionValuesDisplayData", "{", "}");
    if (!Array.isArray(dimensions) || !displayData || typeof displayData !== "object") continue;
    dimensions.forEach((dimension, index) => {
      const key = clean(dimension).replace(/_name$/i, "");
      const syntheticOptions = Object.entries(displayData).map(([optionAsin, values]) => {
        const value = Array.isArray(values) ? clean(values[index]) : "";
        return {
          value,
          dataset: { asin: optionAsin },
          className: optionAsin === asin ? "selected" : "",
          getAttribute: attribute => attribute === "aria-checked" ? String(optionAsin === asin) : null,
          closest: () => null,
          querySelector: () => null
        };
      }).filter(option => option.value);
      addVariation(key, titleCase(key), "", syntheticOptions);
    });
    break;
  }
  const variations = [...variationMap.values()].filter(dimension => dimension.options.length);

  const sourceTags = [...new Set([brand, ...categories, ...variations.map(item => item.name)].map(clean).filter(Boolean))].slice(0, 30);
  const rating = text(["#acrPopover .a-icon-alt", "#averageCustomerReviews .a-icon-alt"]);
  const reviewCount = text(["#acrCustomerReviewText"]);
  const availability = text(["#availability", "#outOfStock"]);
  const images = [];
  const add = value => {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return;
    images.push(value.replace(/\._[^.]+_\.(?=[a-z]{3,4}(?:$|\?))/i, "."));
  };
  const main = document.querySelector("#landingImage");
  add(main?.dataset.oldHires);
  add(main?.src);
  try { Object.keys(JSON.parse(main?.dataset.aDynamicImage || "{}")).forEach(add); } catch {}
  document.querySelectorAll("#altImages img").forEach(image => add(image.src));
  document.querySelectorAll("#aplus_feature_div img").forEach(image => {
    add(image.dataset.src);
    add(image.src);
  });
  const videos = [];
  const addVideo = (url, poster = "") => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
    videos.push({ url, poster: /^https?:\/\//i.test(poster) ? poster : "" });
  };
  document.querySelectorAll("video").forEach(video => {
    addVideo(video.currentSrc || video.src || video.querySelector("source")?.src, video.poster);
  });
  document.querySelectorAll("[data-video-url], [data-video-src]").forEach(element => {
    addVideo(element.dataset.videoUrl || element.dataset.videoSrc, element.dataset.poster || element.dataset.thumbnail || "");
  });
  for (const script of document.scripts) {
    const content = script.textContent || "";
    for (const match of content.matchAll(/https?:\\?\/\\?\/[^"'\\\s]+\.(?:mp4|m3u8)(?:\?[^"'\\\s]*)?/gi)) addVideo(match[0].replace(/\\\//g, "/").replace(/\\u0026/g, "&"));
  }
  let currency = "";
  if (priceText.includes("£")) currency = "GBP";
  else if (priceText.includes("€")) currency = "EUR";
  else if (priceText.includes("₹")) currency = "INR";
  else if (priceText.includes("د.إ")) currency = "AED";
  else if (priceText.includes("$")) currency = location.hostname.endsWith(".ca") ? "CAD" : location.hostname.endsWith(".com.au") ? "AUD" : "USD";
  return {
    sourceUrl: asin ? `${location.origin}/dp/${asin}` : location.href,
    title,
    description: [...new Set([...descriptionParts, ...bullets])].join("\n\n"),
    brand,
    sku: asin,
    price: priceText.match(/[\d.,]+/)?.[0] || "",
    currency,
    images: [...new Set(images)].slice(0, 20),
    videos: [...new Map(videos.map(video => [video.url, video])).values()].slice(0, 12),
    features: bullets,
    specifications,
    categories,
    tags: sourceTags,
    productType: categories.at(-1) || "",
    variations,
    availability,
    rating,
    reviewCount
  };
}
