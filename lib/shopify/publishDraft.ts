import { shopifyGraphQL } from "./client";

const CREATE_PRODUCT = `#graphql
mutation CreateProduct($product: ProductCreateInput!) {
  productCreate(product: $product) {
    product { id title status handle }
    userErrors { field message }
  }
}`;

export async function publishDraftToShopify({ storeDomain, accessToken, product }: { storeDomain: string; accessToken: string; product: { title: string; descriptionHtml: string; seoTitle?: string | null; metaDescription?: string | null; tags: string[]; vendor?: string | null; productType?: string | null } }) {
  const data = await shopifyGraphQL<{ productCreate: { product: { id: string; title: string; status: string; handle: string } | null; userErrors: Array<{ field?: string[]; message: string }> } }>({
    storeDomain,
    accessToken,
    query: CREATE_PRODUCT,
    variables: { product: { title: product.title, descriptionHtml: product.descriptionHtml, status: "DRAFT", tags: product.tags, vendor: product.vendor || undefined, productType: product.productType || undefined, seo: { title: product.seoTitle || undefined, description: product.metaDescription || undefined } } }
  });
  if (data.productCreate.userErrors.length) throw new Error(data.productCreate.userErrors.map(e => e.message).join("; "));
  if (!data.productCreate.product) throw new Error("Shopify did not return a product");
  return data.productCreate.product;
}
