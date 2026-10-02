import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

function normalizeShop(raw: string) {
  const value = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) throw new Error("Enter a valid *.myshopify.com domain");
  return value;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.redirect(new URL("/login", req.url));
    const shop = normalizeShop(req.nextUrl.searchParams.get("shop") || "");
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const appUrl = process.env.APP_URL;
    if (!clientId || !appUrl) throw new Error("Shopify OAuth is not configured");
    const state = randomBytes(24).toString("hex");
    const jar = await cookies();
    jar.set("shopify_oauth_state", `${state}:${user.id}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
    const redirectUri = `${appUrl.replace(/\/$/, "")}/api/shopify/callback`;
    const params = new URLSearchParams({ client_id: clientId, scope: process.env.SHOPIFY_SCOPES || "read_products,write_products", redirect_uri: redirectUri, state });
    return NextResponse.redirect(`https://${shop}/admin/oauth/authorize?${params.toString()}`);
  } catch (error) {
    return NextResponse.redirect(new URL(`/dashboard/stores?error=${encodeURIComponent(error instanceof Error ? error.message : "Connection failed")}`, req.url));
  }
}
