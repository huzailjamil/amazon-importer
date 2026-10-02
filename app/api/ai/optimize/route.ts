import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { optimizeProduct } from "@/lib/ai/optimizer";
import { rateLimit } from "@/lib/security/rate-limit";
import { assertSameOrigin } from "@/lib/security/origin";
import { db } from "@/lib/db";

const Schema = z.object({ productFacts: z.record(z.string(), z.unknown()), profile: z.object({ market: z.string().max(50).optional(), language: z.string().max(30).optional(), tone: z.string().max(80).optional() }).optional() });

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const rl = rateLimit(`ai:${user.id}`, 20);
    if (!rl.ok) return NextResponse.json({ error: `AI rate limit exceeded. Try again in ${rl.retryAfter}s.` }, { status: 429 });
    const input = Schema.parse(await req.json());
    const product = await optimizeProduct(input);
    await db.activityLog.create({ data: { userId: user.id, action: "AI_OPTIMIZE" } });
    return NextResponse.json({ product });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Optimization failed" }, { status: 400 });
  }
}
