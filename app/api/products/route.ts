import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security/origin";

const Schema = z.object({
  sourceUrl: z.string().max(2000).optional().or(z.literal("")),
  title: z.string().min(2).max(255),
  descriptionHtml: z.string().max(100000),
  vendor: z.string().max(255).optional(),
  productType: z.string().max(255).optional(),
  seoTitle: z.string().max(255).optional(),
  metaDescription: z.string().max(1000).optional(),
  primaryKeyword: z.string().max(255).optional(),
  tags: z.array(z.string()).max(30),
  secondaryKeywords: z.array(z.string()).max(30),
  imageAltText: z.array(z.string()).max(30),
  images: z.array(z.string()).max(30),
  seoScore: z.number().min(0).max(100).optional()
});

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const p = Schema.parse(await req.json());
    const product = await db.product.create({ data: {
      userId: user.id,
      sourceType: p.sourceUrl ? "url" : "manual",
      sourceUrl: p.sourceUrl || null,
      title: p.title,
      descriptionHtml: p.descriptionHtml,
      vendor: p.vendor || null,
      productType: p.productType || null,
      seoTitle: p.seoTitle || null,
      metaDescription: p.metaDescription || null,
      primaryKeyword: p.primaryKeyword || null,
      tags: p.tags,
      secondaryKeywords: p.secondaryKeywords,
      imageAltText: p.imageAltText,
      images: p.images,
      seoScore: p.seoScore ?? null
    } });
    return NextResponse.json({ product: { id: product.id, title: product.title } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Save failed" }, { status: 400 });
  }
}
