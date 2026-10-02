import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";

export async function POST(req: NextRequest) {
  try { assertSameOrigin(req); } catch {}
  await destroySession();
  return NextResponse.json({ ok: true });
}
