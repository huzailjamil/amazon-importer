import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/rate-limit";

const Schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(190),
  password: z.string().min(10).max(128)
});

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    if (process.env.ALLOW_REGISTRATION === "false") return NextResponse.json({ error: "Registration is currently disabled" }, { status: 403 });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.ok) return NextResponse.json({ error: "Too many registration attempts" }, { status: 429 });
    const input = Schema.parse(await req.json());
    const email = input.email.toLowerCase();
    const exists = await db.user.findUnique({ where: { email } });
    if (exists) return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    const user = await db.user.create({ data: { name: input.name, email, passwordHash: await hashPassword(input.password) } });
    await db.activityLog.create({ data: { userId: user.id, action: "REGISTER", ip } });
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Registration failed" }, { status: 400 });
  }
}
