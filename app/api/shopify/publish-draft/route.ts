import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/security/crypto";
import { publishDraftToShopify } from "@/lib/shopify/publishDraft";
import { assertSameOrigin } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/rate-limit";

const Schema = z.object({ productId: z.string(), storeId: z.string() });

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const rl = rateLimit(`publish:${user.id}`, 10);
    if (!rl.ok) return NextResponse.json({ error: `Publish rate limit exceeded. Try again in ${rl.retryAfter}s.` }, { status: 429 });
    const { productId, storeId } = Schema.parse(await req.json());
    const [product, store] = await Promise.all([
      db.product.findFirst({ where: { id: productId, userId: user.id } }),
      db.store.findFirst({ where: { id: storeId, userId: user.id } })
    ]);
    if (!product || !store) return NextResponse.json({ error: "Product or store not found" }, { status: 404 });
    const created = await publishDraftToShopify({
      storeDomain: store.domain,
      accessToken: decryptSecret(store.accessTokenEnc),
      product: {
        title: product.title,
        descriptionHtml: product.descriptionHtml,
        seoTitle: product.seoTitle,
        metaDescription: product.metaDescription,
        tags: Array.isArray(product.tags) ? product.tags as string[] : [],
        vendor: product.vendor,
        productType: product.productType,
        images: Array.isArray(product.images) ? product.images as string[] : [],
        imageAltText: Array.isArray(product.imageAltText) ? product.imageAltText as string[] : []
      }
    });
    await db.product.update({ where: { id: product.id }, data: { storeId: store.id, status: "SHOPIFY_DRAFT", shopifyProductId: created.id, lastError: null } });
    await db.activityLog.create({ data: { userId: user.id, action: "SHOPIFY_DRAFT_CREATED", detail: `${store.domain} ${created.id}` } });
    return NextResponse.json({ product: created });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publish failed" }, { status: 400 });
  }
}
