import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/rate-limit";

const Schema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = rateLimit(`login:${ip}`, 15, 15 * 60 * 1000);
    if (!rl.ok) return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
    const input = Schema.parse(await req.json());
    const user = await db.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !user.isActive || !(await verifyPassword(input.password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    await createSession(user.id);
    await db.activityLog.create({ data: { userId: user.id, action: "LOGIN", ip } });
    return NextResponse.json({ ok: true, role: user.role });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Login failed" }, { status: 400 });
  }
}
