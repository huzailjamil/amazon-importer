import { shopifyGraphQL } from "./client";

const SET_PRODUCT = `#graphql
mutation SetProduct($input: ProductSetInput!, $synchronous: Boolean!) {
  productSet(input: $input, synchronous: $synchronous) {
    product { id title status handle }
    userErrors { field message }
  }
}`;

type VariationOption = { value?: unknown; asin?: unknown; available?: unknown; selected?: unknown };
type Variation = { name?: unknown; selected?: unknown; options?: unknown };
type RawProductData = { price?: unknown; sku?: unknown; variations?: unknown; videos?: unknown };
type PublishProduct = {
  title: string;
  descriptionHtml: string;
  seoTitle?: string | null;
  metaDescription?: string | null;
  tags: string[];
  vendor?: string | null;
  productType?: string | null;
  images: string[];
  imageAltText: string[];
  rawData?: unknown;
};

function clean(value: unknown, max = 255) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function variationInput(raw: RawProductData) {
  if (!Array.isArray(raw.variations)) return {};
  const dimensions = (raw.variations as Variation[]).map((dimension, index) => {
    const name = clean(dimension.name) || `Option ${index + 1}`;
    const rawOptions = Array.isArray(dimension.options) ? dimension.options as VariationOption[] : [];
    const options = rawOptions
      .filter(option => option?.available !== false)
      .map(option => ({ value: clean(option.value), asin: clean(option.asin), selected: option.selected === true }))
      .filter(option => option.value);
    const unique = [...new Map(options.map(option => [option.value.toLowerCase(), option])).values()];
    return { name, selected: clean(dimension.selected), options: unique };
  }).filter(dimension => dimension.options.length).slice(0, 3);

  if (!dimensions.length) return {};
  const combinations: Array<Array<{ name: string; value: string; asin: string; selected: boolean }>> = [[]];
  for (const dimension of dimensions) {
    const next: typeof combinations = [];
    for (const combination of combinations) {
      for (const option of dimension.options) {
        next.push([...combination, { name: dimension.name, ...option }]);
        if (next.length >= 100) break;
      }
      if (next.length >= 100) break;
    }
    combinations.splice(0, combinations.length, ...next);
  }

  const priceText = clean(raw.price, 40).replace(/,/g, "");
  const numericPrice = priceText ? Number(priceText) : Number.NaN;
  const currentSku = clean(raw.sku);
  return {
    productOptions: dimensions.map((dimension, position) => ({
      name: dimension.name,
      position: position + 1,
      values: dimension.options.map(option => ({ name: option.value }))
    })),
    variants: combinations.map(combination => {
      const isSelected = combination.every(option => option.selected || dimensions.find(dimension => dimension.name === option.name)?.selected === option.value);
      const optionAsins = [...new Set(combination.map(option => option.asin).filter(Boolean))];
      return {
        optionValues: combination.map(option => ({ optionName: option.name, name: option.value })),
        ...(Number.isFinite(numericPrice) && numericPrice >= 0 ? { price: numericPrice } : {}),
        ...(dimensions.length === 1 && optionAsins[0] ? { sku: optionAsins[0] } : isSelected && currentSku ? { sku: currentSku } : {})
      };
    })
  };
}

export async function publishDraftToShopify({ storeDomain, accessToken, product }: { storeDomain: string; accessToken: string; product: PublishProduct }) {
  const raw = product.rawData && typeof product.rawData === "object" ? product.rawData as RawProductData : {};
  const files = product.images
    .filter(url => /^https?:\/\//i.test(url))
    .slice(0, 20)
    .map((originalSource, index) => ({
      originalSource,
      contentType: "IMAGE",
      filename: `imported-product-${index + 1}.${originalSource.match(/\.([a-z0-9]{3,4})(?:\?|$)/i)?.[1] || "jpg"}`,
      alt: product.imageAltText[index] || product.title
    }));
  const videoFiles = (Array.isArray(raw.videos) ? raw.videos : [])
    .map(video => typeof video === "string" ? video : video && typeof video === "object" && "url" in video ? (video as { url?: unknown }).url : "")
    .filter((url): url is string => typeof url === "string" && /^https?:\/\/.*\.mp4(?:\?|$)/i.test(url))
    .slice(0, 4)
    .map((originalSource, index) => ({
      originalSource,
      contentType: "VIDEO",
      filename: `imported-product-video-${index + 1}.mp4`,
      alt: product.title
    }));
  const data = await shopifyGraphQL<{ productSet: { product: { id: string; title: string; status: string; handle: string } | null; userErrors: Array<{ field?: string[]; message: string }> } }>({
    storeDomain,
    accessToken,
    query: SET_PRODUCT,
    variables: {
      synchronous: true,
      input: {
        title: product.title,
        descriptionHtml: product.descriptionHtml,
        status: "DRAFT",
        tags: product.tags,
        vendor: product.vendor || undefined,
        productType: product.productType || undefined,
        seo: { title: product.seoTitle || undefined, description: product.metaDescription || undefined },
        files: [...files, ...videoFiles],
        ...variationInput(raw)
      }
    }
  });
  if (data.productSet.userErrors.length) throw new Error(data.productSet.userErrors.map(error => error.message).join("; "));
  if (!data.productSet.product) throw new Error("Shopify did not return a product");
  return data.productSet.product;
}
