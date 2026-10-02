import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { importFromUrl } from "@/lib/sources/url";
import { rateLimit } from "@/lib/security/rate-limit";
import { assertSameOrigin } from "@/lib/security/origin";
import { db } from "@/lib/db";

const Schema = z.object({ url: z.string().url().max(2000) });

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const rl = rateLimit(`import:${user.id}`, 20);
    if (!rl.ok) return NextResponse.json({ error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` }, { status: 429 });
    const { url } = Schema.parse(await req.json());
    const productFacts = await importFromUrl(url);
    await db.activityLog.create({ data: { userId: user.id, action: "IMPORT_URL", detail: url } });
    return NextResponse.json({ productFacts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 });
  }
}
