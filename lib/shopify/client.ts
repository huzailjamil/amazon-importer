export async function shopifyGraphQL<T>({ storeDomain, accessToken, query, variables }: { storeDomain: string; accessToken: string; query: string; variables?: Record<string, unknown> }): Promise<T> {
  const version = process.env.SHOPIFY_API_VERSION || "2026-07";
  const response = await fetch(`https://${storeDomain}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) throw new Error(JSON.stringify(payload.errors ?? payload));
  return payload.data as T;
}
