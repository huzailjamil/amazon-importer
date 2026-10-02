import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/security/crypto";

function verifyHmac(url: URL, secret: string) {
  const hmac = url.searchParams.get("hmac") || "";
  const pairs: string[] = [];
  for (const [key, value] of url.searchParams.entries()) if (key !== "hmac" && key !== "signature") pairs.push(`${key}=${value}`);
  const message = pairs.sort().join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return hmac.length === digest.length && timingSafeEqual(Buffer.from(hmac), Buffer.from(digest));
}

export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL || req.nextUrl.origin;
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Your login session expired");
    const secret = process.env.SHOPIFY_CLIENT_SECRET || "";
    const clientId = process.env.SHOPIFY_CLIENT_ID || "";
    if (!secret || !clientId) throw new Error("Shopify OAuth is not configured");
    if (!verifyHmac(req.nextUrl, secret)) throw new Error("Invalid Shopify callback signature");
    const shop = req.nextUrl.searchParams.get("shop") || "";
    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";
    const jar = await cookies();
    const stateCookie = jar.get("shopify_oauth_state")?.value || "";
    const [expectedState, expectedUser] = stateCookie.split(":");
    if (!state || state !== expectedState || user.id !== expectedUser) throw new Error("OAuth state validation failed");
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) throw new Error("Invalid Shopify store domain");
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: secret, code }) });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) throw new Error("Shopify token exchange failed");
    await db.store.upsert({ where: { userId_domain: { userId: user.id, domain: shop } }, update: { accessTokenEnc: encryptSecret(tokenJson.access_token), name: shop.replace(".myshopify.com", "") }, create: { userId: user.id, domain: shop, name: shop.replace(".myshopify.com", ""), accessTokenEnc: encryptSecret(tokenJson.access_token) } });
    jar.delete("shopify_oauth_state");
    await db.activityLog.create({ data: { userId: user.id, action: "SHOPIFY_CONNECTED", detail: shop } });
    return NextResponse.redirect(`${appUrl.replace(/\/$/, "")}/dashboard/stores?connected=1`);
  } catch (error) {
    return NextResponse.redirect(`${appUrl.replace(/\/$/, "")}/dashboard/stores?error=${encodeURIComponent(error instanceof Error ? error.message : "Shopify connection failed")}`);
  }
}
